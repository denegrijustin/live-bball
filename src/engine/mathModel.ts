import type {
  AdjustedTeam,
  LeagueConfig,
  MatchupModel,
  TeamMetrics,
  VenueType,
  WhatIfAdjustments,
} from '../types/sports';

// Abramowitz & Stegun 7.1.26 (max abs error < 1.5e-7)
const A1 = 0.254829592;
const A2 = -0.284496736;
const A3 = 1.421413741;
const A4 = -1.453152027;
const A5 = 1.061405429;
const P = 0.3275911;

export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + P * ax);
  const y = 1 - ((((A5 * t + A4) * t + A3) * t + A2) * t + A1) * t * Math.exp(-ax * ax);
  return sign * y;
}

export function normalCDF(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** Convert a win probability to American moneyline odds (no vig). */
export function probToAmerican(p: number): string {
  const c = Math.min(0.9999, Math.max(0.0001, p));
  if (Math.abs(c - 0.5) < 0.0005) return '+100';
  if (c > 0.5) return `-${Math.round((c / (1 - c)) * 100)}`;
  return `+${Math.round(((1 - c) / c) * 100)}`;
}

export function americanToProb(odds: number): number {
  return odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100);
}

export const NEUTRAL_ADJUSTMENTS: WhatIfAdjustments = {
  teamAOffDelta: 0,
  teamADefDelta: 0,
  teamAPaceDelta: 0,
  teamBOffDelta: 0,
  teamBDefDelta: 0,
  teamBPaceDelta: 0,
};

/**
 * Converts a team's matchup efficiency into points scored.
 * NBA ratings are per 100 possessions, so scoring scales with possessions / 100.
 * Football ratings are points per game at league-average plays, so scoring scales with plays / avgPlays.
 */
export function scoreScale(league: LeagueConfig, pace: number): number {
  return league.id === 'NBA' ? pace / 100 : pace / league.avgPace;
}

export function adjustTeam(
  team: TeamMetrics,
  off: number,
  def: number,
  pace: number,
): AdjustedTeam {
  return { off: team.offRating + off, def: team.defRating + def, pace: team.pace + pace };
}

/** Deterministic matchup projection with What-If adjustments and venue applied. */
export function projectMatchup(
  teamA: TeamMetrics,
  teamB: TeamMetrics,
  venue: VenueType,
  adj: WhatIfAdjustments,
  league: LeagueConfig,
): MatchupModel {
  const adjA = adjustTeam(teamA, adj.teamAOffDelta, adj.teamADefDelta, adj.teamAPaceDelta);
  const adjB = adjustTeam(teamB, adj.teamBOffDelta, adj.teamBDefDelta, adj.teamBPaceDelta);

  const expectedPace = (adjA.pace + adjB.pace) / 2;
  const scale = scoreScale(league, expectedPace);

  const hfa = league.homeAdvantagePts / 2;
  const venueA = venue === 'TEAM_A_HOME' ? hfa : venue === 'TEAM_B_HOME' ? -hfa : 0;
  const venueB = -venueA;

  const rawA = (adjA.off + adjB.def - league.avgEfficiency) * scale + venueA;
  const rawB = (adjB.off + adjA.def - league.avgEfficiency) * scale + venueB;
  const scoreA = Math.max(league.minRealisticScore, rawA);
  const scoreB = Math.max(league.minRealisticScore, rawB);

  const expectedMarginB = scoreB - scoreA;
  // More consistent teams (multiplier > 1) compress variance; volatile teams widen it.
  const consistency = (teamA.consistency + teamB.consistency) / 2;
  const marginSd = league.marginStdDev / consistency;
  const totalSd = league.totalStdDev / consistency;

  const teamBWinProb = normalCDF(expectedMarginB / marginSd);
  const teamAWinProb = 1 - teamBWinProb;

  return {
    teamAProjectedScore: scoreA,
    teamBProjectedScore: scoreB,
    projectedSpreadTeamB: -expectedMarginB,
    projectedTotal: scoreA + scoreB,
    expectedPace,
    teamAWinProb,
    teamBWinProb,
    teamAImpliedOdds: probToAmerican(teamAWinProb),
    teamBImpliedOdds: probToAmerican(teamBWinProb),
    expectedMarginB,
    marginSd,
    totalSd,
    adjA,
    adjB,
  };
}

/** Analytical cover probability for Team B given a sportsbook spread (Team B notation) via normal CDF. */
export function analyticCoverProbB(model: MatchupModel, vegasSpreadB: number): number {
  return normalCDF((model.expectedMarginB + vegasSpreadB) / model.marginSd);
}

export function analyticOverProb(model: MatchupModel, vegasTotal: number): number {
  return 1 - normalCDF((vegasTotal - model.projectedTotal) / model.totalSd);
}

export function roundHalf(x: number): number {
  return Math.round(x * 2) / 2;
}
