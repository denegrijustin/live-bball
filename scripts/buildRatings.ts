/**
 * Turns data/raw/*.json (real game results) into src/data/generated/*.json:
 *   - team ratings from the OLS + IRLS solver,
 *   - league calibration (home advantage, margin/total SD, average points) fitted to the same results,
 *   - the upcoming slate with sportsbook lines where posted,
 *   - season Monte Carlo projections over the remaining schedule.
 *
 * Usage: npx tsx scripts/buildRatings.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { solveRatings, type GameRow, type SolverOptions, type SolverResult } from '../src/engine/ratingSolver';
import { simulateSeason, type RemainingGame, type SeasonTeamInput } from '../src/engine/seasonSim';
import { NEUTRAL_ADJUSTMENTS, projectMatchup } from '../src/engine/mathModel';
import { LEAGUES } from '../src/data/leaguesConfig';
import type { LeagueConfig, LeagueId, ScheduledGame, SeasonProjection, TeamMetrics } from '../src/types/sports';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEASON_ITERS = 10000;

interface RawTeam {
  abbr: string;
  name: string;
  short: string;
  color: string;
  alt: string;
  conf: string;
  div: string;
  fbs: boolean;
}
interface Raw {
  fetchedAt: string;
  teams: Record<string, RawTeam>;
  results: [string, string, string, number, number, number][];
  upcoming: [string, string, string, string, number, number | null, number | null, number | null][];
}

interface LeagueSettings {
  id: LeagueId;
  file: string;
  halfLifeDays: number;
  ridgeMargin: number; // (noise sd / prior sd)^2
  ridgePoints: number;
  ridgeLogit: number;
  marginCap: number;
  slateDays: number;
  hfaPriorSd: number;
}

const SETTINGS: LeagueSettings[] = [
  { id: 'NFL', file: 'nfl', halfLifeDays: 75, ridgeMargin: 4.5, ridgePoints: 8, ridgeLogit: 1.6, marginCap: 21, slateDays: 8, hfaPriorSd: 1.0 },
  { id: 'NCAAF', file: 'ncaaf', halfLifeDays: 70, ridgeMargin: 2.0, ridgePoints: 3.5, ridgeLogit: 0.5, marginCap: 35, slateDays: 7, hfaPriorSd: 1.2 },
  { id: 'NBA', file: 'nba', halfLifeDays: 60, ridgeMargin: 7, ridgePoints: 10, ridgeLogit: 2.4, marginCap: 25, slateDays: 3, hfaPriorSd: 1.0 },
];

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

function meanSd(xs: number[]): { mean: number; sd: number } {
  const mean = xs.reduce((s, v) => s + v, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((s, v) => s + (v - mean) ** 2, 0) / xs.length) || 1;
  return { mean, sd };
}

function etDay(d: Date, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', ...opts }).format(d);
}

function startLabel(iso: string): string {
  const d = new Date(iso);
  const day = etDay(d, { weekday: 'short' });
  const time = etDay(d, { hour: 'numeric', minute: '2-digit' });
  return `${day} ${time} ET`;
}

function build(s: LeagueSettings) {
  const raw: Raw = JSON.parse(readFileSync(join(ROOT, `data/raw/${s.file}.json`), 'utf8'));
  const base = LEAGUES[s.id];
  const asOf = Date.parse(raw.fetchedAt);

  // Rated universe: every NFL/NBA team; for NCAAF only FBS. Games against unrated opponents (FCS and below) are
  // excluded from the fit: they are lopsided, barely informative about FBS quality and bias the home-advantage
  // estimate because ridge shrinkage under-fits very large talent gaps. They still count toward records.
  const universe = Object.keys(raw.teams).filter((id) => (s.id === 'NCAAF' ? raw.teams[id].fbs : true) && raw.teams[id].abbr !== 'TBD');
  const inU = new Set(universe);
  const ids = universe;
  const index = new Map(ids.map((id, i) => [id, i]));
  const rows: GameRow[] = raw.results
    .filter(([, h, a]) => inU.has(h) && inU.has(a))
    .map(([d, h, a, hs, as, neutral]) => ({
      t: Date.parse(d),
      h: index.get(h) as number,
      a: index.get(a) as number,
      hs,
      as,
      neutral: neutral === 1,
    }));

  const opts = (when: number): SolverOptions => ({
    asOf: when,
    halfLifeDays: s.halfLifeDays,
    ridgeMargin: s.ridgeMargin,
    ridgePoints: s.ridgePoints,
    ridgeLogit: s.ridgeLogit,
    marginCap: s.marginCap,
    hfaPrior: base.homeAdvantagePts,
    hfaPriorSd: s.hfaPriorSd,
    noiseSd: base.marginStdDev,
  });

  const now = solveRatings(ids.length, rows, opts(asOf));
  const cutoff = asOf - 14 * 86400000;
  const past = solveRatings(
    ids.length,
    rows.filter((g) => g.t <= cutoff),
    opts(cutoff),
  );

  const powerOf = (r: SolverResult): Map<string, number> => {
    const vals = universe.map((id) => r.overall[index.get(id) as number]);
    const { mean, sd } = meanSd(vals);
    return new Map(universe.map((id, k) => [id, clamp(50 + (20 * (vals[k] - mean)) / sd, 0, 100)]));
  };
  const powerNow = powerOf(now);
  const powerPast = powerOf(past);

  // Strength of schedule: z-score of mean opponent rating inside the universe -> 0..100.
  const oppVals = universe.map((id) => now.oppAvg[index.get(id) as number]);
  const oppStat = meanSd(oppVals);

  // Calibrate margin / total spread on the same games the solver used.
  let sw = 0;
  let sm = 0;
  let st = 0;
  let nGames = 0;
  const DAY = 86400000;
  for (const g of rows) {
    const w = Math.pow(0.5, (asOf - g.t) / DAY / s.halfLifeDays);
    const v = g.neutral ? 0 : 1;
    const eta = now.hfa / 2;
    const pH = now.off[g.h] + now.def[g.a] - now.mu + eta * v;
    const pA = now.off[g.a] + now.def[g.h] - now.mu - eta * v;
    sw += w;
    sm += w * (g.hs - g.as - (pH - pA)) ** 2;
    st += w * (g.hs + g.as - (pH + pA)) ** 2;
    nGames++;
  }
  const dof = Math.min(1.3, Math.sqrt(nGames / Math.max(nGames - universe.length, nGames * 0.5)));
  const config: LeagueConfig = {
    ...base,
    avgEfficiency: round(now.mu, 2),
    homeAdvantagePts: round(now.hfa, 2),
    marginStdDev: round(Math.sqrt(sm / sw) * dof, 2),
    totalStdDev: round(Math.sqrt(st / sw) * dof, 2),
  };
  const avgTotal = now.avgTotal;

  // Records and form from the results themselves.
  const rec = new Map<string, { w: number; l: number; t: number; form: ('W' | 'L')[] }>();
  for (const id of Object.keys(raw.teams)) rec.set(id, { w: 0, l: 0, t: 0, form: [] });
  for (const [, h, a, hs, as] of raw.results) {
    const H = rec.get(h)!;
    const A = rec.get(a)!;
    if (hs > as) {
      H.w++;
      A.l++;
      H.form.push('W');
      A.form.push('L');
    } else if (hs < as) {
      A.w++;
      H.l++;
      A.form.push('W');
      H.form.push('L');
    } else {
      H.t++;
      A.t++;
      H.form.push('L');
      A.form.push('L');
    }
  }

  const leagueSd = config.marginStdDev;
  const teams: TeamMetrics[] = universe.map((id) => {
    const i = index.get(id) as number;
    const t = raw.teams[id];
    const r = rec.get(id)!;
    const sos = clamp(50 + (15 * (now.oppAvg[i] - oppStat.mean)) / oppStat.sd, 0, 100);
    const power = powerNow.get(id) as number;
    const prior = powerPast.get(id);
    const hasPast = past.games[i] > 0 && prior !== undefined;
    return {
      id: `${s.id.toLowerCase()}-${id}`,
      league: s.id,
      name: t.name,
      shortName: t.short,
      abbreviation: t.abbr,
      conference: s.id === 'NFL' ? t.div : t.conf,
      division: s.id === 'NCAAF' ? undefined : t.div,
      primaryColor: t.color,
      secondaryColor: t.alt,
      record: r.t ? `${r.w}-${r.l}-${r.t}` : `${r.w}-${r.l}`,
      wins: r.w,
      losses: r.l,
      powerRating: round(power),
      offRating: round(now.off[i], 2),
      defRating: round(now.def[i], 2),
      pace: round(base.avgPace * (now.teamAvgTotal[i] / avgTotal), 1),
      sos: round(sos),
      consistency: round(clamp(leagueSd / now.teamResidSd[i], 0.75, 1.25), 3),
      last5: r.form.slice(-5),
      trendDelta: hasPast ? round(power - (prior as number)) : 0,
    };
  });
  const teamByRaw = new Map(universe.map((id, k) => [id, teams[k]]));
  const rawIdOf = new Map(teams.map((t, k) => [t.id, universe[k]]));

  // ---- Slate: upcoming games inside the window, both sides rated ----
  const windowEnd = asOf + s.slateDays * DAY;
  const slate: ScheduledGame[] = raw.upcoming
    .filter(([, d, h, a]) => Date.parse(d) <= windowEnd && inU.has(h) && inU.has(a))
    .map(([eid, d, h, a, neutral, spread, total, week]) => {
      const dt = new Date(d);
      const today = etDay(new Date(asOf), { year: 'numeric', month: 'numeric', day: 'numeric' });
      const tomorrow = etDay(new Date(asOf + DAY), { year: 'numeric', month: 'numeric', day: 'numeric' });
      const that = etDay(dt, { year: 'numeric', month: 'numeric', day: 'numeric' });
      const label =
        s.id === 'NBA'
          ? that === today
            ? 'Tonight'
            : that === tomorrow
              ? 'Tomorrow'
              : etDay(dt, { weekday: 'long' })
          : week !== null
            ? `Week ${week}`
            : etDay(dt, { month: 'short', day: 'numeric' });
      return {
        id: `${s.id.toLowerCase()}-${eid}`,
        league: s.id,
        startTime: startLabel(d),
        weekOrDateLabel: label,
        awayTeamId: (teamByRaw.get(a) as TeamMetrics).id,
        homeTeamId: (teamByRaw.get(h) as TeamMetrics).id,
        neutralSite: neutral === 1,
        vegasSpreadHome: spread,
        vegasTotal: total,
      };
    });

  // ---- Season simulation ----
  const tIndex = new Map(teams.map((t, k) => [t.id, k]));
  const pairCache = new Map<string, number>();
  const prob = (home: number, away: number, neutral: boolean): number => {
    const key = `${home}|${away}|${neutral ? 1 : 0}`;
    const hit = pairCache.get(key);
    if (hit !== undefined) return hit;
    const m = projectMatchup(teams[away], teams[home], neutral ? 'NEUTRAL' : 'TEAM_B_HOME', NEUTRAL_ADJUSTMENTS, config);
    pairCache.set(key, m.teamBWinProb);
    return m.teamBWinProb;
  };
  const remaining: RemainingGame[] = raw.upcoming
    .filter(([, , h, a]) => inU.has(h) && inU.has(a))
    .map(([, , h, a, neutral]) => {
      const home = tIndex.get(`${s.id.toLowerCase()}-${h}`) as number;
      const away = tIndex.get(`${s.id.toLowerCase()}-${a}`) as number;
      return { home, away, homeWinProb: prob(home, away, neutral === 1) };
    });
  const seasonInputs: SeasonTeamInput[] = teams.map((t, k) => ({
    index: k,
    conference: s.id === 'NFL' ? t.conference.split(' ')[0] : t.conference,
    division: t.division ?? t.conference,
    wins: t.wins + 0.5 * (rec.get(rawIdOf.get(t.id) as string)?.t ?? 0),
    power: t.powerRating,
  }));
  const odds = simulateSeason(seasonInputs, remaining, {
    league: s.id,
    iterations: SEASON_ITERS,
    seed: 20261121,
    pairProb: (home, away) => prob(home, away, false),
  });
  const remainingCount = new Array<number>(teams.length).fill(0);
  for (const g of remaining) {
    remainingCount[g.home]++;
    remainingCount[g.away]++;
  }
  const season: SeasonProjection[] = teams.map((t, k) => ({
    teamId: t.id,
    wins: t.wins,
    losses: t.losses,
    gamesRemaining: remainingCount[k],
    avgWins: round(odds[k].avgWins, 2),
    playoffPct: round(odds[k].playoffPct),
    divisionPct: round(odds[k].divisionPct),
    topSeedPct: round(odds[k].topSeedPct),
    topSixPct: round(odds[k].topSixPct),
    bowlPct: round(odds[k].bowlPct),
    cfpPct: round(odds[k].cfpPct),
  }));

  const meta = {
    asOf: raw.fetchedAt,
    source: 'ESPN public scoreboard API (completed results, schedule, DraftKings lines where posted)',
    gamesUsed: rows.length,
    teamsRated: ids.length,
    halfLifeDays: s.halfLifeDays,
    irlsIterations: now.iterations,
    seasonIterations: SEASON_ITERS,
  };
  writeFileSync(join(ROOT, `src/data/generated/${s.file}.json`), JSON.stringify({ meta, config, teams, slate, season }));

  // ---- Diagnostics ----
  const top = [...teams].sort((a, b) => b.powerRating - a.powerRating).slice(0, 6);
  console.log(
    `${s.id}: ${rows.length} games, ${ids.length} nodes (${universe.length} shown), IRLS ${now.iterations} it | ` +
      `mu ${config.avgEfficiency} hfa ${config.homeAdvantagePts} marginSd ${config.marginStdDev} totalSd ${config.totalStdDev}`,
  );
  console.log('   top:', top.map((t) => `${t.abbreviation} ${t.powerRating} (${t.record})`).join(', '));
  console.log(`   slate ${slate.length} games, ${slate.filter((g) => g.vegasSpreadHome !== null).length} with lines; remaining ${remaining.length}`);
}

mkdirSync(join(ROOT, 'src/data/generated'), { recursive: true });
for (const s of SETTINGS) build(s);
