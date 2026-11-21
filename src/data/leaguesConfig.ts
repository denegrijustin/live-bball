import type { LeagueConfig, LeagueId } from '../types/sports';

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
    paceLabel: 'Plays/Game',
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
    paceLabel: 'Plays/Game',
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
    paceLabel: 'Possessions/48m',
  },
};

export const LEAGUE_IDS: LeagueId[] = ['NFL', 'NCAAF', 'NBA'];
