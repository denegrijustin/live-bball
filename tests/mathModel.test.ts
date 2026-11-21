import { describe, expect, it } from 'vitest';
import {
  americanToProb,
  analyticCoverProbB,
  analyticOverProb,
  erf,
  NEUTRAL_ADJUSTMENTS,
  normalCDF,
  probToAmerican,
  projectMatchup,
  roundHalf,
} from '../src/engine/mathModel';
import { LEAGUES } from '../src/data/leaguesConfig';
import type { TeamMetrics } from '../src/types/sports';

/** High-precision reference erf via its Maclaurin series (converges quickly for |x| <= 3). */
function erfSeries(x: number): number {
  let sum = 0;
  let term = x; // (-1)^n x^(2n+1) / n!
  for (let n = 0; n < 80; n++) {
    sum += term / (2 * n + 1);
    term *= (-x * x) / (n + 1);
  }
  return (2 / Math.sqrt(Math.PI)) * sum;
}

describe('erf / normalCDF', () => {
  it('matches published reference values', () => {
    expect(erf(0)).toBeCloseTo(0, 7);
    expect(erf(0.5)).toBeCloseTo(0.5204998778, 6);
    expect(erf(1)).toBeCloseTo(0.8427007929, 6);
    expect(erf(2)).toBeCloseTo(0.995322265, 6);
  });

  it('stays within 1.5e-7 of the true erf over [-3, 3]', () => {
    let worst = 0;
    for (let x = -3; x <= 3; x += 0.01) worst = Math.max(worst, Math.abs(erf(x) - erfSeries(x)));
    expect(worst).toBeLessThan(1.5e-7);
  });

  it('is odd and bounded', () => {
    for (const x of [0.1, 0.7, 1.3, 2.9]) expect(erf(-x)).toBeCloseTo(-erf(x), 12);
    expect(erf(10)).toBeCloseTo(1, 7);
    expect(erf(-10)).toBeCloseTo(-1, 7);
  });

  it('normalCDF hits the textbook quantiles', () => {
    expect(normalCDF(0)).toBeCloseTo(0.5, 7);
    expect(normalCDF(1)).toBeCloseTo(0.8413447461, 6);
    expect(normalCDF(-1)).toBeCloseTo(0.1586552539, 6);
    expect(normalCDF(1.96)).toBeCloseTo(0.9750021049, 6);
    expect(normalCDF(-2.5758)).toBeCloseTo(0.005, 4);
  });

  it('normalCDF is monotone and symmetric', () => {
    let prev = -1;
    for (let z = -6; z <= 6; z += 0.05) {
      const v = normalCDF(z);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v + normalCDF(-z)).toBeCloseTo(1, 7);
      prev = v;
    }
  });
});

describe('odds helpers', () => {
  it('converts probabilities to American odds', () => {
    expect(probToAmerican(0.5)).toBe('+100');
    expect(probToAmerican(0.75)).toBe('-300');
    expect(probToAmerican(0.25)).toBe('+300');
    expect(probToAmerican(0.6)).toBe('-150');
  });

  it('round-trips through americanToProb', () => {
    for (const p of [0.1, 0.35, 0.6, 0.9]) {
      const odds = Number(probToAmerican(p));
      expect(americanToProb(odds)).toBeCloseTo(p, 2);
    }
    expect(americanToProb(-110)).toBeCloseTo(0.5238, 3);
    expect(americanToProb(+200)).toBeCloseTo(1 / 3, 6);
  });

  it('rounds lines to the half point', () => {
    expect(roundHalf(3.2)).toBe(3);
    expect(roundHalf(3.3)).toBe(3.5);
    expect(roundHalf(-6.8)).toBe(-7);
  });
});

function team(id: string, off: number, def: number, pace = 62, consistency = 1): TeamMetrics {
  return {
    id,
    league: 'NFL',
    name: id,
    shortName: id,
    abbreviation: id.toUpperCase(),
    conference: 'X',
    primaryColor: '#000000',
    secondaryColor: '#ffffff',
    record: '0-0',
    wins: 0,
    losses: 0,
    powerRating: 50,
    offRating: off,
    defRating: def,
    pace,
    sos: 50,
    consistency,
    last5: [],
    trendDelta: 0,
  };
}

