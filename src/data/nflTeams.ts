import { buildLeague, type RawTeam } from './teamFactory';

// Illustrative ratings (points per game). Not live data.
const rows: RawTeam[] = [
  // AFC East
  ['BUF', 'Buffalo Bills', 'Buffalo', 'AFC East', '#00338D', '#C60C30', 9, 2, 28.4, 19.6, 63.5, 48, 1.05, 'WWWLW', 1.8],
  ['MIA', 'Miami Dolphins', 'Miami', 'AFC East', '#008E97', '#FC4C02', 5, 6, 22.9, 23.8, 66.2, 52, 0.88, 'LWLWL', -1.2],
  ['NE', 'New England Patriots', 'New England', 'AFC East', '#002244', '#C60C30', 6, 5, 21.5, 21.2, 61.0, 47, 1.0, 'WWLWL', 0.6],
  ['NYJ', 'New York Jets', 'NY Jets', 'AFC East', '#125740', '#000000', 3, 8, 18.2, 24.9, 60.4, 55, 0.92, 'LLLWL', -2.1],
  // AFC North
  ['BAL', 'Baltimore Ravens', 'Baltimore', 'AFC North', '#241773', '#9E7C0C', 8, 3, 27.8, 20.7, 62.8, 54, 1.02, 'WWLWW', 1.1],
  ['CIN', 'Cincinnati Bengals', 'Cincinnati', 'AFC North', '#FB4F14', '#000000', 5, 6, 24.6, 25.1, 64.0, 51, 0.85, 'LWLLW', -0.4],
  ['CLE', 'Cleveland Browns', 'Cleveland', 'AFC North', '#311D00', '#FF3C00', 3, 8, 16.9, 22.4, 59.1, 56, 0.95, 'LLLLW', -1.9],
  ['PIT', 'Pittsburgh Steelers', 'Pittsburgh', 'AFC North', '#FFB612', '#101820', 7, 4, 20.8, 19.9, 60.7, 53, 1.1, 'WLWWW', 0.9],
  // AFC South
  ['HOU', 'Houston Texans', 'Houston', 'AFC South', '#03202F', '#A71930', 7, 4, 22.6, 19.4, 62.2, 49, 1.08, 'WWLWL', 0.3],
  ['IND', 'Indianapolis Colts', 'Indianapolis', 'AFC South', '#002C5F', '#A2AAAD', 6, 5, 24.2, 23.1, 65.3, 50, 0.9, 'LWWLW', 0.2],
  ['JAX', 'Jacksonville Jaguars', 'Jacksonville', 'AFC South', '#006778', '#D7A22A', 4, 7, 20.1, 24.2, 61.8, 52, 0.93, 'LLWLL', -1.5],
  ['TEN', 'Tennessee Titans', 'Tennessee', 'AFC South', '#0C2340', '#4B92DB', 2, 9, 17.4, 25.3, 60.9, 49, 0.97, 'LLLLL', -2.6],
  // AFC West
  ['DEN', 'Denver Broncos', 'Denver', 'AFC West', '#FB4F14', '#002244', 8, 3, 22.3, 18.1, 61.5, 51, 1.12, 'WWWLW', 2.2],
  ['KC', 'Kansas City Chiefs', 'Kansas City', 'AFC West', '#E31837', '#FFB81C', 8, 3, 24.1, 20.3, 62.4, 53, 1.18, 'WWLWW', 0.8],
  ['LV', 'Las Vegas Raiders', 'Las Vegas', 'AFC West', '#000000', '#A5ACAF', 3, 8, 17.8, 26.1, 60.2, 55, 0.89, 'LLWLL', -2.3],
  ['LAC', 'Los Angeles Chargers', 'LA Chargers', 'AFC West', '#0080C6', '#FFC20E', 7, 4, 23.0, 20.1, 61.6, 52, 1.04, 'WLWWW', 1.0],
  // NFC East
  ['DAL', 'Dallas Cowboys', 'Dallas', 'NFC East', '#003594', '#869397', 5, 6, 24.8, 27.4, 64.7, 53, 0.82, 'WLLWL', -0.9],
  ['NYG', 'New York Giants', 'NY Giants', 'NFC East', '#0B2265', '#A71930', 2, 9, 17.1, 25.6, 61.3, 54, 0.94, 'LLLLL', -2.8],
  ['PHI', 'Philadelphia Eagles', 'Philadelphia', 'NFC East', '#004C54', '#A5ACAF', 8, 3, 25.6, 19.2, 62.9, 52, 1.07, 'WWWLW', 1.5],
  ['WAS', 'Washington Commanders', 'Washington', 'NFC East', '#5A1414', '#FFB612', 4, 7, 22.0, 24.6, 63.4, 56, 0.86, 'LLLWL', -1.4],
  // NFC North
  ['CHI', 'Chicago Bears', 'Chicago', 'NFC North', '#0B162A', '#C83803', 7, 4, 23.4, 22.0, 61.9, 53, 0.96, 'WWWLW', 1.7],
  ['DET', 'Detroit Lions', 'Detroit', 'NFC North', '#0076B6', '#B0B7BC', 9, 2, 30.1, 20.9, 64.8, 50, 0.98, 'WWWWL', 2.0],
  ['GB', 'Green Bay Packers', 'Green Bay', 'NFC North', '#203731', '#FFB612', 8, 3, 24.9, 19.5, 62.6, 51, 1.09, 'WWLWW', 1.2],
  ['MIN', 'Minnesota Vikings', 'Minnesota', 'NFC North', '#4F2683', '#FFC62F', 6, 5, 22.1, 21.7, 62.1, 52, 1.0, 'LWWLW', 0.1],
  // NFC South
  ['ATL', 'Atlanta Falcons', 'Atlanta', 'NFC South', '#A71930', '#000000', 5, 6, 21.6, 23.5, 62.0, 49, 0.91, 'LWLLW', -0.7],
  ['CAR', 'Carolina Panthers', 'Carolina', 'NFC South', '#0085CA', '#101820', 6, 5, 21.9, 24.1, 60.8, 48, 0.93, 'WLWWL', 0.9],
  ['NO', 'New Orleans Saints', 'New Orleans', 'NFC South', '#D3BC8D', '#101820', 3, 8, 18.9, 24.0, 61.1, 50, 0.9, 'LLLWL', -1.6],
  ['TB', 'Tampa Bay Buccaneers', 'Tampa Bay', 'NFC South', '#D50A0A', '#34302B', 7, 4, 25.3, 21.4, 64.1, 49, 1.01, 'WLWWW', 0.7],
  // NFC West
  ['ARI', 'Arizona Cardinals', 'Arizona', 'NFC West', '#97233F', '#000000', 5, 6, 21.2, 23.9, 62.7, 53, 0.88, 'LWLWL', -0.5],
  ['LAR', 'Los Angeles Rams', 'LA Rams', 'NFC West', '#003594', '#FFA300', 9, 2, 27.1, 19.8, 63.1, 54, 1.06, 'WWWWW', 2.4],
  ['SF', 'San Francisco 49ers', 'San Francisco', 'NFC West', '#AA0000', '#B3995D', 7, 4, 24.7, 20.6, 62.3, 55, 1.03, 'WWLWW', 1.3],
  ['SEA', 'Seattle Seahawks', 'Seattle', 'NFC West', '#002244', '#69BE28', 8, 3, 24.0, 19.3, 61.7, 53, 1.05, 'WWWLW', 1.6],
];

export const NFL_TEAMS = buildLeague('NFL', rows);
