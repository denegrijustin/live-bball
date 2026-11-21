/**
 * Game-result rating solver (no box scores, injuries, weather or lines).
 *
 *  Stage 1a  Weighted ridge least squares on capped margins:   m = P_home - P_away + HFA*venue
 *  Stage 1b  Weighted ridge least squares on points scored:    pts = mu + O_team + D_opp +/- eta*venue
 *  Stage 2   Iteratively reweighted least squares (penalised logistic regression) on wins, started from
 *            stage 1a:  logit P(home win) = b_home - b_away + g*venue
 *
 * Every game is weighted by exponential recency decay 0.5^(age/halfLife). Ridge terms shrink thin-sample
 * teams toward the league mean; they also pin the otherwise unidentified mean of the ratings.
 *
 * Defence is expressed as points ALLOWED (lower is better) so it lines up with TeamMetrics.defRating.
 */

export interface GameRow {
  t: number; // epoch ms
  h: number; // home team index
  a: number; // away team index
  hs: number;
  as: number;
  neutral: boolean;
}

export interface SolverOptions {
  asOf: number; // epoch ms: recency weights are measured from here
  halfLifeDays: number;
  ridgeMargin: number; // ridge on stage 1a, in margin^2 units per team
  ridgePoints: number; // ridge on stage 1b offence/defence
  ridgeLogit: number; // ridge on stage 2 (logit units)
  marginCap: number; // blow-out cap for stage 1a
  /**
   * Gaussian prior on total home advantage (points). With a few hundred games the data alone gives a noisy
   * estimate (SE ~ 1 point), so it is shrunk toward the league constant. noiseSd is the prior margin SD used to
   * convert the prior into the same units as each stage's normal equations.
   */
  hfaPrior: number;
  hfaPriorSd: number;
  noiseSd: number;
}

export interface SolverResult {
  n: number;
  mu: number; // average points scored per team per game
  hfa: number; // total home advantage in points (home scorer +hfa/2, away scorer -hfa/2)
  off: Float64Array; // points scored vs an average defence
  def: Float64Array; // points allowed vs an average offence (lower is better)
  margin: Float64Array; // stage 1a rating (points)
  overall: Float64Array; // stage 2 logistic performance rating, converted to points
  games: Int32Array;
  weight: Float64Array; // total recency weight per team
  marginSd: number;
  totalSd: number;
  teamResidSd: Float64Array; // shrunk per-team margin residual SD
  avgTotal: number;
  teamAvgTotal: Float64Array;
  oppAvg: Float64Array; // weighted mean opponent overall rating
  iterations: number;
}

/** Solves A x = b for symmetric positive-definite A (n x n, row-major) via Cholesky. Mutates both inputs. */
export function choleskySolve(A: Float64Array, b: Float64Array, n: number): Float64Array {
  for (let j = 0; j < n; j++) {
    let d = A[j * n + j];
    for (let k = 0; k < j; k++) d -= A[j * n + k] * A[j * n + k];
    if (d <= 1e-12) throw new Error(`matrix not positive definite at ${j}`);
    const ljj = Math.sqrt(d);
    A[j * n + j] = ljj;
    for (let i = j + 1; i < n; i++) {
      let s = A[i * n + j];
      for (let k = 0; k < j; k++) s -= A[i * n + k] * A[j * n + k];
      A[i * n + j] = s / ljj;
    }
  }
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= A[i * n + k] * b[k];
    b[i] = s / A[i * n + i];
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let k = i + 1; k < n; k++) s -= A[k * n + i] * b[k];
    b[i] = s / A[i * n + i];
  }
  return b;
}

