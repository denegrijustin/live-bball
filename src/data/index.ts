import type {
  DataMeta,
  LeagueConfig,
  LeagueId,
  LeverageRow,
  ScheduledGame,
  SeasonProjection,
  TeamMetrics,
} from '../types/sports';
import { LEAGUES } from './leaguesConfig';

/** Output of scripts/buildRatings.ts (real results -> OLS + IRLS ratings, calibration, slate, season/tournament odds). */
interface Generated {
  meta: DataMeta;
  config: LeagueConfig;
  teams: TeamMetrics[];
  slate: ScheduledGame[];
  season: SeasonProjection[];
  /** Per-team, per-game NCAA tournament leverage (college basketball only; empty otherwise). */
  leverage: LeverageRow[];
}

// Each league's data is its own chunk (the basketball files are ~2 MB), fetched only when that league is opened.
const LOADERS: Record<LeagueId, () => Promise<{ default: unknown }>> = {
  NFL: () => import('./generated/nfl.json'),
  NCAAF: () => import('./generated/ncaaf.json'),
  NBA: () => import('./generated/nba.json'),
  NCAAM: () => import('./generated/ncaam.json'),
  NCAAW: () => import('./generated/ncaaw.json'),
};

const cache = new Map<LeagueId, Generated>();
const inflight = new Map<LeagueId, Promise<void>>();

/** Loads a league's data once; resolves when the synchronous getters below are safe to call for it. */
export function ensureLeague(l: LeagueId): Promise<void> {
  if (cache.has(l)) return Promise.resolve();
  let p = inflight.get(l);
  if (!p) {
    p = LOADERS[l]().then((m) => {
      cache.set(l, m.default as unknown as Generated);
    });
    p.catch(() => inflight.delete(l));
    inflight.set(l, p);
  }
  return p;
}

export const isLoaded = (l: LeagueId): boolean => cache.has(l);

const EMPTY: never[] = [];
export const getTeams = (l: LeagueId): TeamMetrics[] => cache.get(l)?.teams ?? EMPTY;
export const getSlate = (l: LeagueId): ScheduledGame[] => cache.get(l)?.slate ?? EMPTY;
export const getSeason = (l: LeagueId): SeasonProjection[] => cache.get(l)?.season ?? EMPTY;
export const getLeverage = (l: LeagueId): LeverageRow[] => cache.get(l)?.leverage ?? EMPTY;
export const getMeta = (l: LeagueId): DataMeta | null => cache.get(l)?.meta ?? null;
/** League constants fitted to the season's results (home advantage, margin/total SD, average scoring). */
export const getConfig = (l: LeagueId): LeagueConfig => cache.get(l)?.config ?? LEAGUES[l];

export function findTeam(l: LeagueId, id: string): TeamMetrics | undefined {
  return getTeams(l).find((t) => t.id === id);
}

export function topTwoTeams(l: LeagueId): [TeamMetrics, TeamMetrics] {
  const sorted = [...getTeams(l)].sort((a, b) => b.powerRating - a.powerRating);
  return [sorted[1], sorted[0]];
}
