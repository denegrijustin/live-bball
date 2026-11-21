import type { LeagueId, ScheduledGame } from '../types/sports';

type G = [string, string, string, string, boolean, number, number];

function make(league: LeagueId, rows: G[]): ScheduledGame[] {
  const p = league.toLowerCase();
  return rows.map(([startTime, label, away, home, neutral, spread, total], i) => ({
    id: `${p}-g${i + 1}`,
    league,
    startTime,
    weekOrDateLabel: label,
    awayTeamId: `${p}-${away.toLowerCase()}`,
    homeTeamId: `${p}-${home.toLowerCase()}`,
    neutralSite: neutral,
    vegasSpreadHome: spread,
    vegasTotal: total,
  }));
}

// [startTime, label, away, home, neutralSite, vegasSpreadHome, vegasTotal]
export const NFL_SLATE = make('NFL', [
  ['Thu 8:15 PM EST', 'Week 12', 'GB', 'DET', false, -3.5, 49.5],
  ['Sun 1:00 PM EST', 'Week 12', 'NYJ', 'BUF', false, -11.5, 44.5],
  ['Sun 1:00 PM EST', 'Week 12', 'CIN', 'BAL', false, -6.5, 51.5],
  ['Sun 1:00 PM EST', 'Week 12', 'TEN', 'HOU', false, -9.5, 41.5],
  ['Sun 1:00 PM EST', 'Week 12', 'MIA', 'NE', false, -2.5, 46.5],
  ['Sun 4:05 PM EST', 'Week 12', 'LV', 'DEN', false, -9.5, 40.5],
  ['Sun 4:25 PM EST', 'Week 12', 'PHI', 'DAL', false, 4.5, 48.5],
  ['Sun 4:25 PM EST', 'Week 12', 'KC', 'LAC', false, 1.5, 46.5],
  ['Sun 8:20 PM EST', 'Week 12', 'SF', 'SEA', false, -1.5, 47.5],
  ['Mon 8:15 PM EST', 'Week 12', 'LAR', 'MIN', false, 2.5, 46.5],
]);

export const NCAAF_SLATE = make('NCAAF', [
  ['Fri 7:00 PM EST', 'Week 13', 'PSU', 'MISS', true, -1.5, 55.5],
  ['Sat 12:00 PM EST', 'Week 13', 'IND', 'OSU', false, -3.5, 49.5],
  ['Sat 12:00 PM EST', 'Week 13', 'WIS', 'IOWA', false, -3.5, 38.5],
  ['Sat 3:30 PM EST', 'Week 13', 'TEX', 'TAMU', false, 3.5, 51.5],
  ['Sat 3:30 PM EST', 'Week 13', 'AUB', 'BAMA', false, -13.5, 56.5],
  ['Sat 3:30 PM EST', 'Week 13', 'ND', 'USC', false, 6.5, 55.5],
  ['Sat 7:30 PM EST', 'Week 13', 'UGA', 'LSU', false, 9.5, 49.5],
  ['Sat 7:30 PM EST', 'Week 13', 'WASH', 'ORE', false, -17.5, 56.5],
  ['Sat 8:00 PM EST', 'Week 13', 'KSU', 'UTAH', false, -2.5, 54.5],
  ['Sat 10:15 PM EST', 'Week 13', 'BYU', 'ASU', false, -1.5, 52.5],
]);

export const NBA_SLATE = make('NBA', [
  ['Sat 7:00 PM EST', 'Tonight', 'MIL', 'CLE', false, -8.5, 229.5],
  ['Sat 7:30 PM EST', 'Tonight', 'GSW', 'HOU', false, -4.5, 223.5],
  ['Sat 8:00 PM EST', 'Tonight', 'DEN', 'OKC', false, -7.5, 231.5],
  ['Sat 8:00 PM EST', 'Tonight', 'NYK', 'BOS', false, -5.5, 224.5],
  ['Sat 10:00 PM EST', 'Tonight', 'LAL', 'SAC', false, 2.5, 229.5],
  ['Sun 6:00 PM EST', 'Tomorrow', 'IND', 'ATL', false, 1.5, 239.5],
  ['Sun 7:00 PM EST', 'Tomorrow', 'MEM', 'DAL', false, 1.5, 232.5],
  ['Sun 7:00 PM EST', 'Tomorrow', 'ORL', 'MIA', false, -1.5, 218.5],
  ['Sun 8:00 PM EST', 'Tomorrow', 'MIN', 'PHX', false, 1.5, 224.5],
  ['Sun 9:30 PM EST', 'Tomorrow', 'WAS', 'LAC', false, -12.5, 225.5],
]);
