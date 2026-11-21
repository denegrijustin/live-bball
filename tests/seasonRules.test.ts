import { describe, expect, it } from 'vitest';
import { simulateSeason, type SeasonTeamInput } from '../src/engine/seasonSim';

/** 32-team NFL: AFC/NFC, four divisions of four. Index = conference*16 + division*4 + slot. */
function nflTeams(over: Record<number, Partial<SeasonTeamInput>> = {}): SeasonTeamInput[] {
  const out: SeasonTeamInput[] = [];
  for (const conf of ['AFC', 'NFC'])
    for (let d = 0; d < 4; d++)
      for (let k = 0; k < 4; k++) {
        const i = out.length;
        out.push({ index: i, conference: conf, division: `${conf} D${d}`, wins: 5, power: 50, ...over[i] });
      }
  return out;
}
const run = (teams: SeasonTeamInput[], h2h?: Float64Array) =>
  simulateSeason(teams, [], { league: 'NFL', iterations: 50, seed: 1, h2hWins: h2h });
const matrix = (n: number, wins: [number, number, number][]) => {
  const m = new Float64Array(n * n);
  for (const [w, l, c] of wins) m[w * n + l] = c;
  return m;
};

describe('NFL tiebreakers', () => {
  // Teams 0 (A) and 1 (B) tie for the AFC D0 title at 10-7.
  const tied = { 0: { wins: 10 }, 1: { wins: 10 }, 2: { wins: 4 }, 3: { wins: 4 } };

  it('head-to-head decides a two-team division tie', () => {
    const a = run(nflTeams(tied), matrix(32, [[0, 1, 2]]));
    expect(a[0].divisionPct).toBe(100);
    expect(a[1].divisionPct).toBe(0);
    const b = run(nflTeams(tied), matrix(32, [[1, 0, 2]]));
    expect(b[1].divisionPct).toBe(100);
    expect(b[0].divisionPct).toBe(0);
  });

  it('division record decides when the head-to-head is split', () => {
    const teams = nflTeams({
      0: { wins: 10, divWins: 4, divLosses: 2 },
      1: { wins: 10, divWins: 3, divLosses: 3 },
      2: { wins: 4 },
      3: { wins: 4 },
    });
    const r = run(teams, matrix(32, [[0, 1, 1], [1, 0, 1]]));
    expect(r[0].divisionPct).toBe(100);
    expect(r[1].divisionPct).toBe(0);
  });

  it('conference record decides when head-to-head and division record cannot', () => {
    const teams = nflTeams({
      0: { wins: 10, divWins: 3, divLosses: 3, confWins: 8, confLosses: 4 },
      1: { wins: 10, divWins: 3, divLosses: 3, confWins: 6, confLosses: 6 },
      2: { wins: 4 },
      3: { wins: 4 },
    });
    const r = run(teams, matrix(32, [[0, 1, 1], [1, 0, 1]]));
    expect(r[0].divisionPct).toBe(100);
  });

  it('a better record beats any tiebreaker', () => {
    const r = run(nflTeams({ 0: { wins: 9 }, 1: { wins: 10, divWins: 0, divLosses: 6 } }), matrix(32, [[0, 1, 2]]));
    expect(r[1].divisionPct).toBe(100);
  });

  it('the last wild card goes to the better conference record', () => {
    // AFC division winners (0,4,8,12) at 12 wins; wild-card contenders: 1 and 5 at 11; 9 and 13 tied at 10.
    const teams = nflTeams({
      0: { wins: 12 }, 4: { wins: 12 }, 8: { wins: 12 }, 12: { wins: 12 },
      1: { wins: 11 }, 5: { wins: 11 },
      9: { wins: 10, confWins: 8, confLosses: 4 },
      13: { wins: 10, confWins: 6, confLosses: 6 },
    });
    const r = run(teams);
    expect(r[9].playoffPct).toBe(100);
    expect(r[13].playoffPct).toBe(0);
    expect([r[0], r[4], r[8], r[12], r[1], r[5]].every((o) => o.playoffPct === 100)).toBe(true);
  });

  it('top seed goes to the best division winner', () => {
    const r = run(nflTeams({ 0: { wins: 14 }, 4: { wins: 12 }, 8: { wins: 12 }, 12: { wins: 12 } }));
    expect(r[0].topSeedPct).toBe(100);
  });
});

