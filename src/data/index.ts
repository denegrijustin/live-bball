import type {
  DataMeta,
  LeagueConfig,
  LeagueId,
  ScheduledGame,
  SeasonProjection,
  TeamMetrics,
} from '../types/sports';
import nfl from './generated/nfl.json';
import ncaaf from './generated/ncaaf.json';
import nba from './generated/nba.json';

/** Output of scripts/buildRatings.ts (real results -> OLS + IRLS ratings, calibration, slate, season odds). */
interface Generated {
  meta: DataMeta;
  config: LeagueConfig;
  teams: TeamMetrics[];
  slate: ScheduledGame[];
  season: SeasonProjection[];
}

const DATA: Record<LeagueId, Generated> = {
  NFL: nfl as unknown as Generated,
  NCAAF: ncaaf as unknown as Generated,
  NBA: nba as unknown as Generated,
};

export const getTeams = (l: LeagueId): TeamMetrics[] => DATA[l].teams;
export const getSlate = (l: LeagueId): ScheduledGame[] => DATA[l].slate;
export const getSeason = (l: LeagueId): SeasonProjection[] => DATA[l].season;
export const getMeta = (l: LeagueId): DataMeta => DATA[l].meta;
/** League constants fitted to the season's results (home advantage, margin/total SD, average scoring). */
export const getConfig = (l: LeagueId): LeagueConfig => DATA[l].config;

export function findTeam(l: LeagueId, id: string): TeamMetrics | undefined {
  return DATA[l].teams.find((t) => t.id === id);
}

export function topTwoTeams(l: LeagueId): [TeamMetrics, TeamMetrics] {
  const sorted = [...DATA[l].teams].sort((a, b) => b.powerRating - a.powerRating);
  return [sorted[1], sorted[0]];
}
