import { buildLeague, type RawTeam } from './teamFactory';

// Illustrative ratings (points per game). Not live data.
const rows: RawTeam[] = [
  ['OSU', 'Ohio State Buckeyes', 'Ohio State', 'Big Ten', '#BB0000', '#666666', 10, 1, 38.2, 12.8, 68.0, 66, 1.12, 'WWWWW', 1.9],
  ['UGA', 'Georgia Bulldogs', 'Georgia', 'SEC', '#BA0C2F', '#000000', 9, 2, 34.5, 15.6, 69.2, 70, 1.06, 'WWLWW', 0.8],
  ['TEX', 'Texas Longhorns', 'Texas', 'SEC', '#BF5700', '#333F48', 9, 2, 33.1, 14.9, 67.8, 68, 1.08, 'WWWLW', 0.5],
  ['ORE', 'Oregon Ducks', 'Oregon', 'Big Ten', '#154733', '#FEE123', 10, 1, 37.4, 17.1, 72.4, 58, 1.02, 'WWWWW', 1.4],
  ['BAMA', 'Alabama Crimson Tide', 'Alabama', 'SEC', '#9E1B32', '#828A8F', 8, 3, 34.9, 19.8, 70.1, 67, 0.94, 'WLWWW', 0.3],
  ['ND', 'Notre Dame Fighting Irish', 'Notre Dame', 'Independent', '#0C2340', '#C99700', 9, 2, 33.8, 15.2, 66.9, 55, 1.07, 'WWWLW', 0.9],
  ['PSU', 'Penn State Nittany Lions', 'Penn State', 'Big Ten', '#041E42', '#96BEE6', 9, 2, 32.7, 16.3, 67.1, 60, 1.05, 'WWLWW', 0.4],
  ['MICH', 'Michigan Wolverines', 'Michigan', 'Big Ten', '#00274C', '#FFCB05', 6, 5, 24.9, 18.4, 63.9, 63, 1.1, 'LWLWL', -1.1],
  ['MISS', 'Ole Miss Rebels', 'Ole Miss', 'SEC', '#CE1126', '#14213D', 9, 2, 36.3, 20.6, 72.8, 61, 0.9, 'WWWLW', 0.7],
  ['TENN', 'Tennessee Volunteers', 'Tennessee', 'SEC', '#FF8200', '#58595B', 8, 3, 35.2, 19.1, 71.3, 64, 0.95, 'WLWWW', 0.2],
  ['LSU', 'LSU Tigers', 'LSU', 'SEC', '#461D7C', '#FDD023', 7, 4, 31.4, 22.8, 69.6, 66, 0.87, 'LWLWW', -0.8],
  ['CLEM', 'Clemson Tigers', 'Clemson', 'ACC', '#F56600', '#522D80', 8, 3, 32.6, 19.7, 69.4, 52, 0.96, 'WWLWW', 0.6],
  ['MIA', 'Miami Hurricanes', 'Miami', 'ACC', '#F47321', '#005030', 9, 2, 39.7, 20.3, 71.9, 54, 0.92, 'WWWWL', 1.5],
  ['TAMU', 'Texas A&M Aggies', 'Texas A&M', 'SEC', '#500000', '#FFFFFF', 8, 3, 34.0, 20.9, 68.7, 65, 0.97, 'WLWWW', 0.4],
  ['OU', 'Oklahoma Sooners', 'Oklahoma', 'SEC', '#841617', '#FDF9D8', 7, 4, 28.7, 17.9, 66.2, 66, 1.0, 'LWWLW', -0.2],
  ['USC', 'USC Trojans', 'USC', 'Big Ten', '#990000', '#FFC72C', 6, 5, 31.8, 26.2, 70.8, 59, 0.82, 'LLWLW', -1.7],
  ['IND', 'Indiana Hoosiers', 'Indiana', 'Big Ten', '#990000', '#EEEDEB', 10, 1, 40.5, 13.9, 69.9, 57, 1.15, 'WWWWW', 2.3],
  ['MIZ', 'Missouri Tigers', 'Missouri', 'SEC', '#F1B82D', '#000000', 8, 3, 31.5, 18.6, 67.4, 62, 1.01, 'WWLWW', 0.5],
  ['UTAH', 'Utah Utes', 'Utah', 'Big 12', '#CC0000', '#808080', 8, 3, 32.9, 20.2, 68.9, 56, 0.98, 'WLWWW', 0.3],
  ['WASH', 'Washington Huskies', 'Washington', 'Big Ten', '#4B2E83', '#B7A57A', 6, 5, 27.6, 22.3, 66.5, 58, 0.91, 'LWLLW', -0.9],
  ['AUB', 'Auburn Tigers', 'Auburn', 'SEC', '#0C2340', '#E87722', 5, 6, 26.8, 24.1, 67.9, 64, 0.88, 'LLWLL', -1.8],
  ['FLA', 'Florida Gators', 'Florida', 'SEC', '#0021A5', '#FA4616', 5, 6, 27.3, 25.5, 68.2, 63, 0.86, 'LWLLW', -1.2],
  ['KSU', 'Kansas State Wildcats', 'Kansas State', 'Big 12', '#512888', '#D1D1D1', 7, 4, 33.4, 21.9, 69.1, 55, 0.93, 'WLWWL', 0.1],
  ['IOWA', 'Iowa Hawkeyes', 'Iowa', 'Big Ten', '#FFCD00', '#000000', 7, 4, 24.6, 15.0, 64.3, 56, 1.18, 'WLWWW', 0.6],
  ['WIS', 'Wisconsin Badgers', 'Wisconsin', 'Big Ten', '#C5050C', '#FFFFFF', 5, 6, 25.8, 23.8, 65.2, 59, 0.9, 'LLLWL', -1.5],
  ['ASU', 'Arizona State Sun Devils', 'Arizona State', 'Big 12', '#8C1D40', '#FFC627', 8, 3, 34.7, 21.7, 70.2, 53, 0.95, 'WWWLW', 0.8],
  ['BYU', 'BYU Cougars', 'BYU', 'Big 12', '#002E5D', '#FFFFFF', 9, 2, 32.4, 17.0, 66.7, 51, 1.09, 'WWWWL', 0.9],
  ['LOU', 'Louisville Cardinals', 'Louisville', 'ACC', '#AD0000', '#000000', 8, 3, 33.6, 21.1, 68.8, 50, 0.94, 'WLWWW', 0.2],
  ['SMU', 'SMU Mustangs', 'SMU', 'ACC', '#CC0035', '#354CA1', 8, 3, 35.8, 22.4, 72.1, 47, 0.9, 'WWLWL', 0.1],
  ['BSU', 'Boise State Broncos', 'Boise State', 'Mountain West', '#0033A0', '#D64309', 9, 2, 37.2, 21.5, 70.5, 42, 0.97, 'WWWWW', 1.1],
];

export const NCAAF_TEAMS = buildLeague('NCAAF', rows);
