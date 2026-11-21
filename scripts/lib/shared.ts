/** Shared by buildRatings.ts and backtest.ts so both fit exactly the same model. */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  solveRatings,
  type GameRow,
  type PriorInfo,
  type SolverOptions,
  type SolverResult,
} from '../../src/engine/ratingSolver';
import { LEAGUES } from '../../src/data/leaguesConfig';
import type { LeagueId } from '../../src/types/sports';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const DAY = 86400000;

export interface RawTeam {
  abbr: string;
  name: string;
  short: string;
  color: string;
  alt: string;
  conf: string;
  div: string;
  fbs: boolean;
}
export interface Raw {
  fetchedAt: string;
  seasonStartYear?: number;
  teams: Record<string, RawTeam>;
  results: [string, string, string, number, number, number][];
  upcoming: [string, string, string, string, number, number | null, number | null, number | null][];
}

export interface LeagueSettings {
  id: LeagueId;
  file: string;
  halfLifeDays: number;
  ridgeMargin: number; // (noise sd / prior sd)^2
  ridgePoints: number;
  ridgeLogit: number;
  marginCap: number;
  slateDays: number;
  hfaPriorSd: number;
  /** Year-over-year carry-over of team strength (chosen with scripts/backtest.ts). */
  carry: number;
}

export const SETTINGS: LeagueSettings[] = [
  { id: 'NFL', file: 'nfl', halfLifeDays: 75, ridgeMargin: 4.5, ridgePoints: 8, ridgeLogit: 1.6, marginCap: 21, slateDays: 8, hfaPriorSd: 1.0, carry: 0.65 },
  { id: 'NCAAF', file: 'ncaaf', halfLifeDays: 70, ridgeMargin: 2.0, ridgePoints: 3.5, ridgeLogit: 0.5, marginCap: 35, slateDays: 7, hfaPriorSd: 1.2, carry: 0.65 },
  { id: 'NBA', file: 'nba', halfLifeDays: 60, ridgeMargin: 7, ridgePoints: 10, ridgeLogit: 2.4, marginCap: 25, slateDays: 3, hfaPriorSd: 1.0, carry: 0.7 },
];

export function loadRaw(file: string, prior = false): Raw | null {
  const path = join(ROOT, `data/raw/${file}${prior ? '-prior' : ''}.json`);
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Raw) : null;
}

/** Rated universe: every NFL/NBA team; for NCAAF only FBS. */
export function universeOf(s: LeagueSettings, raw: Raw): string[] {
  return Object.keys(raw.teams).filter(
    (id) => (s.id === 'NCAAF' ? raw.teams[id].fbs : true) && raw.teams[id].abbr !== 'TBD',
  );
}

export function toRows(raw: Raw, index: Map<string, number>): GameRow[] {
  return raw.results
    .filter(([, h, a]) => index.has(h) && index.has(a))
    .map(([d, h, a, hs, as, neutral]) => ({
      t: Date.parse(d),
      h: index.get(h) as number,
      a: index.get(a) as number,
      hs,
      as,
      neutral: neutral === 1,
    }));
}

export function solverOpts(s: LeagueSettings, asOf: number, prior?: PriorInfo, halfLifeDays = s.halfLifeDays): SolverOptions {
  const base = LEAGUES[s.id];
  return {
    asOf,
    halfLifeDays,
    ridgeMargin: s.ridgeMargin,
    ridgePoints: s.ridgePoints,
    ridgeLogit: s.ridgeLogit,
    marginCap: s.marginCap,
    hfaPrior: base.homeAdvantagePts,
    hfaPriorSd: s.hfaPriorSd,
    noiseSd: base.marginStdDev,
    prior,
  };
}

export interface PriorSolve {
  ids: string[];
  result: SolverResult;
}

/** Solves last season's ratings once (late-season games weighted only mildly more than early ones). */
export function solvePriorSeason(s: LeagueSettings, priorRaw: Raw): PriorSolve {
  const ids = universeOf(s, priorRaw);
  const index = new Map(ids.map((id, i) => [id, i]));
  const rows = toRows(priorRaw, index);
  const asOf = Math.max(...rows.map((r) => r.t));
  return { ids, result: solveRatings(ids.length, rows, solverOpts(s, asOf, undefined, s.halfLifeDays * 3)) };
}

/** Aligns a solved prior season to this season's team indices for the given carry-over. */
export function priorFor(curIds: string[], prior: PriorSolve | null, carry: number): PriorInfo | undefined {
  if (!prior || carry <= 0) return undefined;
  const n = curIds.length;
  const pIndex = new Map(prior.ids.map((id, i) => [id, i]));
  const info: PriorInfo = {
    carry,
    has: new Uint8Array(n),
    margin: new Float64Array(n),
    offDev: new Float64Array(n),
    defDev: new Float64Array(n),
    overall: new Float64Array(n),
  };
  const r = prior.result;
  curIds.forEach((id, i) => {
    const j = pIndex.get(id);
    if (j === undefined) return;
    info.has[i] = 1;
    info.margin[i] = r.margin[j];
    info.offDev[i] = r.off[j] - r.mu;
    info.defDev[i] = r.def[j] - r.mu;
    info.overall[i] = r.overall[j];
  });
  return info;
}
