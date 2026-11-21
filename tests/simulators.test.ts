import { describe, expect, it } from 'vitest';
import { simulateSeason, type RemainingGame, type SeasonTeamInput } from '../src/engine/seasonSim';
import { blendLeverage, simulateTourney, type TourneyGame, type TourneyOptions, type TourneyTeam } from '../src/engine/tourneySim';
import { normalCDF } from '../src/engine/mathModel';

const sum = (xs: number[]) => xs.reduce((s, v) => s + v, 0);

// ---- Season simulator ------------------------------------------------------------------------------------------
function leagueTeams(confs: string[], divsPerConf: number, perDiv: number): SeasonTeamInput[] {
  const out: SeasonTeamInput[] = [];
  for (const conf of confs)
    for (let d = 0; d < divsPerConf; d++)
      for (let k = 0; k < perDiv; k++)
        out.push({ index: out.length, conference: conf, division: `${conf} D${d}`, wins: 0, power: 50 - out.length });
  return out;
}

function randomSchedule(teams: SeasonTeamInput[], gamesPerTeam: number, p = 0.5): RemainingGame[] {
  const games: RemainingGame[] = [];
  const n = teams.length;
  for (let r = 1; r <= gamesPerTeam; r++)
    for (let i = 0; i < n; i++) games.push({ home: i, away: (i + r) % n, homeWinProb: p });
  return games;
}

describe('simulateSeason', () => {
  it('is reproducible for a fixed seed', () => {
    const teams = leagueTeams(['AFC', 'NFC'], 4, 4);
    const games = randomSchedule(teams, 5);
    const a = simulateSeason(teams, games, { league: 'NFL', iterations: 500, seed: 11 });
    const b = simulateSeason(teams, games, { league: 'NFL', iterations: 500, seed: 11 });
    expect(b).toEqual(a);
    const c = simulateSeason(teams, games, { league: 'NFL', iterations: 500, seed: 12 });
    expect(c).not.toEqual(a);
  });

  it('every simulated game produces exactly one win', () => {
    const teams = leagueTeams(['AFC', 'NFC'], 4, 4);
    const games = randomSchedule(teams, 5);
    const odds = simulateSeason(teams, games, { league: 'NFL', iterations: 400, seed: 2 });
    expect(sum(odds.map((o) => o.avgWins))).toBeCloseTo(games.length, 6);
  });

  it('with certain results, wins and qualification are deterministic', () => {
    // Team i beats everyone with a higher index; give the home side certainty.
    const teams = leagueTeams(['AFC', 'NFC'], 4, 4);
    const games: RemainingGame[] = [];
    for (let i = 0; i < teams.length; i++)
      for (let j = i + 1; j < teams.length; j++) games.push({ home: i, away: j, homeWinProb: 1 });
    const odds = simulateSeason(teams, games, { league: 'NFL', iterations: 200, seed: 1 });
    teams.forEach((t, i) => expect(odds[i].avgWins).toBe(teams.length - 1 - i));
    // Team 0 is best in the AFC; team 16 is best in the NFC.
    expect(odds[0].topSeedPct).toBe(100);
    expect(odds[0].divisionPct).toBe(100);
  });

  it('NFL: 7 teams per conference make the playoffs and 4 win divisions', () => {
    const teams = leagueTeams(['AFC', 'NFC'], 4, 4);
    const odds = simulateSeason(teams, randomSchedule(teams, 8), { league: 'NFL', iterations: 1000, seed: 3 });
    for (const conf of ['AFC', 'NFC']) {
      const idx = teams.filter((t) => t.conference === conf).map((t) => t.index);
      expect(sum(idx.map((i) => odds[i].playoffPct))).toBeCloseTo(700, 6);
      expect(sum(idx.map((i) => odds[i].divisionPct))).toBeCloseTo(400, 6);
      expect(sum(idx.map((i) => odds[i].topSeedPct))).toBeCloseTo(100, 6);
    }
  });

  it('NBA: top six plus two play-in winners qualify per conference', () => {
    const teams = leagueTeams(['East', 'West'], 3, 5); // 15 per conference
    const odds = simulateSeason(teams, randomSchedule(teams, 10), { league: 'NBA', iterations: 1000, seed: 4 });
    for (const conf of ['East', 'West']) {
      const idx = teams.filter((t) => t.conference === conf).map((t) => t.index);
      expect(sum(idx.map((i) => odds[i].playoffPct))).toBeCloseTo(800, 6);
      expect(sum(idx.map((i) => odds[i].topSixPct))).toBeCloseTo(600, 6);
      expect(sum(idx.map((i) => odds[i].topSeedPct))).toBeCloseTo(100, 6);
    }
  });

  it('NBA play-in uses the supplied pair probabilities', () => {
    const teams = leagueTeams(['East', 'West'], 3, 5);
    // No games left: standings are fixed by the starting wins. Give the 7-10 seeds in East distinct records.
    teams.forEach((t) => (t.wins = t.conference === 'East' ? 40 - (t.index % 15) : 10));
    const eastIdx = teams.filter((t) => t.conference === 'East').map((t) => t.index);
    const seed = (k: number) => eastIdx[k - 1];
    const allFavourHome = simulateSeason(teams, [], { league: 'NBA', iterations: 200, seed: 5, pairProb: () => 1 });
    expect(allFavourHome[seed(7)].playoffPct).toBe(100); // 7 hosts 8 and wins
    expect(allFavourHome[seed(8)].playoffPct).toBe(100); // loses to 7, then hosts the 9/10 winner and wins
    expect(allFavourHome[seed(9)].playoffPct).toBe(0);
    expect(allFavourHome[seed(10)].playoffPct).toBe(0);
  });

  it('NCAAF: twelve teams reach the CFP field and bowl eligibility needs six wins', () => {
    const teams: SeasonTeamInput[] = Array.from({ length: 30 }, (_, i) => ({
      index: i,
      conference: i < 15 ? 'A' : 'B',
      division: i < 15 ? 'A' : 'B',
      wins: i % 4,
      power: 100 - i,
    }));
    const odds = simulateSeason(teams, randomSchedule(teams, 6), { league: 'NCAAF', iterations: 800, seed: 6 });
    expect(sum(odds.map((o) => o.cfpPct))).toBeCloseTo(1200, 6);
    const guaranteed: SeasonTeamInput[] = [{ index: 0, conference: 'A', division: 'A', wins: 6, power: 1 }, { index: 1, conference: 'A', division: 'A', wins: 2, power: 1 }];
    const o2 = simulateSeason(guaranteed, [], { league: 'NCAAF', iterations: 10, seed: 1 });
    expect(o2[0].bowlPct).toBe(100);
    expect(o2[1].bowlPct).toBe(0);
  });
});

