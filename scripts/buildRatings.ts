import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { solveRatings, type GameRow, type SolverResult } from '../src/engine/ratingSolver';
import { simulateSeason, type RemainingGame, type SeasonTeamInput } from '../src/engine/seasonSim';
import { NEUTRAL_ADJUSTMENTS, projectMatchup } from '../src/engine/mathModel';
import { LEAGUES, isCbb } from '../src/data/leaguesConfig';
import { blendLeverage, simulateTourney, type TourneyTeam } from '../src/engine/tourneySim';
import type { DataMeta, LeagueConfig, LeverageRow, ScheduledGame, SeasonProjection, TeamMetrics } from '../src/types/sports';
import {
  DAY,
  ROOT,
  SETTINGS,
  loadRaw,
  priorFor,
  solvePriorSeason,
  solverOpts,
  toRows,
  universeOf,
  type LeagueSettings,
  type PriorSolve,
} from './lib/shared';

const SEASON_ITERS = 10000;
const TOURNEY_ITERS = 20000;

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
  const raw = loadRaw(s.file)!;
  const base = LEAGUES[s.id];
  const asOf = Date.parse(raw.fetchedAt);

  // Rated universe; games against unrated opponents (FCS and below) are excluded from the fit (they are lopsided and
  // bias home advantage) but still count toward records.
  const universe = universeOf(s, raw);
  const inU = new Set(universe);
  const ids = universe;
  const index = new Map(ids.map((id, i) => [id, i]));
  const rows: GameRow[] = toRows(raw, index);

  // Preseason prior: last season's solved ratings, carried over at s.carry.
  const priorRaw = loadRaw(s.file, true);
  const priorSolve: PriorSolve | null = priorRaw ? solvePriorSeason(s, priorRaw) : null;
  const prior = priorFor(ids, priorSolve, s.carry);

  const opts = (when: number) => solverOpts(s, when, prior);

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
  // Pool the variance with last season's full-season fit, weighted by game counts: early-season samples are small and
  // lopsided (buy games inflate residuals); as the season fills in, the current season takes over.
  if (priorSolve) {
    const wCur = nGames / (nGames + priorSolve.games);
    const pool = (cur: number, prev: number) => Math.sqrt(wCur * cur * cur + (1 - wCur) * prev * prev);
    config.marginStdDev = round(pool(config.marginStdDev, priorSolve.result.marginSd), 2);
    config.totalStdDev = round(pool(config.totalStdDev, priorSolve.result.totalSd), 2);
  }
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
      division: s.id === 'NFL' || s.id === 'NBA' ? t.div : undefined,
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
        s.id === 'NBA' || isCbb(s.id)
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
  const remainingCount = new Array<number>(teams.length).fill(0);
  for (const g of remaining) {
    remainingCount[g.home]++;
    remainingCount[g.away]++;
  }
  let season: SeasonProjection[];
  let leverage: LeverageRow[] = [];
  let tourneyMeta: DataMeta['tourney'];

  if (isCbb(s.id)) {
    // ---- NCAA tournament selection model + game leverage ----
    const lg = s.id.toLowerCase();
    const confWins = new Array<number>(teams.length).fill(0);
    for (const r of raw.results) {
      if (r[6] !== 1 || !inU.has(r[1]) || !inU.has(r[2])) continue;
      const winner = r[3] > r[4] ? r[1] : r[3] < r[4] ? r[2] : null;
      if (winner) confWins[tIndex.get(`${lg}-${winner}`) as number]++;
    }
    const games = raw.upcoming
      .filter(([, , h, a]) => inU.has(h) && inU.has(a))
      .map((u) => {
        const home = tIndex.get(`${lg}-${u[2]}`) as number;
        const away = tIndex.get(`${lg}-${u[3]}`) as number;
        const m = projectMatchup(teams[away], teams[home], u[4] === 1 ? 'NEUTRAL' : 'TEAM_B_HOME', NEUTRAL_ADJUSTMENTS, config);
        return { eid: u[0], date: u[1], neutral: u[4] === 1, g: { home, away, mean: m.expectedMarginB, conf: u[8] === 1 } };
      });
    // Rating uncertainty shrinks with games played (early-season ratings lean on the prior).
    const sigma0 = 3.2;
    const g0 = 6;
    const tTeams: TourneyTeam[] = teams.map((t, k) => ({
      index: k,
      conference: t.conference,
      wins: t.wins,
      confWins: confWins[k],
      rating: now.overall[k],
      sigma: sigma0 * Math.sqrt(g0 / (g0 + now.games[k])),
    }));
    const avgGames = teams.reduce((m, t, k) => m + t.wins + t.losses + remainingCount[k], 0) / teams.length;
    const res = simulateTourney(tTeams, games.map((x) => x.g), {
      iterations: TOURNEY_ITERS,
      seed: 20261121,
      marginSd: config.marginStdDev,
      neutralMargin: (i, j) => projectMatchup(teams[j], teams[i], 'NEUTRAL', NEUTRAL_ADJUSTMENTS, config).expectedMarginB,
      lambdaPerWin: (1.6 * config.marginStdDev) / avgGames,
      committeeNoise: 1.5,
      fieldSize: 68,
      bracketSize: 8,
    });
    season = teams.map((t, k) => ({
      teamId: t.id,
      wins: t.wins,
      losses: t.losses,
      gamesRemaining: remainingCount[k],
      avgWins: round(res.teams[k].avgWins, 2),
      playoffPct: round(res.teams[k].bidPct),
      divisionPct: 0,
      topSeedPct: 0,
      topSixPct: 0,
      bowlPct: 0,
      cfpPct: 0,
      bidPct: round(res.teams[k].bidPct),
      autoBidPct: round(res.teams[k].autoBidPct),
      atLargePct: round(res.teams[k].atLargePct),
      avgSeed: res.teams[k].avgSeed === null ? null : round(res.teams[k].avgSeed as number),
    }));
    const MIN_N = 40; // need at least this many (effective) simulations behind each side of a game
    games.forEach((x, gi) => {
      const st = res.games[gi];
      // Heavy favourites: blend the low-variance counterfactual with the weighted estimate (weight by effective n).
      // Conference games that are close to toss-ups use the split estimator, the only one that also sees the effect on
      // conference seeding (-> automatic bid); lopsided conference games fall back to the blend.
      const n = st.rbEffN;
      const useSplit = x.g.conf && Math.min(st.nHomeWin, st.nAwayWin) >= 2000;
      const hW = useSplit ? st.homeBidIfWin : blendLeverage(st.cfHomeBidIfWin, st.rbHomeBidIfWin, n);
      const hL = useSplit ? st.homeBidIfLoss : blendLeverage(st.cfHomeBidIfLoss, st.rbHomeBidIfLoss, n);
      const aW = useSplit ? st.awayBidIfWin : blendLeverage(st.cfAwayBidIfWin, st.rbAwayBidIfWin, n);
      const aL = useSplit ? st.awayBidIfLoss : blendLeverage(st.cfAwayBidIfLoss, st.rbAwayBidIfLoss, n);
      const sides: [number, number, boolean, number | null, number | null, number, number][] = [
        [x.g.home, x.g.away, true, hW, hL, TOURNEY_ITERS, TOURNEY_ITERS],
        [x.g.away, x.g.home, false, aW, aL, TOURNEY_ITERS, TOURNEY_ITERS],
      ];
      for (const [ti, oi, home, ifW, ifL, nW, nL] of sides) {
        const base = res.teams[ti].bidPct;
        if (base < 0.5 || base > 99.5 || ifW === null || ifL === null || nW < MIN_N || nL < MIN_N) continue;
        if (Math.abs(ifW - ifL) * 100 < 0.3) continue;
        leverage.push({
          gameId: `${lg}-${x.eid}`,
          teamId: teams[ti].id,
          oppId: teams[oi].id,
          date: x.date,
          home,
          neutral: x.neutral,
          winProb: round(home ? st.nHomeWin / TOURNEY_ITERS : st.nAwayWin / TOURNEY_ITERS, 3),
          bidBase: round(base),
          bidIfWin: round(ifW * 100),
          bidIfLoss: round(ifL * 100),
          nWin: home ? st.nHomeWin : st.nAwayWin,
          nLoss: home ? st.nAwayWin : st.nHomeWin,
        });
      }
    });
    if (process.env.TOURNEY_CHECK) {
      // Compare split-by-outcome leverage with forced-outcome simulations for the biggest swings.
      const ranked = leverage.map((r) => ({ r, swing: r.bidIfWin - r.bidIfLoss })).sort((a, b) => b.swing - a.swing);
      const picks = [
        ...ranked.filter((x) => x.r.winProb > 0.4 && x.r.winProb < 0.6).slice(0, 2),
        ...ranked.filter((x) => x.r.winProb > 0.95 && x.r.bidBase > 30 && x.r.bidBase < 80).slice(0, 3),
      ];
      for (const { r } of picks) {
        const gi = games.findIndex((x) => `${lg}-${x.eid}` === r.gameId);
        const ti = teams.findIndex((t) => t.id === r.teamId);
        const isHome = games[gi].g.home === ti;
        const run = (teamWins: boolean) =>
          simulateTourney(tTeams, games.map((x) => x.g), {
            iterations: 20000, seed: 99, marginSd: config.marginStdDev,
            neutralMargin: (i, j) => projectMatchup(teams[j], teams[i], 'NEUTRAL', NEUTRAL_ADJUSTMENTS, config).expectedMarginB,
            lambdaPerWin: (1.6 * config.marginStdDev) / avgGames, committeeNoise: 1.5, fieldSize: 68, bracketSize: 8,
            force: { game: gi, homeWins: isHome ? teamWins : !teamWins },
          }).teams[ti].bidPct;
        console.log(
          `   CHECK ${teams[ti].abbreviation} v ${teams[teams.findIndex((t) => t.id === r.oppId)].abbreviation} p=${r.winProb}: base ${r.bidBase} | model W ${r.bidIfWin} L ${r.bidIfLoss} | forced W ${run(true).toFixed(1)} L ${run(false).toFixed(1)}`,
        );
      }
    }
    tourneyMeta = { iterations: TOURNEY_ITERS, autoBidConferences: res.autoBidConferences.length, atLargeSlots: res.atLargeSlots, fieldSize: 68 };
    const sumBid = res.teams.reduce((m, t) => m + t.bidPct, 0) / 100;
    const bubble = teams
      .map((t, k) => ({ t, b: res.teams[k].bidPct }))
      .filter((x) => x.b > 35 && x.b < 65)
      .length;
    console.log(`   tourney: ${res.autoBidConferences.length} auto-bid conferences, ${res.atLargeSlots} at-large slots, mean field size ${sumBid.toFixed(1)}, ${bubble} bubble teams (35-65%), ${leverage.length} leverage rows`);
  } else {
    const odds = simulateSeason(seasonInputs, remaining, {
      league: s.id,
      iterations: SEASON_ITERS,
      seed: 20261121,
      pairProb: (home, away) => prob(home, away, false),
    });
    season = teams.map((t, k) => ({
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
  }

  const meta: DataMeta = {
    asOf: raw.fetchedAt,
    source: 'ESPN public scoreboard API (completed results, schedule, DraftKings lines where posted)',
    gamesUsed: rows.length,
    teamsRated: ids.length,
    halfLifeDays: s.halfLifeDays,
    irlsIterations: now.iterations,
    priorSeason: priorRaw ? `${priorRaw.seasonStartYear}` : null,
    priorCarry: priorRaw ? s.carry : 0,
    priorTeams: prior ? prior.has.reduce((m, v) => m + v, 0) : 0,
    seasonIterations: isCbb(s.id) ? TOURNEY_ITERS : SEASON_ITERS,
    tourney: tourneyMeta,
  };
  writeFileSync(join(ROOT, `src/data/generated/${s.file}.json`), JSON.stringify({ meta, config, teams, slate, season, leverage }));

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
const only = process.argv[2]?.toLowerCase();
for (const s of SETTINGS) if (!only || s.file === only) build(s);
