import type { LeagueId, TeamMetrics } from '../types/sports';

/**
 * Compact raw row:
 * [abbr, name, shortName, conference, primary, secondary, wins, losses,
 *  off, def, pace, sos, consistency, last5, trendDelta]
 */
export type RawTeam = [
  string,
  string,
  string,
  string,
  string,
  string,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  string,
  number,
];

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Builds full TeamMetrics, deriving the 0-100 normalized power rating from net efficiency and schedule. */
export function buildLeague(league: LeagueId, rows: RawTeam[]): TeamMetrics[] {
  const nets = rows.map((r) => r[8] - r[9]);
  const mean = nets.reduce((s, v) => s + v, 0) / nets.length;
  const sd = Math.sqrt(nets.reduce((s, v) => s + (v - mean) ** 2, 0) / nets.length) || 1;

  return rows.map((r, i) => {
    const [abbr, name, shortName, conference, primary, secondary, wins, losses, off, def, pace, sos, cons, l5, trend] = r;
    const z = (nets[i] - mean) / sd;
    const power = clamp(50 + 20 * z + (sos - 50) * 0.15, 0, 100);
    return {
      id: `${league.toLowerCase()}-${abbr.toLowerCase()}`,
      league,
      name,
      shortName,
      abbreviation: abbr,
      conference,
      primaryColor: primary,
      secondaryColor: secondary,
      record: `${wins}-${losses}`,
      wins,
      losses,
      powerRating: Math.round(power * 10) / 10,
      offRating: off,
      defRating: def,
      pace,
      sos,
      consistency: clamp(cons, 0.75, 1.25),
      last5: l5.split('').map((c) => (c === 'W' ? 'W' : 'L')),
      trendDelta: trend,
    };
  });
}
