/**
 * NCAA tournament selection model and game-leverage engine for college basketball.
 *
 * Each simulation:
 *  1. draws a strength shock per team (early-season ratings are uncertain; shocks are shared across a team's games),
 *  2. plays out every remaining regular-season game,
 *  3. runs each conference's tournament (top 8 by simulated conference wins, single elimination) -> automatic bids,
 *  4. fills the remaining at-large slots by a selection score = rating + lambda * (wins above expectation) + committee noise,
 *  5. records, for every remaining game, who won and whether each side made the field.
 *
 * Leverage of a game for a team = P(bid | team wins that game) - P(bid | team loses it). Two estimators run side by side:
 *  - split:  condition the simulations on the game's realised outcome. Unbiased and includes the effect on conference
 *            seeding, but very noisy when one outcome is rare (a heavy favourite losing);
 *  - RB:     Rao-Blackwellised. Every simulation contributes to both outcomes, weighted by that outcome's probability
 *            given the shocks, and the team's at-large status is recomputed counterfactually (its selection score +/-
 *            one win against that simulation's cutoff). Low variance, but it cannot see conference-seeding effects.
 * Both include what a result reveals about a team's true strength (via the shared shock), not just the extra win.
 *
 * Simplifications (stated in the UI): the committee is a score threshold, not NET/quad logic; conference tournaments
 * are a top-8 bracket without byes; no play-in (First Four) distinction beyond seed lines.
 */
import { normalCDF } from './mathModel';
import { mulberry32 } from './monteCarlo';

export interface TourneyTeam {
  index: number;
  conference: string;
  wins: number; // current wins
  confWins: number; // current conference wins
  rating: number; // overall performance rating (points)
  sigma: number; // rating uncertainty (points), shrinking with games played
}

export interface TourneyGame {
  home: number;
  away: number;
  mean: number; // expected margin, home minus away (venue included)
  conf: boolean;
}

export interface TourneyOptions {
  iterations: number;
  seed: number;
  marginSd: number;
  /** Expected neutral-court margin of i over j (points). */
  neutralMargin: (i: number, j: number) => number;
  lambdaPerWin: number; // rating points per win above expectation
  committeeNoise: number; // sd of committee judgement, in rating points
  fieldSize: number; // 68
  bracketSize: number; // conference tournament participants (8)
  /** Verification aid: force one remaining game's result in every simulation. */
  force?: { game: number; homeWins: boolean };
}

export interface TeamTourneyOdds {
  bidPct: number;
  autoBidPct: number;
  atLargePct: number;
  avgSeed: number | null;
  avgWins: number;
}

export interface GameLeverageStat {
  nHomeWin: number;
  nAwayWin: number;
  homeBidIfWin: number | null; // split estimator, probabilities 0..1
  homeBidIfLoss: number | null;
  awayBidIfWin: number | null;
  awayBidIfLoss: number | null;
  rbHomeBidIfWin: number | null; // Rao-Blackwellised estimator
  rbHomeBidIfLoss: number | null;
  rbAwayBidIfWin: number | null;
  rbAwayBidIfLoss: number | null;
  rbEffN: number; // effective sample size of the less-likely outcome's weights
  // Unweighted counterfactual (forced-outcome equivalent): every simulation used for both outcomes. Lowest variance,
  // but excludes what the result says about team strength and conference-seeding effects.
  cfHomeBidIfWin: number;
  cfHomeBidIfLoss: number;
  cfAwayBidIfWin: number;
  cfAwayBidIfLoss: number;
}

export interface TourneyResult {
  teams: TeamTourneyOdds[];
  games: GameLeverageStat[];
  autoBidConferences: string[];
  atLargeSlots: number;
}

/**
 * Blends the low-variance counterfactual estimate with the weighted (Rao-Blackwellised) estimate, which also reflects
 * what a result reveals about team strength. The weighted estimate gets weight n / (n + k): near 1 for toss-ups,
 * small for heavy favourites where its effective sample is tiny.
 */
export function blendLeverage(cf: number, rb: number | null, effN: number, k = 500): number {
  if (rb === null) return cf;
  const w = effN / (effN + k);
  return cf + w * (rb - cf);
}

const SEED_ORDER = [1, 8, 4, 5, 2, 7, 3, 6]; // bracket slot order for a standard 8-team bracket

