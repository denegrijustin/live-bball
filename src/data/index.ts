import type {
  DataMeta,
  LeagueConfig,
  LeagueId,
  LeverageRow,
  ScheduledGame,
  SeasonProjection,
  TeamDetail,
  TeamMetrics,
  TrackingSummary,
} from '../types/sports';
import { LEAGUES } from './leaguesConfig';

/** Output of scripts/buildRatings.ts (real results -> OLS + IRLS ratings, calibration, slate, season/tournament odds). */
interface Generated {
  meta: DataMeta;
  config: LeagueConfig;
  teams: TeamMetrics[];
  slate: ScheduledGame[];
  season: SeasonProjection[];
  tracking: TrackingSummary;
}

// Each league's data is its own chunk (the basketball files are ~2 MB), fetched only when that league is opened.
const LOADERS: Record<LeagueId, () => Promise<{ default: unknown }>> = {
  NFL: () => import('./generated/nfl.json'),
  NCAAF: () => import('./generated/ncaaf.json'),
  NBA: () => import('./generated/nba.json'),
  NCAAM: () => import('./generated/ncaam.json'),
  NCAAW: () => import('./generated/ncaaw.json'),
};

/**
 * Compact leverage tuples written by buildRatings.ts (college basketball only):
 * [eventId, teamIdx, oppIdx, epochMinutes, flags(home=1|neutral=2), winProb*1000, base*10, ifWin*10, ifLoss*10, nWin, nLoss]
 */
type LeverageTuple = [number, number, number, number, number, number, number, number, number, number, number];
const LEVERAGE_LOADERS: Partial<Record<LeagueId, () => Promise<{ default: unknown }>>> = {
  NCAAM: () => import('./generated/ncaam-leverage.json'),
  NCAAW: () => import('./generated/ncaaw-leverage.json'),
};
const leverageCache = new Map<LeagueId, LeverageRow[]>();

/** Loads a league's leverage table (its own chunk). Resolves immediately for leagues without one. */
export async function ensureLeverage(l: LeagueId): Promise<void> {
  const load = LEVERAGE_LOADERS[l];
  if (!load || leverageCache.has(l)) return;
  await ensureLeague(l); // team indices refer to the league's team list
  const teams = getTeams(l);
  const prefix = l.toLowerCase();
  const m = await load();
  leverageCache.set(
    l,
    (m.default as LeverageTuple[]).map(([eid, ti, oi, min, flags, wp, base, w, lo, nWin, nLoss]) => ({
      gameId: `${prefix}-${eid}`,
      teamId: teams[ti].id,
      oppId: teams[oi].id,
      date: new Date(min * 60000).toISOString(),
      home: (flags & 1) === 1,
      neutral: (flags & 2) === 2,
      winProb: wp / 1000,
      bidBase: base / 10,
      bidIfWin: w / 10,
      bidIfLoss: lo / 10,
      nWin,
      nLoss,
    })),
  );
}
export const isLeverageLoaded = (l: LeagueId): boolean => !LEVERAGE_LOADERS[l] || leverageCache.has(l);

/**
 * Per-team detail written by buildRatings.ts as compact tuples indexed by team position (see the build script):
 *  log:      [epochMin, oppIdx (-1 = unrated), flags(home=1|neutral=2), pts, oppPts, preGameWinProb*1000 (-1 = n/a), oppName?]
 *  upcoming: [epochMin, oppIdx, flags, winProb*1000, teamSpread*10 | null]
 *  history:  [epochDays, power*10, rank]
 */
type DetailTuple = [unknown[][], unknown[][], unknown[][]];
const DETAIL_LOADERS: Record<LeagueId, () => Promise<{ default: unknown }>> = {
  NFL: () => import('./generated/nfl-teams.json'),
  NCAAF: () => import('./generated/ncaaf-teams.json'),
  NBA: () => import('./generated/nba-teams.json'),
  NCAAM: () => import('./generated/ncaam-teams.json'),
  NCAAW: () => import('./generated/ncaaw-teams.json'),
};
const detailCache = new Map<LeagueId, DetailTuple[]>();

export async function ensureTeamDetail(l: LeagueId): Promise<void> {
  if (detailCache.has(l)) return;
  await ensureLeague(l);
  const m = await DETAIL_LOADERS[l]();
  detailCache.set(l, m.default as unknown as DetailTuple[]);
}
export const isTeamDetailLoaded = (l: LeagueId): boolean => detailCache.has(l);

/** Expands one team's compact detail. Returns null until ensureTeamDetail(l) has resolved. */
export function getTeamDetail(l: LeagueId, teamId: string): TeamDetail | null {
  const all = detailCache.get(l);
  const teams = getTeams(l);
  const idx = teams.findIndex((t) => t.id === teamId);
  if (!all || idx < 0 || !all[idx]) return null;
  const [log, up, hist] = all[idx];
  const iso = (min: number) => new Date(min * 60000).toISOString();
  return {
    log: log.map((r) => {
      const oi = r[1] as number;
      const flags = r[2] as number;
      const wp = r[5] as number;
      return {
        date: iso(r[0] as number),
        oppId: oi >= 0 ? teams[oi].id : null,
        oppName: oi >= 0 ? teams[oi].shortName : (r[6] as string),
        home: (flags & 1) === 1,
        neutral: (flags & 2) === 2,
        pts: r[3] as number,
        oppPts: r[4] as number,
        winProb: wp >= 0 ? wp / 1000 : null,
      };
    }),
    upcoming: up.map((r) => ({
      date: iso(r[0] as number),
      oppId: teams[r[1] as number].id,
      home: ((r[2] as number) & 1) === 1,
      neutral: ((r[2] as number) & 2) === 2,
      winProb: (r[3] as number) / 1000,
      line: r[4] === null ? null : (r[4] as number) / 10,
    })),
    history: hist.map((r) => ({ date: new Date((r[0] as number) * 86400000).toISOString(), power: (r[1] as number) / 10, rank: r[2] as number })),
  };
}

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
export const getLeverage = (l: LeagueId): LeverageRow[] => leverageCache.get(l) ?? EMPTY;
export const getTracking = (l: LeagueId): TrackingSummary | null => cache.get(l)?.tracking ?? null;
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
