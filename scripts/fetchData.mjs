#!/usr/bin/env node
/**
 * Pulls completed results, the remaining schedule and (when posted) sportsbook lines from ESPN's public
 * scoreboard JSON and writes compact snapshots to data/raw/{nfl,ncaaf,nba}.json.
 *
 * Usage: node scripts/fetchData.mjs [nfl|ncaaf|nba ...]
 * Uses curl (honours the proxy/CA settings of the environment) so it has no npm dependencies.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://site.api.espn.com/apis/site/v2/sports';

async function getJson(url, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const { stdout } = await run('curl', ['-sS', '--fail', '--compressed', '--max-time', '60', url], {
        maxBuffer: 256 * 1024 * 1024,
      });
      return JSON.parse(stdout);
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 500 * (i + 1) ** 2));
    }
  }
  throw new Error(`GET ${url} failed: ${last?.message}`);
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

// Static division maps (ESPN abbreviations). Conference is the first token of the division for the NFL.
const NFL_DIVS = {
  'AFC East': ['BUF', 'MIA', 'NE', 'NYJ'],
  'AFC North': ['BAL', 'CIN', 'CLE', 'PIT'],
  'AFC South': ['HOU', 'IND', 'JAX', 'TEN'],
  'AFC West': ['DEN', 'KC', 'LV', 'LAC'],
  'NFC East': ['DAL', 'NYG', 'PHI', 'WSH'],
  'NFC North': ['CHI', 'DET', 'GB', 'MIN'],
  'NFC South': ['ATL', 'CAR', 'NO', 'TB'],
  'NFC West': ['ARI', 'LAR', 'SF', 'SEA'],
};
const NBA_DIVS = {
  'Eastern|Atlantic': ['BOS', 'BKN', 'NY', 'PHI', 'TOR'],
  'Eastern|Central': ['CHI', 'CLE', 'DET', 'IND', 'MIL'],
  'Eastern|Southeast': ['ATL', 'CHA', 'MIA', 'ORL', 'WSH'],
  'Western|Northwest': ['DEN', 'MIN', 'OKC', 'POR', 'UTAH'],
  'Western|Pacific': ['GS', 'LAC', 'LAL', 'PHX', 'SAC'],
  'Western|Southwest': ['DAL', 'HOU', 'MEM', 'NO', 'SA'],
};

function invert(map, split) {
  const out = {};
  for (const [k, abbrs] of Object.entries(map)) for (const a of abbrs) out[a] = split ? k.split('|') : [k.split(' ')[0], k];
  return out;
}
const NFL_LOOKUP = invert(NFL_DIVS, false); // abbr -> [conference, division]
const NBA_LOOKUP = invert(NBA_DIVS, true); // abbr -> [conference, division]

function parseEvent(e) {
  const c = e.competitions?.[0];
  if (!c) return null;
  const home = c.competitors.find((x) => x.homeAway === 'home');
  const away = c.competitors.find((x) => x.homeAway === 'away');
  if (!home || !away) return null;
  const status = e.status?.type?.name ?? '';
  const odds = c.odds?.[0];
  const spread = odds && typeof odds.spread === 'number' ? odds.spread : null; // ESPN quotes the home-team spread
  const total = odds && typeof odds.overUnder === 'number' ? odds.overUnder : null;
  return {
    id: String(e.id),
    date: e.date,
    status,
    seasonType: e.season?.type ?? null,
    week: e.week?.number ?? null,
    neutral: Boolean(c.neutralSite),
    home: { team: home.team, score: home.score === undefined ? null : Number(home.score) },
    away: { team: away.team, score: away.score === undefined ? null : Number(away.score) },
    spread,
    total,
  };
}

const hex = (c, fb) => (c ? `#${String(c).replace('#', '')}` : fb);

async function collect(league) {
  const events = new Map();
  const add = (list) => {
    for (const raw of list ?? []) {
      const p = parseEvent(raw);
      if (p) events.set(p.id, p);
    }
  };
  let extra = {};

  if (league === 'nfl') {
    const weeks = Array.from({ length: 18 }, (_, i) => i + 1);
    await pool(weeks, 6, async (w) => add((await getJson(`${BASE}/football/nfl/scoreboard?seasontype=2&week=${w}&limit=100`)).events));
  } else if (league === 'ncaaf') {
    const confs = await getJson(`${BASE}/football/college-football/scoreboard/conferences`);
    const confList = confs.conferences ?? [];
    const names = {};
    const fbs = new Set(['18']);
    for (const c of confList) {
      names[c.groupId] = c.shortName ?? c.name;
      if (c.parentGroupId === '80') fbs.add(c.groupId);
    }
    extra = { confNames: names, fbsConfIds: [...fbs] };
    const jobs = [];
    for (let w = 1; w <= 15; w++) for (const g of [80, 81]) jobs.push([w, g]);
    await pool(jobs, 6, async ([w, g]) =>
      add((await getJson(`${BASE}/football/college-football/scoreboard?week=${w}&groups=${g}&limit=400`)).events),
    );
  } else if (league === 'nba') {
    const days = [];
    const start = Date.UTC(2026, 9, 18);
    const end = Date.UTC(2027, 3, 20);
    for (let t = start; t <= end; t += 86400000) days.push(new Date(t).toISOString().slice(0, 10).replaceAll('-', ''));
    await pool(days, 8, async (d) => add((await getJson(`${BASE}/basketball/nba/scoreboard?dates=${d}&limit=100`)).events));
  } else throw new Error(`unknown league ${league}`);

  // Drop placeholder fixtures (e.g. NBA Cup knockouts not yet drawn) and, for the NBA, non-regular-season games.
  const all = [...events.values()].filter(
    (e) =>
      e.home.team.abbreviation !== 'TBD' &&
      e.away.team.abbreviation !== 'TBD' &&
      (league === 'nba' ? e.seasonType === 2 : true),
  );
  const teams = new Map();
  const noteTeam = (t) => {
    if (!teams.has(t.id)) teams.set(t.id, t);
  };
  for (const e of all) {
    noteTeam(e.home.team);
    noteTeam(e.away.team);
  }

  const teamOut = {};
  for (const t of teams.values()) {
    const abbr = t.abbreviation;
    let conf = '';
    let div = '';
    let fbs = true;
    if (league === 'nfl') [conf, div] = NFL_LOOKUP[abbr] ?? ['', ''];
    else if (league === 'nba') [conf, div] = NBA_LOOKUP[abbr] ?? ['', ''];
    else {
      conf = extra.confNames[t.conferenceId] ?? '';
      fbs = extra.fbsConfIds.includes(t.conferenceId);
    }
    teamOut[t.id] = {
      abbr,
      name: t.displayName,
      short: t.shortDisplayName ?? t.location ?? t.displayName,
      color: hex(t.color, '#334155'),
      alt: hex(t.alternateColor, '#94a3b8'),
      conf,
      div,
      fbs,
    };
  }

  const results = [];
  const upcoming = [];
  for (const e of all) {
    const hId = e.home.team.id;
    const aId = e.away.team.id;
    if (e.status === 'STATUS_FINAL' && e.home.score !== null && e.away.score !== null) {
      results.push([e.date, hId, aId, e.home.score, e.away.score, e.neutral ? 1 : 0]);
    } else if (['STATUS_SCHEDULED', 'STATUS_IN_PROGRESS', 'STATUS_HALFTIME', 'STATUS_END_PERIOD', 'STATUS_DELAYED'].includes(e.status)) {
      upcoming.push([e.id, e.date, hId, aId, e.neutral ? 1 : 0, e.spread, e.total, e.week]);
    }
  }
  results.sort((a, b) => a[0].localeCompare(b[0]));
  upcoming.sort((a, b) => a[1].localeCompare(b[1]));

  return {
    league,
    source: 'ESPN public scoreboard API (site.api.espn.com)',
    fetchedAt: new Date().toISOString(),
    teams: teamOut,
    results,
    upcoming,
    meta: extra.fbsConfIds ? { fbsConfIds: extra.fbsConfIds } : {},
  };
}

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : ['nfl', 'ncaaf', 'nba'];
await mkdir(join(ROOT, 'data/raw'), { recursive: true });
for (const lg of wanted) {
  process.stdout.write(`fetching ${lg}… `);
  const data = await collect(lg);
  await writeFile(join(ROOT, `data/raw/${lg}.json`), JSON.stringify(data));
  const withOdds = data.upcoming.filter((u) => u[5] !== null).length;
  console.log(
    `${Object.keys(data.teams).length} teams, ${data.results.length} results, ${data.upcoming.length} upcoming (${withOdds} with lines)`,
  );
}
