import type { HistogramBin, LeagueConfig, MatchupModel, MonteCarloResult } from '../types/sports';

export const ITERATIONS = 10000;
const BIN_WIDTH = 3;

/** Deterministic, seedable PRNG so results are stable for a given seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller transform: two uniforms -> two independent standard normals. */
export function boxMuller(rng: () => number): [number, number] {
  let u1 = rng();
  while (u1 === 0) u1 = rng();
  const u2 = rng();
  const r = Math.sqrt(-2 * Math.log(u1));
  const theta = 2 * Math.PI * u2;
  return [r * Math.cos(theta), r * Math.sin(theta)];
}

export interface MonteCarloOptions {
  vegasSpreadTeamB: number; // Team B notation: -3.5 means Team B favored by 3.5
  vegasTotal: number;
  iterations?: number;
  seed?: number;
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function runMonteCarlo(
  model: MatchupModel,
  league: LeagueConfig,
  opts: MonteCarloOptions,
): MonteCarloResult {
  const n = opts.iterations ?? ITERATIONS;
  const rng = mulberry32(opts.seed ?? 1);
  const margins = new Int16Array(n);

  let aWins = 0;
  let bWins = 0;
  const ties = 0; // Ties are resolved as overtime above; kept in the result for API completeness.
  let sumA = 0;
  let sumB = 0;
  let bCover = 0;
  let aCover = 0;
  let spreadPush = 0;
  let over = 0;
  let under = 0;
  let totalPush = 0;
  const counts = new Map<number, number>();

  for (let idx = 0; idx < n; idx++) {
    const [zm, zt] = boxMuller(rng);
    const margin = model.expectedMarginB + model.marginSd * zm;
    const total = model.projectedTotal + model.totalSd * zt;
    let a = Math.max(league.minRealisticScore, Math.round((total - margin) / 2));
    let b = Math.max(league.minRealisticScore, Math.round((total + margin) / 2));
    if (a === b) {
      // Regulation tie -> overtime. The winner is drawn from the model's win probability and takes the game
      // by a field goal (football) or a single basket-and-free-throw margin (basketball: 1 point).
      const otPoints = league.id === 'NBA' ? 1 : 3;
      if (rng() < model.teamBWinProb) b += otPoints;
      else a += otPoints;
    }
    const m = b - a;
    margins[idx] = m;
    sumA += a;
    sumB += b;
    if (m > 0) bWins++;
    else aWins++;

    const spreadResult = m + opts.vegasSpreadTeamB;
    if (spreadResult > 0) bCover++;
    else if (spreadResult < 0) aCover++;
    else spreadPush++;

    const t = a + b;
    if (t > opts.vegasTotal) over++;
    else if (t < opts.vegasTotal) under++;
    else totalPush++;

    const bin = Math.round(m / BIN_WIDTH);
    counts.set(bin, (counts.get(bin) ?? 0) + 1);
  }

  const sorted = Array.from(margins).sort((x, y) => x - y);
  const median =
    n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;

  const half = Math.floor(BIN_WIDTH / 2);
  const keys = Array.from(counts.keys());
  const minK = Math.min(...keys);
  const maxK = Math.max(...keys);
  const histogram: HistogramBin[] = [];
  for (let k = minK; k <= maxK; k++) {
    const count = counts.get(k) ?? 0;
    const mid = k * BIN_WIDTH;
    histogram.push({
      binLabel: `${mid - half} to ${mid + half}`,
      midpoint: mid,
      count,
      percentage: (count / n) * 100,
      winner: mid > 0 ? 'TEAM_B' : mid < 0 ? 'TEAM_A' : 'TIE',
    });
  }

  return {
    iterations: n,
    teamAEmpiricalWinPct: (aWins / n) * 100,
    teamBEmpiricalWinPct: (bWins / n) * 100,
    tiePct: (ties / n) * 100,
    avgTeamAScore: sumA / n,
    avgTeamBScore: sumB / n,
    medianMarginTeamB: median,
    teamBCoverProb: (bCover / n) * 100,
    teamACoverProb: (aCover / n) * 100,
    spreadPushProb: (spreadPush / n) * 100,
    overProb: (over / n) * 100,
    underProb: (under / n) * 100,
    totalPushProb: (totalPush / n) * 100,
    histogram,
  };
}