export function simulateTourney(teams: TourneyTeam[], games: TourneyGame[], o: TourneyOptions): TourneyResult {
  const n = teams.length;
  const G = games.length;
  const N = o.iterations;
  const rng = mulberry32(o.seed);

  // Box-Muller with a cached spare so each uniform pair yields two normals.
  let spare = 0;
  let hasSpare = false;
  const gauss = (): number => {
    if (hasSpare) {
      hasSpare = false;
      return spare;
    }
    let u1 = rng();
    while (u1 === 0) u1 = rng();
    const u2 = rng();
    const r = Math.sqrt(-2 * Math.log(u1));
    spare = r * Math.sin(2 * Math.PI * u2);
    hasSpare = true;
    return r * Math.cos(2 * Math.PI * u2);
  };

  // Expected final wins under current ratings (no shocks) are the baseline for "wins above expectation".
  const expectedWins = new Float64Array(n);
  for (let i = 0; i < n; i++) expectedWins[i] = teams[i].wins;
  for (const g of games) {
    const p = normalCDF(g.mean / o.marginSd);
    expectedWins[g.home] += p;
    expectedWins[g.away] += 1 - p;
  }

  const confMembers = new Map<string, number[]>();
  for (const t of teams) {
    if (!confMembers.has(t.conference)) confMembers.set(t.conference, []);
    confMembers.get(t.conference)!.push(t.index);
  }
  // Conferences that earn an automatic bid: not independent, big enough to hold a tournament.
  const autoConfs = [...confMembers.entries()].filter(([name, m]) => !/indep/i.test(name) && m.length >= 4);
  const atLargeSlots = o.fieldSize - autoConfs.length;

  const wins = new Float64Array(n);
  const confWins = new Float64Array(n);
  const shock = new Float64Array(n);
  const tie = new Float64Array(n);
  const score = new Float64Array(n);
  const isAuto = new Uint8Array(n);
  const inField = new Uint8Array(n);
  const homeWon = new Uint8Array(G);

  const bid = new Float64Array(n);
  const auto = new Float64Array(n);
  const atLarge = new Float64Array(n);
  const seedSum = new Float64Array(n);
  const sumWins = new Float64Array(n);

  const nHW = new Uint32Array(G);
  const bhW = new Float64Array(G); // home bid when home wins
  const bhL = new Float64Array(G); // home bid when home loses
  const baW = new Float64Array(G); // away bid when away wins
  const baL = new Float64Array(G); // away bid when away loses
  // Rao-Blackwellised accumulators
  const wHome = new Float64Array(G); // sum of P(home wins | shocks)
  const wHome2 = new Float64Array(G); // sum of squares (effective sample size)
  const rbHW = new Float64Array(G);
  const rbHL = new Float64Array(G);
  const rbAW = new Float64Array(G);
  const rbAL = new Float64Array(G);
  const cfHW = new Float64Array(G);
  const cfHL = new Float64Array(G);
  const cfAW = new Float64Array(G);
  const cfAL = new Float64Array(G);

  const nm = new Float32Array(n * n).fill(Number.NaN);
  const neutralMargin = (i: number, j: number): number => {
    const k = i * n + j;
    if (Number.isNaN(nm[k])) nm[k] = o.neutralMargin(i, j);
    return nm[k];
  };
  const neutralWin = (i: number, j: number): boolean =>
    rng() < normalCDF((neutralMargin(i, j) + shock[i] - shock[j]) / o.marginSd);

  const poolIdx = teams.map((t) => t.index);
  const nonAuto: number[] = [];
  const field: number[] = [];

  for (let s = 0; s < N; s++) {
    for (let i = 0; i < n; i++) {
      wins[i] = teams[i].wins;
      confWins[i] = teams[i].confWins;
      shock[i] = teams[i].sigma * gauss();
      tie[i] = rng();
      isAuto[i] = 0;
      inField[i] = 0;
    }

    // Regular season
    for (let g = 0; g < G; g++) {
      const gm = games[g];
      const draw = gm.mean + shock[gm.home] - shock[gm.away] + o.marginSd * gauss() > 0;
      const hw = o.force && o.force.game === g ? o.force.homeWins : draw;
      homeWon[g] = hw ? 1 : 0;
      const w = hw ? gm.home : gm.away;
      wins[w] += 1;
      if (gm.conf) confWins[w] += 1;
    }

    // Conference tournaments -> automatic bids
    for (const [, members] of autoConfs) {
      const seeded = [...members]
        .sort((a, b) => (confWins[b] !== confWins[a] ? confWins[b] - confWins[a] : tie[b] - tie[a]))
        .slice(0, o.bracketSize);
      let round: (number | null)[] = SEED_ORDER.map((sd) => (sd <= seeded.length ? seeded[sd - 1] : null));
      while (round.length > 1) {
        const next: (number | null)[] = [];
        for (let k = 0; k < round.length; k += 2) {
          const a = round[k];
          const b = round[k + 1];
          if (a === null) next.push(b);
          else if (b === null) next.push(a);
          else next.push(neutralWin(a, b) ? a : b);
        }
        round = next;
      }
      const champ = round[0];
      if (champ !== null) isAuto[champ] = 1;
    }

    // At-large selection
    for (let i = 0; i < n; i++) {
      score[i] =
        teams[i].rating + o.lambdaPerWin * (wins[i] - expectedWins[i]) + o.committeeNoise * gauss();
    }
    nonAuto.length = 0;
    field.length = 0;
    for (const i of poolIdx) {
      if (isAuto[i]) {
        inField[i] = 1;
        field.push(i);
      } else nonAuto.push(i);
    }
    nonAuto.sort((a, b) => score[b] - score[a]);
    // Cutoffs for counterfactual at-large status: lowest score in, highest score out.
    const cutIn = nonAuto.length >= atLargeSlots && atLargeSlots > 0 ? score[nonAuto[atLargeSlots - 1]] : -Infinity;
    const cutOut = nonAuto.length > atLargeSlots ? score[nonAuto[atLargeSlots]] : -Infinity;
    for (let k = 0; k < atLargeSlots && k < nonAuto.length; k++) {
      inField[nonAuto[k]] = 1;
      atLarge[nonAuto[k]]++;
      field.push(nonAuto[k]);
    }
    field.sort((a, b) => score[b] - score[a]);
    for (let r = 0; r < field.length; r++) seedSum[field[r]] += Math.min(16, Math.floor(r / 4) + 1);
    for (let i = 0; i < n; i++) {
      bid[i] += inField[i];
      auto[i] += isAuto[i];
      sumWins[i] += wins[i];
    }

    // Leverage bookkeeping
    for (let g = 0; g < G; g++) {
      const gm = games[g];
      const bh = inField[gm.home];
      const ba = inField[gm.away];
      if (homeWon[g]) {
        nHW[g]++;
        bhW[g] += bh;
        baL[g] += ba;
      } else {
        bhL[g] += bh;
        baW[g] += ba;
      }
      // Rao-Blackwellised: probability the home side wins given this simulation's shocks.
      const pi = normalCDF((gm.mean + shock[gm.home] - shock[gm.away]) / o.marginSd);
      wHome[g] += pi;
      wHome2[g] += Math.min(pi, 1 - pi) ** 2;
      const lam = o.lambdaPerWin;
      // Score if the team wins / loses this game (everything else held fixed).
      const hs = score[gm.home];
      const as = score[gm.away];
      const hW = homeWon[g] ? hs : hs + lam;
      const hL = homeWon[g] ? hs - lam : hs;
      const aW = homeWon[g] ? as + lam : as;
      const aL = homeWon[g] ? as : as - lam;
      const inCf = (team: number, sc: number): number =>
        isAuto[team] ? 1 : sc > (inField[team] ? cutOut : cutIn) ? 1 : 0;
      const chW = inCf(gm.home, hW);
      const chL = inCf(gm.home, hL);
      const caW = inCf(gm.away, aW);
      const caL = inCf(gm.away, aL);
      rbHW[g] += pi * chW;
      rbHL[g] += (1 - pi) * chL;
      rbAW[g] += (1 - pi) * caW;
      rbAL[g] += pi * caL;
      cfHW[g] += chW;
      cfHL[g] += chL;
      cfAW[g] += caW;
      cfAL[g] += caL;
    }
  }

  const f = 100 / N;
  const teamOdds: TeamTourneyOdds[] = teams.map((_, i) => ({
    bidPct: bid[i] * f,
    autoBidPct: auto[i] * f,
    atLargePct: atLarge[i] * f,
    avgSeed: bid[i] > 0 ? seedSum[i] / bid[i] : null,
    avgWins: sumWins[i] / N,
  }));
  const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
  const gameStats: GameLeverageStat[] = games.map((_, g) => {
    const nAW = N - nHW[g];
    const sumHome = wHome[g];
    const sumAway = N - wHome[g];
    const minTail = Math.min(sumHome, sumAway);
    return {
      nHomeWin: nHW[g],
      nAwayWin: nAW,
      homeBidIfWin: ratio(bhW[g], nHW[g]),
      homeBidIfLoss: ratio(bhL[g], nAW),
      awayBidIfWin: ratio(baW[g], nAW),
      awayBidIfLoss: ratio(baL[g], nHW[g]),
      rbHomeBidIfWin: ratio(rbHW[g], sumHome),
      rbHomeBidIfLoss: ratio(rbHL[g], sumAway),
      rbAwayBidIfWin: ratio(rbAW[g], sumAway),
      rbAwayBidIfLoss: ratio(rbAL[g], sumHome),
      rbEffN: minTail,
      cfHomeBidIfWin: cfHW[g] / N,
      cfHomeBidIfLoss: cfHL[g] / N,
      cfAwayBidIfWin: cfAW[g] / N,
      cfAwayBidIfLoss: cfAL[g] / N,
    };
  });
  return {
    teams: teamOdds,
    games: gameStats,
    autoBidConferences: autoConfs.map(([name]) => name),
    atLargeSlots,
  };
}