describe('projectMatchup', () => {
  const league = { ...LEAGUES.NFL, avgEfficiency: 22, homeAdvantagePts: 2, marginStdDev: 13, totalStdDev: 14 };
  const a = team('a', 26, 20);
  const b = team('b', 21, 23);

  it('adds offence to opposing defence and subtracts the league mean', () => {
    const m = projectMatchup(a, b, 'NEUTRAL', NEUTRAL_ADJUSTMENTS, league);
    expect(m.teamAProjectedScore).toBeCloseTo(26 + 23 - 22, 9);
    expect(m.teamBProjectedScore).toBeCloseTo(21 + 20 - 22, 9);
    expect(m.projectedTotal).toBeCloseTo(m.teamAProjectedScore + m.teamBProjectedScore, 9);
    expect(m.projectedSpreadTeamB).toBeCloseTo(-(m.teamBProjectedScore - m.teamAProjectedScore), 9);
  });

  it('splits home advantage evenly between the two sides', () => {
    const neutral = projectMatchup(a, b, 'NEUTRAL', NEUTRAL_ADJUSTMENTS, league);
    const bHome = projectMatchup(a, b, 'TEAM_B_HOME', NEUTRAL_ADJUSTMENTS, league);
    expect(bHome.teamBProjectedScore - neutral.teamBProjectedScore).toBeCloseTo(1, 9);
    expect(bHome.teamAProjectedScore - neutral.teamAProjectedScore).toBeCloseTo(-1, 9);
    expect(bHome.expectedMarginB - neutral.expectedMarginB).toBeCloseTo(2, 9);
  });

  it('is mirror-symmetric when teams and venue are swapped', () => {
    const x = projectMatchup(a, b, 'TEAM_A_HOME', NEUTRAL_ADJUSTMENTS, league);
    const y = projectMatchup(b, a, 'TEAM_B_HOME', NEUTRAL_ADJUSTMENTS, league);
    expect(x.teamAProjectedScore).toBeCloseTo(y.teamBProjectedScore, 9);
    expect(x.teamAWinProb).toBeCloseTo(y.teamBWinProb, 7);
  });

  it('win probabilities sum to one and favour the stronger side', () => {
    const m = projectMatchup(a, b, 'NEUTRAL', NEUTRAL_ADJUSTMENTS, league);
    expect(m.teamAWinProb + m.teamBWinProb).toBeCloseTo(1, 7);
    expect(m.teamAWinProb).toBeGreaterThan(0.5);
    const even = projectMatchup(a, a, 'NEUTRAL', NEUTRAL_ADJUSTMENTS, league);
    expect(even.teamAWinProb).toBeCloseTo(0.5, 7); // erf approximation error is < 1.5e-7
  });

  it('What-If deltas move scores in the expected direction and pace scales scoring', () => {
    const base = projectMatchup(a, b, 'NEUTRAL', NEUTRAL_ADJUSTMENTS, league);
    const better = projectMatchup(a, b, 'NEUTRAL', { ...NEUTRAL_ADJUSTMENTS, teamAOffDelta: 3 }, league);
    expect(better.teamAProjectedScore - base.teamAProjectedScore).toBeCloseTo(3, 9);
    const fast = projectMatchup(a, b, 'NEUTRAL', { ...NEUTRAL_ADJUSTMENTS, teamAPaceDelta: 4, teamBPaceDelta: 4 }, league);
    expect(fast.projectedTotal).toBeGreaterThan(base.projectedTotal);
    expect(fast.projectedTotal / base.projectedTotal).toBeCloseTo(66 / 62, 9);
  });

  it('higher consistency tightens the margin spread', () => {
    const volatile = projectMatchup(team('a', 26, 20, 62, 0.8), team('b', 21, 23, 62, 0.8), 'NEUTRAL', NEUTRAL_ADJUSTMENTS, league);
    const steady = projectMatchup(team('a', 26, 20, 62, 1.2), team('b', 21, 23, 62, 1.2), 'NEUTRAL', NEUTRAL_ADJUSTMENTS, league);
    expect(steady.marginSd).toBeLessThan(volatile.marginSd);
    expect(steady.teamAWinProb).toBeGreaterThan(volatile.teamAWinProb);
  });

  it('clamps scores at the league floor', () => {
    const nba = { ...LEAGUES.NBA, minRealisticScore: 72 };
    const weak = team('w', 60, 160, 99);
    const m = projectMatchup(weak, weak, 'NEUTRAL', NEUTRAL_ADJUSTMENTS, nba);
    expect(m.teamAProjectedScore).toBeGreaterThanOrEqual(72);
  });

  it('analytic cover and over probabilities are consistent with the normal model', () => {
    const m = projectMatchup(a, b, 'NEUTRAL', NEUTRAL_ADJUSTMENTS, league);
    // Team B covering its own projected spread is a coin flip; the over at the projected total is a coin flip.
    expect(analyticCoverProbB(m, m.projectedSpreadTeamB)).toBeCloseTo(0.5, 7);
    expect(analyticOverProb(m, m.projectedTotal)).toBeCloseTo(0.5, 7);
    expect(analyticOverProb(m, m.projectedTotal + 10)).toBeLessThan(0.5);
  });
});