// ---- NBA ---------------------------------------------------------------------------------------------------------
function nbaTeams(east: number[], eastDivs: number[]): SeasonTeamInput[] {
  const out: SeasonTeamInput[] = east.map((w, i) => ({ index: i, conference: 'East', division: `E${eastDivs[i]}`, wins: w, power: 50 }));
  for (let i = 0; i < 15; i++) out.push({ index: out.length, conference: 'West', division: `W${i % 3}`, wins: 30 - i, power: 50 });
  return out;
}
const runNba = (teams: SeasonTeamInput[], h2h?: Float64Array, pairProb?: (a: number, b: number) => number) =>
  simulateSeason(teams, [], { league: 'NBA', iterations: 50, seed: 2, h2hWins: h2h, pairProb });

describe('NBA seeding and play-in', () => {
  // East: three divisions of five. Index: 0 = P (division winner, 40 wins), 5 = Q (40 wins, not a division winner),
  // 6 = X (49 wins, wins Q's division), 10..14 = the 50/48/47/46/20 teams of the third division.
  const wins = [40, 20, 20, 20, 20, /*D1*/ 40, 49, 20, 20, 20, /*D2*/ 50, 48, 47, 46, 20];
  const divs = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2];

  it('a division winner wins a two-team tie for the last direct spot', () => {
    const r = runNba(nbaTeams(wins, divs));
    expect(r[0].topSixPct).toBe(100); // P: division winner
    expect(r[5].topSixPct).toBe(0); // Q: tied on wins but not a division winner
    expect(r[5].playInPct).toBe(100);
    expect(r[0].playoffPct).toBe(100);
  });

  it('head-to-head breaks the tie when neither team won its division', () => {
    // Make both P and Q non-winners by giving each division a stronger team.
    const w = [40, 45, 20, 20, 20, 40, 49, 20, 20, 20, 50, 48, 47, 20, 20];
    const teams = nbaTeams(w, divs);
    const a = runNba(teams, matrix(30, [[5, 0, 2]])); // Q beat P twice
    expect(a[5].topSixPct).toBe(100);
    expect(a[0].topSixPct).toBe(0);
    const b = runNba(teams, matrix(30, [[0, 5, 2]]));
    expect(b[0].topSixPct).toBe(100);
  });

  it('plays the 7-10 play-in with home court for the higher seed', () => {
    const teams = nbaTeams([60, 59, 58, 57, 56, 55, 54, 53, 52, 51, 20, 20, 20, 20, 20], [0, 0, 0, 1, 1, 1, 2, 2, 2, 0, 1, 2, 0, 1, 2]);
    const homeAlwaysWins = runNba(teams, undefined, () => 1);
    // 7 hosts 8 and wins; the 8 seed hosts the 9/10 winner (9 hosts 10 and wins) and wins.
    expect(homeAlwaysWins[6].playoffPct).toBe(100);
    expect(homeAlwaysWins[7].playoffPct).toBe(100);
    expect(homeAlwaysWins[8].playoffPct).toBe(0);
    expect(homeAlwaysWins[9].playoffPct).toBe(0);
    const awayAlwaysWins = runNba(teams, undefined, () => 0);
    // 8 beats 7 (seed 7 is the winner = team 7); 7 then loses at 9?  The 9/10 winner is 10; the 7v8 loser (team 6) loses on the road.
    expect(awayAlwaysWins[7].playoffPct).toBe(100);
    expect(awayAlwaysWins[9].playoffPct).toBe(100);
    expect(awayAlwaysWins[6].playoffPct).toBe(0);
    expect(awayAlwaysWins[8].playoffPct).toBe(0);
    [6, 7, 8, 9].forEach((i) => expect(homeAlwaysWins[i].playInPct).toBe(100));
  });
});

