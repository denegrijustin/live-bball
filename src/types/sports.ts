export type LeagueId = 'NFL' | 'NCAAF' | 'NBA';
export type VenueType = 'TEAM_A_HOME' | 'NEUTRAL' | 'TEAM_B_HOME';
export type LetterGrade = 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D' | 'F';
export type ActiveTab = 'SIMULATOR' | 'SLATE' | 'RANKINGS' | 'LEAN_BOARD' | 'SEASON';

export interface LeagueConfig {
  id: LeagueId;
  name: string;
  fullName: string;
  avgEfficiency: number; // Points per team per game (NFL/NCAAF) or per 100 possessions (NBA)
  avgPace: number; // Possessions/plays per game
  homeAdvantagePts: number; // Standard HFA in points
  marginStdDev: number; // Standard deviation of victory margin
  totalStdDev: number; // Standard deviation of combined total points
  minRealisticScore: number; // Floor clamp for simulation
  unitLabel: string;
  paceLabel: string;
}

export interface TeamMetrics {
  id: string;
  league: LeagueId;
  name: string;
  shortName: string;
  abbreviation: string;
  conference: string; // e.g. "AFC West", "SEC", "Western"
  division?: string; // NFL / NBA division, when the league has one
  primaryColor: string;
  secondaryColor: string;
  record: string;
  wins: number;
  losses: number;
  powerRating: number; // Normalized 0 - 100
  offRating: number; // higher = better
  defRating: number; // LOWER = better
  pace: number;
  sos: number; // 0 - 100
  consistency: number; // 0.75 (volatile) to 1.25 (ultra-consistent)
  last5: ('W' | 'L')[];
  trendDelta: number;
}

export interface WhatIfAdjustments {
  teamAOffDelta: number;
  teamADefDelta: number;
  teamAPaceDelta: number;
  teamBOffDelta: number;
  teamBDefDelta: number;
  teamBPaceDelta: number;
}

export interface DeterministicResult {
  teamAProjectedScore: number;
  teamBProjectedScore: number;
  projectedSpreadTeamB: number; // Negative means Team B is favored
  projectedTotal: number;
  expectedPace: number;
  teamAWinProb: number;
  teamBWinProb: number;
  teamAImpliedOdds: string;
  teamBImpliedOdds: string;
}

export interface AdjustedTeam {
  off: number;
  def: number;
  pace: number;
}

/** Deterministic result plus the distribution parameters the Monte Carlo engine samples from. */
export interface MatchupModel extends DeterministicResult {
  expectedMarginB: number; // Team B score minus Team A score
  marginSd: number;
  totalSd: number;
  adjA: AdjustedTeam;
  adjB: AdjustedTeam;
}

export interface HistogramBin {
  binLabel: string;
  midpoint: number;
  count: number;
  percentage: number;
  winner: 'TEAM_A' | 'TEAM_B' | 'TIE';
}

export interface MonteCarloResult {
  iterations: number;
  teamAEmpiricalWinPct: number;
  teamBEmpiricalWinPct: number;
  tiePct: number;
  avgTeamAScore: number;
  avgTeamBScore: number;
  medianMarginTeamB: number;
  teamBCoverProb: number;
  teamACoverProb: number;
  spreadPushProb: number;
  overProb: number;
  underProb: number;
  totalPushProb: number;
  histogram: HistogramBin[];
}

export interface ScheduledGame {
  id: string;
  league: LeagueId;
  startTime: string;
  weekOrDateLabel: string;
  awayTeamId: string; // Team A
  homeTeamId: string; // Team B
  neutralSite: boolean;
  /** Sportsbook lines are null until a book posts them (ESPN/DraftKings). */
  vegasSpreadHome: number | null;
  vegasTotal: number | null;
}

export interface SeasonProjection {
  teamId: string;
  wins: number;
  losses: number;
  gamesRemaining: number;
  avgWins: number;
  playoffPct: number;
  divisionPct: number;
  topSeedPct: number;
  topSixPct: number;
  bowlPct: number;
  cfpPct: number;
}

export interface DataMeta {
  asOf: string;
  source: string;
  gamesUsed: number;
  teamsRated: number;
  halfLifeDays: number;
  irlsIterations: number;
  seasonIterations: number;
}

export type GradeKey = 'OFFENSE' | 'DEFENSE' | 'PACE' | 'SOS' | 'CONSISTENCY' | 'POWER';

export interface GradeBox {
  key: GradeKey;
  label: string;
  displayValue: string;
  zScore: number; // oriented so that positive is always "good"
  percentile: number; // 0 - 100
  rank: number;
  grade: LetterGrade;
}

export interface LeanRow {
  game: ScheduledGame;
  away: TeamMetrics;
  home: TeamMetrics;
  model: MatchupModel;
  modelSpreadHome: number;
  vegasSpreadHome: number;
  hasSpread: boolean; // false when no sportsbook line is posted; edges then compare the model to itself
  hasTotal: boolean;
  spreadEdge: number; // points of value on the recommended side (always >= 0)
  spreadPick: 'HOME' | 'AWAY';
  spreadPickLine: number; // line the pick is taking, from that side's perspective
  spreadCoverProb: number;
  spreadEv: number; // $ per $100 at -110
  modelTotal: number;
  vegasTotal: number;
  totalEdge: number; // points of value on the recommended side (always >= 0)
  totalPick: 'OVER' | 'UNDER';
  totalProb: number;
  totalEv: number;
}