// ---- Tournament simulator ----------------------------------------------------------------------------------------
function tourneySetup() {
  const confs = ['C0', 'C1', 'C2', 'C3'];
  const teams: TourneyTeam[] = [];
  confs.forEach((conf) => {
    for (let k = 0; k < 10; k++) {
      const i = teams.length;
      teams.push({ index: i, conference: conf, wins: 2 + (i % 3), confWins: i % 3, rating: ((i * 37) % 40) - 20, sigma: 2 });
    }
  });
  const games: TourneyGame[] = [];
  for (let r = 1; r <= 6; r++)
    for (let i = 0; i < teams.length; i++) {
      const j = (i + r * 7) % teams.length;
      if (i === j) continue;
      games.push({ home: i, away: j, mean: teams[i].rating - teams[j].rating + 3, conf: teams[i].conference === teams[j].conference });
    }
  const opts: TourneyOptions = {
    iterations: 1500,
    seed: 21,
    marginSd: 11,
    neutralMargin: (i, j) => teams[i].rating - teams[j].rating,
    lambdaPerWin: 0.6,
    committeeNoise: 1.5,
    fieldSize: 20,
    bracketSize: 8,
  };
  return { teams, games, opts };
}

describe('simulateTourney', () => {
  const { teams, games, opts } = tourneySetup();
  const res = simulateTourney(teams, games, opts);

  it('is reproducible for a fixed seed', () => {
    expect(simulateTourney(teams, games, opts)).toEqual(res);
    expect(simulateTourney(teams, games, { ...opts, seed: 22 }).teams).not.toEqual(res.teams);
  });

  it('fills exactly the field: one auto bid per conference, the rest at-large', () => {
    expect(res.autoBidConferences.length).toBe(4);
    expect(res.atLargeSlots).toBe(16);
    expect(sum(res.teams.map((t) => t.bidPct))).toBeCloseTo(2000, 6);
    expect(sum(res.teams.map((t) => t.autoBidPct))).toBeCloseTo(400, 6);
    expect(sum(res.teams.map((t) => t.atLargePct))).toBeCloseTo(1600, 6);
    res.teams.forEach((t) => expect(t.bidPct).toBeLessThanOrEqual(100.0001));
  });

  it('stronger teams are more likely to be selected', () => {
    const best = teams.reduce((a, b) => (b.rating > a.rating ? b : a));
    const worst = teams.reduce((a, b) => (b.rating < a.rating ? b : a));
    expect(res.teams[best.index].bidPct).toBeGreaterThan(res.teams[worst.index].bidPct);
  });

  it('independents and tiny conferences do not earn an automatic bid', () => {
    const extra: TourneyTeam[] = [
      ...teams,
      ...Array.from({ length: 5 }, (_, k) => ({ index: teams.length + k, conference: 'Independents', wins: 3, confWins: 0, rating: 0, sigma: 2 })),
      ...Array.from({ length: 3 }, (_, k) => ({ index: teams.length + 5 + k, conference: 'Tiny', wins: 3, confWins: 0, rating: 0, sigma: 2 })),
    ];
    const r = simulateTourney(extra, games, { ...opts, iterations: 200, neutralMargin: (i, j) => extra[i].rating - extra[j].rating });
    expect(r.autoBidConferences).not.toContain('Independents');
    expect(r.autoBidConferences).not.toContain('Tiny');
    expect(r.atLargeSlots).toBe(16);
  });

  it('winning a game never lowers a team\'s counterfactual bid chance', () => {
    res.games.forEach((g) => {
      expect(g.cfHomeBidIfWin).toBeGreaterThanOrEqual(g.cfHomeBidIfLoss - 1e-12);
      expect(g.cfAwayBidIfWin).toBeGreaterThanOrEqual(g.cfAwayBidIfLoss - 1e-12);
      for (const v of [g.cfHomeBidIfWin, g.cfHomeBidIfLoss, g.cfAwayBidIfWin, g.cfAwayBidIfLoss]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });
  });

  it('the counterfactual average is anchored to the team\'s overall bid chance', () => {
    // P(bid) = P(win) * P(bid | win) + P(loss) * P(bid | loss), approximately, for bubble teams.
    const checked: number[] = [];
    res.games.forEach((g, gi) => {
      const home = games[gi].home;
      const base = res.teams[home].bidPct / 100;
      if (base < 0.15 || base > 0.85) return;
      const pWin = g.nHomeWin / opts.iterations;
      const mix = pWin * g.cfHomeBidIfWin + (1 - pWin) * g.cfHomeBidIfLoss;
      checked.push(Math.abs(mix - base));
    });
    expect(checked.length).toBeGreaterThan(10);
    expect(sum(checked) / checked.length).toBeLessThan(0.05);
  });

  it('home win counts are close to the model win probability', () => {
    const g = games[0];
    const stat = res.games[0];
    expect(stat.nHomeWin + stat.nAwayWin).toBe(opts.iterations);
    // Shocks widen the spread slightly; allow a generous band.
    const p = normalCDF(g.mean / Math.sqrt(opts.marginSd ** 2 + 2 * 2 ** 2));
    expect(Math.abs(stat.nHomeWin / opts.iterations - p)).toBeLessThan(0.06);
  });
});

describe('blendLeverage', () => {
  it('falls back to the low-variance estimate when the weighted one has no support', () => {
    expect(blendLeverage(0.4, 0.9, 0)).toBeCloseTo(0.4, 12);
    expect(blendLeverage(0.4, null, 5000)).toBeCloseTo(0.4, 12);
  });
  it('trusts the weighted estimate as its effective sample grows', () => {
    expect(blendLeverage(0.4, 0.6, 500)).toBeCloseTo(0.5, 12); // weight 1/2 at n = k
    expect(blendLeverage(0.4, 0.6, 1e9)).toBeCloseTo(0.6, 6);
  });
});
