import type { LeagueConfig, LeagueId, ScheduledGame, TeamMetrics } from '../types/sports';
import { LEAGUES } from './leaguesConfig';
import { NFL_TEAMS } from './nflTeams';
import { NCAAF_TEAMS } from './ncaafTeams';
import { NBA_TEAMS } from './nbaTeams';
import { NFL_SLATE, NCAAF_SLATE, NBA_SLATE } from './dailySlate';

const TEAMS: Record<LeagueId, TeamMetrics[]> = { NFL: NFL_TEAMS, NCAAF: NCAAF_TEAMS, NBA: NBA_TEAMS };
const SLATES: Record<LeagueId, ScheduledGame[]> = { NFL: NFL_SLATE, NCAAF: NCAAF_SLATE, NBA: NBA_SLATE };

export const getTeams = (l: LeagueId): TeamMetrics[] => TEAMS[l];
export const getSlate = (l: LeagueId): ScheduledGame[] => SLATES[l];
export const getConfig = (l: LeagueId): LeagueConfig => LEAGUES[l];

export function findTeam(l: LeagueId, id: string): TeamMetrics | undefined {
  return TEAMS[l].find((t) => t.id === id);
}

export function topTwoTeams(l: LeagueId): [TeamMetrics, TeamMetrics] {
  const sorted = [...TEAMS[l]].sort((a, b) => b.powerRating - a.powerRating);
  return [sorted[1], sorted[0]];
}
