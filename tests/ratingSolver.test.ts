import { describe, expect, it } from 'vitest';
import { choleskySolve, solveRatings, type GameRow, type PriorInfo, type SolverOptions } from '../src/engine/ratingSolver';

const DAY = 86400000;

// ---- Known-answer toy league --------------------------------------------------------------------------------
// Scores are generated exactly (no noise) from known ratings: points = mu + O_scorer + D_opponent +/- eta.
const O = [4, 2, 0, -1, -2, -3]; // offence deviations (sum 0)
const D = [-3, -1, 1, 0, 2, 1]; // points-allowed deviations (sum 0; lower = better defence)
const MU = 24;
const ETA = 1.5; // per-side home advantage, so total home advantage = 3

function roundRobin(n: number, t0 = 0, spacing = DAY): GameRow[] {
  const rows: GameRow[] = [];
  let k = 0;
  for (let h = 0; h < n; h++) {
    for (let a = 0; a < n; a++) {
      if (h === a) continue;
      rows.push({
        t: t0 + k++ * spacing,
        h,
        a,
        hs: MU + O[h] + D[a] + ETA,
        as: MU + O[a] + D[h] - ETA,
        neutral: false,
      });
    }
  }
  return rows;
}

const BASE: Omit<SolverOptions, 'asOf'> = {
  halfLifeDays: 1e9, // effectively no recency decay
  ridgeMargin: 1e-6,
  ridgePoints: 1e-6,
  ridgeLogit: 1e-3,
  marginCap: 1000,
  hfaPrior: 0,
  hfaPriorSd: 1e3, // uninformative
  noiseSd: 12,
};

describe('choleskySolve', () => {
  it('solves a small SPD system exactly', () => {
    const x = choleskySolve(Float64Array.from([4, 2, 2, 3]), Float64Array.from([2, 1]), 2);
    expect(x[0]).toBeCloseTo(0.5, 12);
    expect(x[1]).toBeCloseTo(0, 12);
  });

  it('solves a 3x3 system', () => {
    // A = [[6,2,1],[2,5,2],[1,2,4]], x = [1,2,3] -> b = [13, 18, 17]
    const x = choleskySolve(Float64Array.from([6, 2, 1, 2, 5, 2, 1, 2, 4]), Float64Array.from([13, 18, 17]), 3);
    expect(Array.from(x)).toEqual([expect.closeTo(1, 10), expect.closeTo(2, 10), expect.closeTo(3, 10)]);
  });

  it('rejects a matrix that is not positive definite', () => {
    expect(() => choleskySolve(Float64Array.from([1, 2, 2, 1]), Float64Array.from([1, 1]), 2)).toThrow();
  });
});

describe('solveRatings: known-answer toy league', () => {
  const games = roundRobin(6);
  const asOf = games[games.length - 1].t;
  const r = solveRatings(6, games, { ...BASE, asOf });

  it('recovers offence, defence, league mean and home advantage exactly', () => {
    expect(r.mu).toBeCloseTo(MU, 3);
    expect(r.hfa).toBeCloseTo(2 * ETA, 3);
    for (let i = 0; i < 6; i++) {
      expect(r.off[i]).toBeCloseTo(MU + O[i], 3);
      expect(r.def[i]).toBeCloseTo(MU + D[i], 3);
    }
  });

  it('recovers the margin rating O - D', () => {
    for (let i = 0; i < 6; i++) expect(r.margin[i]).toBeCloseTo(O[i] - D[i], 3);
  });

  it('noise-free data leaves ~zero residual variance', () => {
    expect(r.marginSd).toBeLessThan(0.05);
    expect(r.totalSd).toBeLessThan(0.05);
  });

  it('centres offence and defence on the league mean', () => {
    const mean = (xs: Float64Array) => Array.from(xs).reduce((s, v) => s + v, 0) / xs.length;
    expect(mean(r.off)).toBeCloseTo(r.mu, 9);
    expect(mean(r.def)).toBeCloseTo(r.mu, 9);
  });

  it('logistic stage ranks teams in the same order as the margin rating', () => {
    const order = (xs: Float64Array) => Array.from(xs.keys()).sort((a, b) => xs[b] - xs[a]);
    expect(order(r.overall)).toEqual(order(r.margin));
    expect(r.iterations).toBeGreaterThan(0);
    expect(r.iterations).toBeLessThanOrEqual(40);
  });

  it('predicts a game as off + def - mu and adds home advantage', () => {
    // Team 0 (home) v team 5: 24 + 4 + 1 + 1.5
    const home = r.off[0] + r.def[5] - r.mu + r.hfa / 2;
    expect(home).toBeCloseTo(MU + O[0] + D[5] + ETA, 3);
  });

  it('a perfectly symmetric league has zero ratings and no preference', () => {
    const sym: GameRow[] = [];
    for (let h = 0; h < 4; h++)
      for (let a = 0; a < 4; a++) if (h !== a) sym.push({ t: sym.length * DAY, h, a, hs: 20, as: 20, neutral: true });
    const s = solveRatings(4, sym, { ...BASE, asOf: sym.length * DAY });
    for (let i = 0; i < 4; i++) {
      expect(s.margin[i]).toBeCloseTo(0, 5);
      expect(s.overall[i]).toBeCloseTo(0, 5);
      expect(s.off[i]).toBeCloseTo(20, 4);
    }
  });
});

