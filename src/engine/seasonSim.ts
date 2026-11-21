import type { LeagueId } from '../types/sports';
import { mulberry32 } from './monteCarlo';

export interface SeasonTeamInput {
  index: number;
  conference: string;
  division: string;
  wins: number; // current wins (ties count 0.5)
  power: number; // tiebreak / ranking strength (higher = better)
}

export interface RemainingGame {
  home: number; // index into teams
  away: number;
  homeWinProb: number;
}

export interface SeasonOdds {
  avgWins: number;
  playoffPct: number;
  divisionPct: number; // NFL only (0 elsewhere)
  topSeedPct: number; // NFL/NBA: #1 seed in conference; NCAAF: 0
  topSixPct: number; // NBA only: direct qualification without play-in
  bowlPct: number; // NCAAF only: >= 6 wins
  cfpPct: number; // NCAAF only (simplified: top 12 by simulated record then rating)
}

export interface SeasonOptions {
  league: LeagueId;
  iterations?: number;
  seed?: number;
  /** Win probability for the higher seed hosting in the NBA play-in. */
  pairProb?: (home: number, away: number) => number;
}

/**
 * Monte Carlo over the remaining regular season using each game's analytic win probability, then league-specific
 * postseason qualification. Tiebreakers are simplified: ties on wins are broken at random (NFL/NBA) or by rating (NCAAF).
 */
export function simulateSeason(
  teams: SeasonTeamInput[],
  remaining: RemainingGame[],
  opts: SeasonOptions,
): SeasonOdds[] {
  const n = teams.length;
  const iters = opts.iterations ?? 10000;
  const rng = mulberry32(opts.seed ?? 7);

  const sumWins = new Float64Array(n);
  const playoff = new Float64Array(n);
  const division = new Float64Array(n);
  const topSeed = new Float64Array(n);
  const topSix = new Float64Array(n);
  const bowl = new Float64Array(n);
  const cfp = new Float64Array(n);

  const confs = Array.from(new Set(teams.map((t) => t.conference)));
  const divisions = Array.from(new Set(teams.map((t) => t.division)));
  const byConf = new Map<string, number[]>(confs.map((c) => [c, teams.filter((t) => t.conference === c).map((t) => t.index)]));
  const byDiv = new Map<string, number[]>(divisions.map((d) => [d, teams.filter((t) => t.division === d).map((t) => t.index)]));

  const wins = new Float64Array(n);
  const tie = new Float64Array(n);

  for (let s = 0; s < iters; s++) {
    for (let i = 0; i < n; i++) {
      wins[i] = teams[i].wins;
      tie[i] = rng();
    }
    for (const g of remaining) {
      if (rng() < g.homeWinProb) wins[g.home] += 1;
      else wins[g.away] += 1;
    }
    for (let i = 0; i < n; i++) sumWins[i] += wins[i];

    const better = (a: number, b: number) => (wins[a] !== wins[b] ? wins[b] - wins[a] : tie[b] - tie[a]);

    if (opts.league === 'NFL') {
      for (const conf of confs) {
        const members = byConf.get(conf) ?? [];
        const winners: number[] = [];
        for (const d of divisions) {
          const dm = (byDiv.get(d) ?? []).filter((i) => teams[i].conference === conf);
          if (!dm.length) continue;
          const w = [...dm].sort(better)[0];
          winners.push(w);
          division[w]++;
        }
        winners.sort(better);
        const rest = members.filter((i) => !winners.includes(i)).sort(better).slice(0, 3);
        for (const i of [...winners, ...rest]) playoff[i]++;
        topSeed[winners[0]]++;
      }
    } else if (opts.league === 'NBA') {
      for (const conf of confs) {
        const order = [...(byConf.get(conf) ?? [])].sort(better);
        for (let k = 0; k < 6; k++) {
          playoff[order[k]]++;
          topSix[order[k]]++;
        }
        topSeed[order[0]]++;
        // Play-in: 7v8 winner takes seed 7; its loser faces the 9v10 winner for seed 8.
        const [s7, s8, s9, s10] = [order[6], order[7], order[8], order[9]];
        const pp = opts.pairProb ?? (() => 0.5);
        const w78 = rng() < pp(s7, s8) ? s7 : s8;
        const l78 = w78 === s7 ? s8 : s7;
        const w910 = rng() < pp(s9, s10) ? s9 : s10;
        const finalHost = l78;
        const w8 = rng() < pp(finalHost, w910) ? l78 : w910;
        playoff[w78]++;
        playoff[w8]++;
      }
    } else {
      const ranked = teams.map((t) => t.index).sort((a, b) => (wins[a] !== wins[b] ? wins[b] - wins[a] : teams[b].power - teams[a].power + (tie[b] - tie[a]) * 0.5));
      for (let k = 0; k < 12; k++) cfp[ranked[k]]++;
      for (let i = 0; i < n; i++) if (wins[i] >= 6) bowl[i]++;
    }
  }

  const f = 100 / iters;
  return teams.map((_, i) => ({
    avgWins: sumWins[i] / iters,
    playoffPct: (opts.league === 'NCAAF' ? cfp[i] : playoff[i]) * f,
    divisionPct: division[i] * f,
    topSeedPct: topSeed[i] * f,
    topSixPct: topSix[i] * f,
    bowlPct: bowl[i] * f,
    cfpPct: cfp[i] * f,
  }));
}
