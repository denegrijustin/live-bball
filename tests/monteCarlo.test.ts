import { describe, expect, it } from 'vitest';
import { analyticCoverProbB, analyticOverProb, NEUTRAL_ADJUSTMENTS, projectMatchup } from '../src/engine/mathModel';
import { boxMuller, hashString, mulberry32, runMonteCarlo } from '../src/engine/monteCarlo';
import { LEAGUES } from '../src/data/leaguesConfig';
import type { TeamMetrics } from '../src/types/sports';

const league = { ...LEAGUES.NFL, avgEfficiency: 22, homeAdvantagePts: 2, marginStdDev: 13, totalStdDev: 14 };
const mk = (id: string, off: number, def: number): TeamMetrics => ({
  id,
  league: 'NFL',
  name: id,
  shortName: id,
  abbreviation: id,
  conference: 'X',
  primaryColor: '#000',
  secondaryColor: '#fff',
  record: '0-0',
  wins: 0,
  losses: 0,
  powerRating: 50,
  offRating: off,
  defRating: def,
  pace: 62,
  sos: 50,
  consistency: 1,
  last5: [],
  trendDelta: 0,
});
const model = projectMatchup(mk('a', 26, 20), mk('b', 21, 23), 'TEAM_B_HOME', NEUTRAL_ADJUSTMENTS, league);

describe('PRNG', () => {
  it('mulberry32 is deterministic per seed and uniform on [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 50 }, () => a());
    expect(Array.from({ length: 50 }, () => b())).toEqual(seqA);
    expect(Array.from({ length: 50 }, () => mulberry32(43)())).not.toEqual(seqA);
    const r = mulberry32(7);
    let sum = 0;
    for (let i = 0; i < 20000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / 20000).toBeCloseTo(0.5, 1);
  });

  it('boxMuller yields standard normals', () => {
    const rng = mulberry32(99);
    const xs: number[] = [];
    for (let i = 0; i < 10000; i++) xs.push(...boxMuller(rng));
    const mean = xs.reduce((s, v) => s + v, 0) / xs.length;
    const variance = xs.reduce((s, v) => s + (v - mean) ** 2, 0) / xs.length;
    expect(mean).toBeCloseTo(0, 1);
    expect(variance).toBeCloseTo(1, 1);
  });

  it('hashString is stable and spreads inputs', () => {
    expect(hashString('nfl-1')).toBe(hashString('nfl-1'));
    expect(hashString('nfl-1')).not.toBe(hashString('nfl-2'));
  });
});

describe('runMonteCarlo', () => {
  const opts = { vegasSpreadTeamB: -3.5, vegasTotal: 47.5, seed: 12345 };

  it('is exactly reproducible for a fixed seed and differs across seeds', () => {
    const x = runMonteCarlo(model, league, opts);
    const y = runMonteCarlo(model, league, opts);
    expect(y).toEqual(x);
    const z = runMonteCarlo(model, league, { ...opts, seed: 54321 });
    expect(z.teamBCoverProb).not.toBe(x.teamBCoverProb);
  });

  it('runs the requested number of iterations and the histogram accounts for all of them', () => {
    const r = runMonteCarlo(model, league, opts);
    expect(r.iterations).toBe(10000);
    expect(r.histogram.reduce((s, b) => s + b.count, 0)).toBe(10000);
    expect(r.histogram.reduce((s, b) => s + b.percentage, 0)).toBeCloseTo(100, 6);
  });

  it('probabilities are coherent', () => {
    const r = runMonteCarlo(model, league, opts);
    expect(r.teamAEmpiricalWinPct + r.teamBEmpiricalWinPct).toBeCloseTo(100, 6);
    expect(r.tiePct).toBe(0); // regulation ties are resolved as overtime
    expect(r.teamBCoverProb + r.teamACoverProb + r.spreadPushProb).toBeCloseTo(100, 6);
    expect(r.overProb + r.underProb + r.totalPushProb).toBeCloseTo(100, 6);
    // Half-point lines can never push.
    expect(r.spreadPushProb).toBe(0);
    expect(r.totalPushProb).toBe(0);
  });

  it('whole-number lines push at a plausible rate', () => {
    const r = runMonteCarlo(model, league, { ...opts, vegasSpreadTeamB: -3, vegasTotal: 48 });
    expect(r.spreadPushProb).toBeGreaterThan(1);
    expect(r.spreadPushProb).toBeLessThan(8);
  });

  it('agrees with the analytic normal model within Monte Carlo error', () => {
    const r = runMonteCarlo(model, league, { ...opts, iterations: 40000 });
    expect(r.teamBEmpiricalWinPct / 100).toBeCloseTo(model.teamBWinProb, 1);
    expect(Math.abs(r.teamBEmpiricalWinPct / 100 - model.teamBWinProb)).toBeLessThan(0.015);
    // Integer scores put half the push mass on each side, so compare with a continuity-aware tolerance.
    expect(Math.abs(r.teamBCoverProb / 100 - analyticCoverProbB(model, -3.5))).toBeLessThan(0.02);
    expect(Math.abs(r.overProb / 100 - analyticOverProb(model, 47.5))).toBeLessThan(0.02);
    expect(r.avgTeamAScore).toBeCloseTo(model.teamAProjectedScore, 0);
    expect(r.avgTeamBScore).toBeCloseTo(model.teamBProjectedScore, 0);
  });

  it('never produces scores below the league floor', () => {
    const nba = { ...LEAGUES.NBA, minRealisticScore: 72 };
    const weak = mk('w', 70, 150);
    const m = projectMatchup(weak, weak, 'NEUTRAL', NEUTRAL_ADJUSTMENTS, nba);
    const r = runMonteCarlo(m, nba, { vegasSpreadTeamB: 0, vegasTotal: 150, seed: 3 });
    expect(r.avgTeamAScore).toBeGreaterThanOrEqual(72);
  });
});