/** Accumulates w * x x^T into A and w * y * x into b for a sparse row given as index/value pairs. */
function accumulate(
  A: Float64Array,
  b: Float64Array,
  n: number,
  idx: number[],
  val: number[],
  y: number,
  w: number,
): void {
  for (let p = 0; p < idx.length; p++) {
    b[idx[p]] += w * val[p] * y;
    for (let q = 0; q < idx.length; q++) A[idx[p] * n + idx[q]] += w * val[p] * val[q];
  }
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export function solveRatings(nTeams: number, games: GameRow[], o: SolverOptions): SolverResult {
  const n = nTeams;
  const N = games.length;
  const w = new Float64Array(N);
  const DAY = 86400000;
  for (let g = 0; g < N; g++) w[g] = Math.pow(0.5, Math.max(0, o.asOf - games[g].t) / DAY / o.halfLifeDays);

  // ---- Stage 1a: margin ----
  const nm = n + 1; // P[0..n-1], HFA
  const Am = new Float64Array(nm * nm);
  const bm = new Float64Array(nm);
  for (let g = 0; g < N; g++) {
    const G = games[g];
    const v = G.neutral ? 0 : 1;
    const y = clamp(G.hs - G.as, -o.marginCap, o.marginCap);
    accumulate(Am, bm, nm, [G.h, G.a, n], [1, -1, v], y, w[g]);
  }
  for (let i = 0; i < n; i++) Am[i * nm + i] += o.ridgeMargin;
  const lamM = (o.noiseSd * o.noiseSd) / (o.hfaPriorSd * o.hfaPriorSd);
  Am[n * nm + n] += lamM;
  bm[n] += lamM * o.hfaPrior;
  const solM = choleskySolve(Am, bm, nm);
  const P = Float64Array.from(solM.subarray(0, n));
  const hfaMargin = solM[n];

  // ---- Stage 1b: points -> offence / defence ----
  const np = 2 * n + 2; // O[0..n-1], D[n..2n-1], eta, mu
  const ETA = 2 * n;
  const MU = 2 * n + 1;
  const Ap = new Float64Array(np * np);
  const bp = new Float64Array(np);
  for (let g = 0; g < N; g++) {
    const G = games[g];
    const v = G.neutral ? 0 : 1;
    accumulate(Ap, bp, np, [G.h, n + G.a, ETA, MU], [1, 1, v, 1], G.hs, w[g]);
    accumulate(Ap, bp, np, [G.a, n + G.h, ETA, MU], [1, 1, -v, 1], G.as, w[g]);
  }
  for (let i = 0; i < 2 * n; i++) Ap[i * np + i] += o.ridgePoints;
  // eta is the per-scorer half of the home advantage: prior mean hfa/2, prior sd hfaSd/2, obs variance ~ noiseSd^2/2.
  const lamE = (2 * o.noiseSd * o.noiseSd) / (o.hfaPriorSd * o.hfaPriorSd);
  Ap[ETA * np + ETA] += lamE;
  bp[ETA] += (lamE * o.hfaPrior) / 2;
  Ap[MU * np + MU] += 1e-6;
  const solP = choleskySolve(Ap, bp, np);
  const mu = solP[MU];
  const eta = solP[ETA];
  const off = new Float64Array(n);
  const def = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    off[i] = mu + solP[i];
    def[i] = mu + solP[n + i];
  }

  // Residuals of the off/def model drive the calibrated spreads, totals and team consistency.
  const teamR2 = new Float64Array(n);
  const teamW = new Float64Array(n);
  const teamGames = new Int32Array(n);
  const teamTot = new Float64Array(n);
  let sw = 0;
  let sr2m = 0;
  let sr2t = 0;
  let sTot = 0;
  for (let g = 0; g < N; g++) {
    const G = games[g];
    const v = G.neutral ? 0 : 1;
    const predH = off[G.h] + def[G.a] - mu + eta * v;
    const predA = off[G.a] + def[G.h] - mu - eta * v;
    const rm = G.hs - G.as - (predH - predA);
    const rt = G.hs + G.as - (predH + predA);
    sw += w[g];
    sr2m += w[g] * rm * rm;
    sr2t += w[g] * rt * rt;
    sTot += w[g] * (G.hs + G.as);
    for (const t of [G.h, G.a]) {
      teamR2[t] += w[g] * rm * rm;
      teamW[t] += w[g];
      teamGames[t]++;
      teamTot[t] += w[g] * (G.hs + G.as);
    }
  }
  // Degrees-of-freedom correction: roughly one effective parameter per team after ridge shrinkage.
  const dof = Math.min(1.3, Math.sqrt(N / Math.max(N - n, N * 0.5)));
  const marginSd = Math.sqrt(sr2m / sw) * dof;
  const totalSd = Math.sqrt(sr2t / sw) * dof;
  const avgTotal = sTot / sw;

  const K = 6; // pseudo-games of league-average variance
  const teamResidSd = new Float64Array(n);
  const teamAvgTotal = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    teamResidSd[i] = Math.sqrt((teamR2[i] + K * marginSd * marginSd) / (teamW[i] + K));
    teamAvgTotal[i] = (teamTot[i] + K * avgTotal) / (teamW[i] + K);
  }

  // ---- Stage 2: IRLS logistic regression on win/loss, started from the stage-1a margins ----
  const sigma = marginSd / 1.702; // logit(p) = margin / sigma  <=>  p = Phi(margin / marginSd) (probit ~ logit)
  const sigma0 = o.noiseSd / 1.702;
  const lamG = (sigma0 * sigma0) / (o.hfaPriorSd * o.hfaPriorSd);
  const nl = n + 1;
  const beta = new Float64Array(nl);
  for (let i = 0; i < n; i++) beta[i] = P[i] / sigma;
  beta[n] = hfaMargin / sigma;
  let it = 0;
  for (; it < 40; it++) {
    const A = new Float64Array(nl * nl);
    const b = new Float64Array(nl);
    for (let g = 0; g < N; g++) {
      const G = games[g];
      const v = G.neutral ? 0 : 1;
      const eta2 = beta[G.h] - beta[G.a] + beta[n] * v;
      const pi = clamp(sigmoid(eta2), 1e-4, 1 - 1e-4);
      const y = G.hs > G.as ? 1 : G.hs < G.as ? 0 : 0.5;
      const V = pi * (1 - pi);
      const z = eta2 + (y - pi) / V;
      accumulate(A, b, nl, [G.h, G.a, n], [1, -1, v], z, w[g] * V);
    }
    for (let i = 0; i < n; i++) A[i * nl + i] += o.ridgeLogit;
    A[n * nl + n] += lamG;
    b[n] += (lamG * o.hfaPrior) / sigma0;
    const next = choleskySolve(A, b, nl);
    let delta = 0;
    for (let i = 0; i < nl; i++) delta = Math.max(delta, Math.abs(next[i] - beta[i]));
    beta.set(next);
    if (delta < 1e-6) {
      it++;
      break;
    }
  }
  const overall = new Float64Array(n);
  for (let i = 0; i < n; i++) overall[i] = beta[i] * sigma;

  // Weighted mean opponent rating (strength of schedule input).
  const oppSum = new Float64Array(n);
  for (let g = 0; g < N; g++) {
    const G = games[g];
    oppSum[G.h] += w[g] * overall[G.a];
    oppSum[G.a] += w[g] * overall[G.h];
  }
  const oppAvg = new Float64Array(n);
  for (let i = 0; i < n; i++) oppAvg[i] = teamW[i] > 0 ? oppSum[i] / teamW[i] : 0;

  return {
    n,
    mu,
    hfa: 2 * eta,
    off,
    def,
    margin: P,
    overall,
    games: teamGames,
    weight: teamW,
    marginSd,
    totalSd,
    teamResidSd,
    avgTotal,
    teamAvgTotal,
    oppAvg,
    iterations: it,
  };
}
