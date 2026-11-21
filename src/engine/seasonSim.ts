/**
 * Monte Carlo over the remaining regular season using each game's analytic win probability, then league-specific
 * postseason qualification.
 *
 *  NFL    4 division winners + 3 wild cards per conference. Ties on wins are broken by head-to-head win %, then
 *         division record (division ties), then conference record, then a coin flip. Strength of victory/schedule and
 *         common-games tiebreakers are not modelled, and multi-team ties use pooled head-to-head % instead of the
 *         official step-by-step elimination.
 *  NBA    Seeds by wins; ties by division winner, head-to-head, conference record, then a coin flip. Top 6 qualify;
 *         7-10 play the play-in (7v8 winner is the 7 seed, 9v10 loser is out, 7v8 loser hosts the 9v10 winner for the 8).
 *  NCAAF  Conference titles are decided by conference record, with a championship game between the top two in
 *         conferences that hold one (winner gets the extra win). The 12-team CFP takes the five highest-ranked
 *         conference champions plus the next seven, ranking by wins then rating with committee noise.
 */
import type { LeagueId } from '../types/sports';
import { mulberry32 } from './monteCarlo';

export interface SeasonTeamInput {
  index: number;
  conference: string;
  division: string;
  wins: number; // current wins (ties count 0.5)
  power: number; // rating used for ranking when records tie (higher = better)
  divWins?: number; // current division record
  divLosses?: number;
  confWins?: number; // current conference record
  confLosses?: number;
}

export interface RemainingGame {
  home: number; // index into teams
  away: number;
  homeWinProb: number;
}

export interface SeasonOdds {
  avgWins: number;
  playoffPct: number;
  divisionPct: number; // NFL only
  topSeedPct: number; // NFL/NBA: #1 seed in conference
  topSixPct: number; // NBA only
  playInPct: number; // NBA only: finishes 7th-10th
  confChampPct: number; // NCAAF only: wins its conference
  bowlPct: number; // NCAAF only: >= 6 wins
  cfpPct: number; // NCAAF only
}

export interface SeasonOptions {
  league: LeagueId;
  iterations?: number;
  seed?: number;
  /** Win probability for the home side (first argument) in a game at the higher seed's venue (NBA play-in). */
  pairProb?: (home: number, away: number) => number;
  /** Win probability of the first team against the second on a neutral court (NCAAF title games). */
  neutralProb?: (a: number, b: number) => number;
  /** Head-to-head wins so far: h2hWins[i * n + j] = games team i has won against team j. */
  h2hWins?: Float64Array;
  /** NCAAF conferences that play a championship game between the top two teams. */
  titleGameConferences?: string[];
  cfpField?: number; // 12
  cfpAutoBids?: number; // 5
}

const pctOf = (w: number, l: number) => (w + l > 0 ? w / (w + l) : 0.5);