// ---- NCAAF -------------------------------------------------------------------------------------------------------
describe('NCAAF conference championship games and the CFP', () => {
  const conf = (name: string, wins: number[], confWins: number[], power = 50): SeasonTeamInput[] =>
    wins.map((w, k) => ({ index: 0, conference: name, division: name, wins: w, power, confWins: confWins[k], confLosses: 8 - confWins[k] }));
  const index = (xs: SeasonTeamInput[]) => xs.map((t, i) => ({ ...t, index: i }));

  it('the winner of a title game gets an extra win and the conference title', () => {
    const teams = index(conf('SEC', [5, 5, 3, 3], [8, 7, 3, 2]));
    const sure = simulateSeason(teams, [], { league: 'NCAAF', iterations: 40, seed: 1, titleGameConferences: ['SEC'], neutralProb: () => 1 });
    expect(sure[0].confChampPct).toBe(100);
    expect(sure[0].bowlPct).toBe(100); // 5 wins + title game = 6
    expect(sure[1].bowlPct).toBe(0);
    const upset = simulateSeason(teams, [], { league: 'NCAAF', iterations: 40, seed: 1, titleGameConferences: ['SEC'], neutralProb: () => 0 });
    expect(upset[1].confChampPct).toBe(100); // the 2nd-best conference record wins the game
    expect(upset[1].bowlPct).toBe(100);
    expect(upset[0].bowlPct).toBe(0);
  });

  it('a conference without a title game is won by the best conference record', () => {
    const teams = index(conf('American', [5, 5, 3, 3], [8, 7, 3, 2]));
    const r = simulateSeason(teams, [], { league: 'NCAAF', iterations: 40, seed: 1, titleGameConferences: ['SEC'], neutralProb: () => 0 });
    expect(r[0].confChampPct).toBe(100);
    expect(r[0].bowlPct).toBe(0); // no extra game: still 5 wins
  });

  it('independents have no conference champion', () => {
    const teams = index(conf('FBS Indep.', [9, 8], [0, 0])); // ESPN's abbreviated name
    const r = simulateSeason(teams, [], { league: 'NCAAF', iterations: 20, seed: 1 });
    expect(r[0].confChampPct).toBe(0);
  });

  it('five conference champions get automatic CFP bids, even over better-ranked non-champions', () => {
    // Six conferences with 5 teams each. Champion = most conference wins. Champions' overall wins: 12, 11, 10, 9, 8 and 4.
    const champWins = [12, 11, 10, 9, 8, 4];
    const teams: SeasonTeamInput[] = [];
    champWins.forEach((cw, c) => {
      teams.push({ index: teams.length, conference: `C${c}`, division: `C${c}`, wins: cw, power: 50, confWins: 8, confLosses: 0 });
      // Four non-champions per conference, with 9-11 overall wins but worse conference records.
      for (let k = 0; k < 4; k++)
        teams.push({ index: teams.length, conference: `C${c}`, division: `C${c}`, wins: 6 + ((c + k) % 5), power: 50, confWins: 4, confLosses: 4 });
    });
    const r = simulateSeason(teams, [], { league: 'NCAAF', iterations: 60, seed: 3 });
    const champ = (c: number) => teams.findIndex((t) => t.conference === `C${c}`);
    for (const c of [0, 1, 2, 3, 4]) expect(r[champ(c)].cfpPct).toBe(100); // the 8-win champion is in via the auto bid
    expect(r[champ(5)].cfpPct).toBe(0); // the sixth champion (4 wins) misses
    expect(r.reduce((a, o) => a + o.cfpPct, 0)).toBeCloseTo(1200, 6);
  });
});
