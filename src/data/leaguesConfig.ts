import type { LeagueConfig, LeagueId } from '../types/sports';

/**
 * Baseline constants. Home advantage, margin/total SD and average scoring are used as priors and then re-fitted to
 * the season's real results by scripts/buildRatings.ts (see getConfig in data/index.ts). Pace is a tempo index.
 */
export const LEAGUES: Record<LeagueId, LeagueConfig> = {
  NFL: {
    id: 'NFL',
    name: 'NFL',
    fullName: 'National Football League',
    avgEfficiency: 21.8,
    avgPace: 62.0,
    homeAdvantagePts: 2.3,
    marginStdDev: 13.45,
    totalStdDev: 13.8,
    minRealisticScore: 0,
    unitLabel: 'Points/Game',
    paceLabel: 'Est. Plays/Game',
  },
  NCAAF: {
    id: 'NCAAF',
    name: 'NCAAF',
    fullName: 'NCAA Football (FBS)',
    avgEfficiency: 28.5,
    avgPace: 68.5,
    homeAdvantagePts: 3.1,
    marginStdDev: 14.8,
    totalStdDev: 15.2,
    minRealisticScore: 0,
    unitLabel: 'Points/Game',
    paceLabel: 'Est. Plays/Game',
  },
  NBA: {
    id: 'NBA',
    name: 'NBA',
    fullName: 'National Basketball Association',
    avgEfficiency: 114.5,
    avgPace: 99.2,
    homeAdvantagePts: 2.8,
    marginStdDev: 11.6,
    totalStdDev: 14.1,
    minRealisticScore: 72,
    unitLabel: 'Points/100 Poss',
    paceLabel: 'Est. Poss./48m',
  },
};

export const LEAGUE_IDS: LeagueId[] = ['NFL', 'NCAAF', 'NBA'];