export function simulateSeason(teams: SeasonTeamInput[], remaining: RemainingGame[], opts: SeasonOptions): SeasonOdds[] {
  const n = teams.length;
  const iters = opts.iterations ?? 10000;
  const rng = mulberry32(opts.seed ?? 7);
  const league = opts.league;
  const useH2H = league === 'NFL' || league === 'NBA';

  let spare = 0;
  let hasSpare = false;
  const gauss = (): number => {
    if (hasSpare) {
      hasSpare = false;
      return spare;
    }
    let u1 = rng();
    while (u1 === 0) u1 = rng();
    const u2 = rng();
    const r = Math.sqrt(-2 * Math.log(u1));
    spare = r * Math.sin(2 * Math.PI * u2);
    hasSpare = true;
    return r * Math.cos(2 * Math.PI * u2);
  };

  const sumWins = new Float64Array(n);
  const playoff = new Float64Array(n);
  const division = new Float64Array(n);
  const topSeed = new Float64Array(n);
  const topSix = new Float64Array(n);
  const playIn = new Float64Array(n);
  const champ = new Float64Array(n);
  const bowl = new Float64Array(n);
  const cfp = new Float64Array(n);

  const confs = Array.from(new Set(teams.map((t) => t.conference)));
  const divisions = Array.from(new Set(teams.map((t) => t.division)));
  const byConf = new Map<string, number[]>(confs.map((c) => [c, teams.filter((t) => t.conference === c).map((t) => t.index)]));
  const byDiv = new Map<string, number[]>(divisions.map((d) => [d, teams.filter((t) => t.division === d).map((t) => t.index)]));
  const titleConfs = new Set(opts.titleGameConferences ?? []);
  const cfpField = opts.cfpField ?? 12;
  const cfpAuto = opts.cfpAutoBids ?? 5;

  // Game flags are fixed by team membership, so compute them once.
  const sameDiv = new Uint8Array(remaining.length);
  const sameConf = new Uint8Array(remaining.length);
  remaining.forEach((g, k) => {
    sameDiv[k] = teams[g.home].division === teams[g.away].division ? 1 : 0;
    sameConf[k] = teams[g.home].conference === teams[g.away].conference ? 1 : 0;
  });

  const wins = new Float64Array(n);
  const divW = new Float64Array(n);
  const divL = new Float64Array(n);
  const confW = new Float64Array(n);
  const confL = new Float64Array(n);
  const tie = new Float64Array(n);
  const noise = new Float64Array(n);
  const h2h = new Float64Array(useH2H ? n * n : 0);
  const isDivWinner = new Uint8Array(n);

  // ---- Tiebreak machinery ----------------------------------------------------------------------------------------
  type Mode = 'division' | 'conference' | 'nba';

  /** Pooled head-to-head win % of team i against the other members of the tied group (0.5 when they never met). */
  const h2hPct = (i: number, group: number[]): number => {
    if (!useH2H) return 0.5;
    let w = 0;
    let g = 0;
    for (const j of group) {
      if (j === i) continue;
      w += h2h[i * n + j];
      g += h2h[i * n + j] + h2h[j * n + i];
    }
    return g > 0 ? w / g : 0.5;
  };

  /** Orders candidates best-first: wins, then the mode's tiebreakers within each group of equal wins, then a coin flip. */
  const order = (cands: number[], mode: Mode): number[] => {
    const sorted = [...cands].sort((a, b) => wins[b] - wins[a] || tie[b] - tie[a]);
    const out: number[] = [];
    let k = 0;
    while (k < sorted.length) {
      let m = k + 1;
      while (m < sorted.length && wins[sorted[m]] === wins[sorted[k]]) m++;
      const group = sorted.slice(k, m);
      if (group.length > 1) {
        const keys = new Map<number, number[]>();
        for (const i of group) {
          const h = h2hPct(i, group);
          const dv = pctOf(divW[i], divL[i]);
          const cf = pctOf(confW[i], confL[i]);
          keys.set(i, mode === 'division' ? [h, dv, cf] : mode === 'nba' ? [isDivWinner[i], h, cf] : [h, cf]);
        }
        group.sort((a, b) => {
          const ka = keys.get(a) as number[];
          const kb = keys.get(b) as number[];
          for (let q = 0; q < ka.length; q++) if (ka[q] !== kb[q]) return kb[q] - ka[q];
          return tie[b] - tie[a];
        });
      }
      out.push(...group);
      k = m;
    }
    return out;
  };

  const pp = opts.pairProb ?? (() => 0.5);
  const np = opts.neutralProb ?? (() => 0.5);

  for (let s = 0; s < iters; s++) {
    for (let i = 0; i < n; i++) {
      const t = teams[i];
      wins[i] = t.wins;
      divW[i] = t.divWins ?? 0;
      divL[i] = t.divLosses ?? 0;
      confW[i] = t.confWins ?? 0;
      confL[i] = t.confLosses ?? 0;
      tie[i] = rng();
      isDivWinner[i] = 0;
    }
    if (useH2H) {
      if (opts.h2hWins) h2h.set(opts.h2hWins);
      else h2h.fill(0);
    }

    for (let k = 0; k < remaining.length; k++) {
      const g = remaining[k];
      const homeWon = rng() < g.homeWinProb;
      const w = homeWon ? g.home : g.away;
      const l = homeWon ? g.away : g.home;
      wins[w] += 1;
      if (sameDiv[k]) {
        divW[w] += 1;
        divL[l] += 1;
      }
      if (sameConf[k]) {
        confW[w] += 1;
        confL[l] += 1;
      }
      if (useH2H) h2h[w * n + l] += 1;
    }
    for (let i = 0; i < n; i++) sumWins[i] += wins[i];

    if (league === 'NFL') {
      for (const conf of confs) {
        const members = byConf.get(conf) ?? [];
        const winners: number[] = [];
        for (const d of divisions) {
          const dm = (byDiv.get(d) ?? []).filter((i) => teams[i].conference === conf);
          if (!dm.length) continue;
          const w = order(dm, 'division')[0];
          winners.push(w);
          division[w]++;
        }
        const seededWinners = order(winners, 'conference');
        const rest = order(
          members.filter((i) => !winners.includes(i)),
          'conference',
        ).slice(0, 3);
        for (const i of [...seededWinners, ...rest]) playoff[i]++;
        topSeed[seededWinners[0]]++;
      }
    } else if (league === 'NBA') {
      for (const d of divisions) {
        const dm = byDiv.get(d) ?? [];
        if (dm.length) isDivWinner[order(dm, 'division')[0]] = 1;
      }
      for (const conf of confs) {
        const seeds = order(byConf.get(conf) ?? [], 'nba');
        for (let k = 0; k < 6 && k < seeds.length; k++) {
          playoff[seeds[k]]++;
          topSix[seeds[k]]++;
        }
        if (seeds.length > 0) topSeed[seeds[0]]++;
        if (seeds.length >= 10) {
          const [s7, s8, s9, s10] = [seeds[6], seeds[7], seeds[8], seeds[9]];
          for (const i of [s7, s8, s9, s10]) playIn[i]++;
          const w78 = rng() < pp(s7, s8) ? s7 : s8; // 7 hosts 8; winner is the 7 seed
          const l78 = w78 === s7 ? s8 : s7;
          const w910 = rng() < pp(s9, s10) ? s9 : s10; // 9 hosts 10
          const eighth = rng() < pp(l78, w910) ? l78 : w910; // 7v8 loser hosts
          playoff[w78]++;
          playoff[eighth]++;
        }
      }
    } else if (league === 'NCAAF') {
      for (let i = 0; i < n; i++) noise[i] = gauss();
      const champions: number[] = [];
      for (const conf of confs) {
        const members = byConf.get(conf) ?? [];
        if (members.length < 2 || /indep/i.test(conf)) continue;
        // Conference record decides the table; coin flip on ties.
        const table = [...members].sort((a, b) => confW[b] - confW[a] || confL[a] - confL[b] || tie[b] - tie[a]);
        let winner = table[0];
        if (titleConfs.has(conf)) {
          const [a, b] = [table[0], table[1]];
          winner = rng() < np(a, b) ? a : b;
          wins[winner] += 1; // the championship game is an extra game for both; only the winner's win total changes
        }
        champions.push(winner);
        champ[winner]++;
      }
      // Rank by wins, then rating plus committee noise.
      const score = (i: number) => wins[i] * 100 + teams[i].power + 3 * noise[i];
      const ranked = [...Array(n).keys()].sort((a, b) => score(b) - score(a));
      const champSet = new Set(champions);
      const autos = ranked.filter((i) => champSet.has(i)).slice(0, cfpAuto);
      const taken = new Set(autos);
      const field = [...autos];
      for (const i of ranked) {
        if (field.length >= cfpField) break;
        if (!taken.has(i)) field.push(i);
      }
      for (const i of field) cfp[i]++;
      for (let i = 0; i < n; i++) if (wins[i] >= 6) bowl[i]++;
    }
  }

  const f = 100 / iters;
  return teams.map((_, i) => ({
    avgWins: sumWins[i] / iters,
    playoffPct: (league === 'NCAAF' ? cfp[i] : playoff[i]) * f,
    divisionPct: division[i] * f,
    topSeedPct: topSeed[i] * f,
    topSixPct: topSix[i] * f,
    playInPct: playIn[i] * f,
    confChampPct: champ[i] * f,
    bowlPct: bowl[i] * f,
    cfpPct: cfp[i] * f,
  }));
}