describe('solveRatings: ridge, recency and priors', () => {
  it('ridge shrinks ratings toward zero', () => {
    const games = roundRobin(6);
    const asOf = games[games.length - 1].t;
    const free = solveRatings(6, games, { ...BASE, asOf });
    const shrunk = solveRatings(6, games, { ...BASE, asOf, ridgeMargin: 50, ridgePoints: 50 });
    for (let i = 0; i < 6; i++) expect(Math.abs(shrunk.margin[i])).toBeLessThan(Math.abs(free.margin[i]));
  });

  it('recency weights make recent results count more', () => {
    // Team 0 beats team 1 by 20 early and loses to it by 20 late.
    const early: GameRow = { t: 0, h: 0, a: 1, hs: 30, as: 10, neutral: true };
    const late: GameRow = { t: 100 * DAY, h: 0, a: 1, hs: 10, as: 30, neutral: true };
    const base = { ...BASE, asOf: 100 * DAY, ridgeMargin: 0.5, ridgePoints: 0.5 };
    const flat = solveRatings(2, [early, late], { ...base, halfLifeDays: 1e9 });
    const recent = solveRatings(2, [early, late], { ...base, halfLifeDays: 10 });
    expect(flat.margin[0]).toBeCloseTo(flat.margin[1], 4); // an even split
    expect(recent.margin[0]).toBeLessThan(recent.margin[1]); // the late loss dominates
  });

  it('caps blow-outs in the margin stage', () => {
    const g: GameRow[] = [{ t: 0, h: 0, a: 1, hs: 80, as: 0, neutral: true }];
    const capped = solveRatings(2, g, { ...BASE, asOf: 0, ridgeMargin: 1, marginCap: 10 });
    const uncapped = solveRatings(2, g, { ...BASE, asOf: 0, ridgeMargin: 1, marginCap: 1000 });
    expect(capped.margin[0]).toBeLessThan(uncapped.margin[0]);
  });

  it('a team with no games is pulled exactly to carry x its prior rating', () => {
    const games = roundRobin(6); // team 6 never plays
    const asOf = games[games.length - 1].t;
    const prior: PriorInfo = {
      carry: 0.6,
      has: Uint8Array.from([0, 0, 0, 0, 0, 0, 1]),
      margin: Float64Array.from([0, 0, 0, 0, 0, 0, 10]),
      offDev: Float64Array.from([0, 0, 0, 0, 0, 0, 3]),
      defDev: Float64Array.from([0, 0, 0, 0, 0, 0, -2]),
      overall: Float64Array.from([0, 0, 0, 0, 0, 0, 8]),
    };
    const o = { ...BASE, asOf, ridgeMargin: 2, ridgePoints: 2, ridgeLogit: 1 };
    const withPrior = solveRatings(7, games, { ...o, prior });
    const without = solveRatings(7, games, o);
    expect(withPrior.margin[6]).toBeCloseTo(0.6 * 10, 6);
    // Offence is re-centred on the league mean, which spreads the prior's mean shift (0.6 x 3 / 7) over all 7 teams.
    expect(withPrior.off[6] - withPrior.mu).toBeCloseTo(0.6 * 3 * (6 / 7), 3);
    expect(withPrior.overall[6]).toBeCloseTo(0.6 * 8, 4);
    expect(without.margin[6]).toBeCloseTo(0, 6);
  });

  it('with carry 0.9 a prior outweighs a thin sample more than with carry 0.1', () => {
    const one: GameRow[] = [{ t: 0, h: 0, a: 1, hs: 20, as: 20, neutral: true }]; // tie: no information on 0 vs 1
    const mk = (carry: number): PriorInfo => ({
      carry,
      has: Uint8Array.from([1, 1]),
      margin: Float64Array.from([8, -8]),
      offDev: new Float64Array(2),
      defDev: new Float64Array(2),
      overall: Float64Array.from([8, -8]),
    });
    const o = { ...BASE, asOf: 0, ridgeMargin: 2, ridgePoints: 2, ridgeLogit: 1 };
    const hi = solveRatings(2, one, { ...o, prior: mk(0.9) });
    const lo = solveRatings(2, one, { ...o, prior: mk(0.1) });
    expect(hi.margin[0]).toBeGreaterThan(lo.margin[0]);
    expect(hi.margin[0]).toBeGreaterThan(0);
  });

  it('an informative home-advantage prior pins the estimate', () => {
    const games = roundRobin(6);
    const asOf = games[games.length - 1].t;
    const pinned = solveRatings(6, games, { ...BASE, asOf, hfaPrior: 6, hfaPriorSd: 0.01 });
    expect(pinned.hfa).toBeCloseTo(6, 1);
    const loose = solveRatings(6, games, { ...BASE, asOf, hfaPrior: 6, hfaPriorSd: 1e3 });
    expect(loose.hfa).toBeCloseTo(3, 1);
  });

  it('counts games per team and weights by recency', () => {
    const games = roundRobin(6);
    const r = solveRatings(6, games, { ...BASE, asOf: games[games.length - 1].t, halfLifeDays: 1e9 });
    for (let i = 0; i < 6; i++) expect(r.games[i]).toBe(10);
    expect(r.weight[0]).toBeCloseTo(10, 6);
  });
});
