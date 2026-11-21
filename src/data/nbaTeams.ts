import { buildLeague, type RawTeam } from './teamFactory';

// Illustrative ratings (points per 100 possessions). Not live data.
const rows: RawTeam[] = [
  // Eastern - Atlantic
  ['BOS', 'Boston Celtics', 'Boston', 'Eastern', '#007A33', '#BA9653', 13, 6, 118.8, 109.6, 98.4, 52, 1.1, 'WWWLW', 1.4],
  ['BKN', 'Brooklyn Nets', 'Brooklyn', 'Eastern', '#000000', '#FFFFFF', 7, 12, 109.2, 116.8, 98.9, 50, 0.88, 'LLWLL', -1.6],
  ['NYK', 'New York Knicks', 'New York', 'Eastern', '#006BB6', '#F58426', 12, 7, 117.6, 111.2, 97.6, 53, 1.05, 'WWLWW', 1.0],
  ['PHI', 'Philadelphia 76ers', 'Philadelphia', 'Eastern', '#006BB6', '#ED174C', 9, 10, 113.4, 114.8, 98.2, 51, 0.92, 'LWLWL', -0.4],
  ['TOR', 'Toronto Raptors', 'Toronto', 'Eastern', '#CE1141', '#000000', 8, 11, 112.1, 115.9, 100.1, 49, 0.9, 'LLWWL', -0.7],
  // Eastern - Central
  ['CHI', 'Chicago Bulls', 'Chicago', 'Eastern', '#CE1141', '#000000', 8, 11, 114.9, 118.4, 101.8, 51, 0.86, 'LWLLW', -0.9],
  ['CLE', 'Cleveland Cavaliers', 'Cleveland', 'Eastern', '#860038', '#FDBB30', 14, 5, 120.3, 111.4, 99.3, 50, 1.12, 'WWWWW', 2.1],
  ['DET', 'Detroit Pistons', 'Detroit', 'Eastern', '#C8102E', '#1D42BA', 11, 8, 114.2, 111.9, 98.5, 52, 1.0, 'WWLWW', 1.2],
  ['IND', 'Indiana Pacers', 'Indiana', 'Eastern', '#002D62', '#FDBB30', 10, 9, 119.1, 117.9, 102.6, 51, 0.89, 'WLWLW', 0.2],
  ['MIL', 'Milwaukee Bucks', 'Milwaukee', 'Eastern', '#00471B', '#EEE1C6', 9, 10, 114.6, 114.1, 99.8, 50, 0.97, 'LWWLL', -0.5],
  // Eastern - Southeast
  ['ATL', 'Atlanta Hawks', 'Atlanta', 'Eastern', '#E03A3E', '#C1D32F', 10, 9, 116.1, 117.2, 101.4, 49, 0.88, 'WLWLW', 0.1],
  ['CHA', 'Charlotte Hornets', 'Charlotte', 'Eastern', '#1D1160', '#00788C', 6, 13, 111.8, 118.7, 100.9, 48, 0.87, 'LLLWL', -1.3],
  ['MIA', 'Miami Heat', 'Miami', 'Eastern', '#98002E', '#F9A01B', 10, 9, 114.8, 113.6, 98.7, 50, 1.03, 'WLWWL', 0.3],
  ['ORL', 'Orlando Magic', 'Orlando', 'Eastern', '#0077C0', '#C4CED4', 11, 8, 111.3, 108.9, 97.2, 49, 1.08, 'WWLWL', 0.6],
  ['WAS', 'Washington Wizards', 'Washington', 'Eastern', '#002B5C', '#E31837', 3, 16, 108.4, 121.3, 102.3, 50, 0.85, 'LLLLL', -2.4],
  // Western - Northwest
  ['DEN', 'Denver Nuggets', 'Denver', 'Western', '#0E2240', '#FEC524', 12, 7, 119.4, 114.9, 98.9, 51, 1.07, 'WWLWW', 0.9],
  ['MIN', 'Minnesota Timberwolves', 'Minnesota', 'Western', '#0C2340', '#236192', 11, 8, 115.7, 111.1, 98.1, 52, 1.02, 'WLWWL', 0.5],
  ['OKC', 'Oklahoma City Thunder', 'Oklahoma City', 'Western', '#007AC1', '#EF3B24', 16, 3, 120.9, 106.8, 100.2, 53, 1.14, 'WWWWW', 2.6],
  ['POR', 'Portland Trail Blazers', 'Portland', 'Western', '#E03A3E', '#000000', 7, 12, 110.9, 116.3, 99.6, 51, 0.9, 'LLWLL', -1.0],
  ['UTA', 'Utah Jazz', 'Utah', 'Western', '#002B5C', '#F9A01B', 4, 15, 111.4, 122.0, 101.1, 52, 0.84, 'LLLWL', -2.0],
  // Western - Pacific
  ['GSW', 'Golden State Warriors', 'Golden State', 'Western', '#1D428A', '#FFC72C', 11, 8, 115.2, 111.7, 100.7, 51, 1.0, 'WWWLL', 0.7],
  ['LAC', 'Los Angeles Clippers', 'LA Clippers', 'Western', '#C8102E', '#1D428A', 9, 10, 112.6, 111.8, 96.8, 50, 1.04, 'LWLWW', -0.2],
  ['LAL', 'Los Angeles Lakers', 'LA Lakers', 'Western', '#552583', '#FDB927', 12, 7, 115.9, 114.6, 99.1, 51, 0.96, 'WWLWW', 0.8],
  ['PHX', 'Phoenix Suns', 'Phoenix', 'Western', '#1D1160', '#E56020', 9, 10, 113.1, 114.0, 98.3, 50, 0.93, 'LWLLW', -0.6],
  ['SAC', 'Sacramento Kings', 'Sacramento', 'Western', '#5A2D81', '#63727A', 8, 11, 113.7, 116.1, 99.8, 52, 0.91, 'LLWLW', -0.8],
  // Western - Southwest
  ['DAL', 'Dallas Mavericks', 'Dallas', 'Western', '#00538C', '#B8C4CA', 10, 9, 113.9, 112.8, 97.9, 50, 0.98, 'WLLWW', 0.1],
  ['HOU', 'Houston Rockets', 'Houston', 'Western', '#CE1141', '#000000', 13, 6, 114.9, 108.7, 98.6, 51, 1.09, 'WWWLW', 1.3],
  ['MEM', 'Memphis Grizzlies', 'Memphis', 'Western', '#5D76A9', '#12173F', 12, 7, 120.1, 114.2, 102.0, 51, 0.94, 'WWLWW', 1.1],
  ['NOP', 'New Orleans Pelicans', 'New Orleans', 'Western', '#0C2340', '#C8102E', 4, 15, 111.0, 119.2, 100.4, 52, 0.86, 'LLLLW', -1.8],
  ['SAS', 'San Antonio Spurs', 'San Antonio', 'Western', '#C4CED4', '#000000', 10, 9, 114.3, 113.5, 100.8, 50, 0.95, 'WLWWL', 0.4],
];

export const NBA_TEAMS = buildLeague('NBA', rows);
