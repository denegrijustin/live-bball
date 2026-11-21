/**
 * Walk-forward backtest. For several points in the current season, rate teams using ONLY games up to that point
 * (plus last season as a preseason prior), then predict the next block of games. Compares prior carry-over weights.
 *
 * Usage: npx tsx scripts/backtest.ts            (all leagues, prints a table)
 *        npx tsx scripts/backtest.ts nfl        (one league)
 */
import { normalCDF } from '../src/engine/mathModel';
import { solveRatings } from '../src/engine/ratingSolver';
import { loadRaw, priorFor, solvePriorSeason, SETTINGS, solverOpts, toRows, universeOf } from './lib/shared';

const CARRIES = [0, 0.2, 0.35, 0.5, 0.65, 0.8];
const CUTOFFS = [0.12, 0.25, 0.4, 0.55, 0.7]; // fraction of this season's games already played
const WINDOW = 0.15; // predict the next 15% of games

const only = process.argv[2]?.toLowerCase();

function evalLeague(file: string) {
  const s = SETTINGS.find((x) => x.file === file)!;
  const raw = loadRaw(s.file)!;
  const priorRaw = loadRaw(s.file, true);
  if (!priorRaw) {
    console.log(`${s.id}: no prior-season file (run: node scripts/fetchData.mjs --prior ${file})`);
    return;
  }
  const ids = universeOf(s, raw);
  const index = new Map(ids.map((id, i) => [id, i]));
  const rows = toRows(raw, index).sort((a, b) => a.t - b.t);
  const prior = solvePriorSeason(s, priorRaw);

  const agg = CARRIES.map(() => ({ n: 0, brier: 0, ll: 0, mae: 0, acc: 0 }));
  for (const cf of CUTOFFS) {
    const split = Math.floor(rows.length * cf);
    const train = rows.slice(0, split);
    const test = rows.slice(split, split + Math.floor(rows.length * WINDOW));
    const asOf = train[train.length - 1].t;
    CARRIES.forEach((carry, k) => {
      const res = solveRatings(ids.length, train, solverOpts(s, asOf, priorFor(ids, prior, carry)));
      for (const g of test) {
        const v = g.neutral ? 0 : 1;
        const pm = res.off[g.h] + res.def[g.a] - (res.off[g.a] + res.def[g.h]) + res.hfa * v;
        const p = Math.min(0.995, Math.max(0.005, normalCDF(pm / res.marginSd)));
        const y = g.hs > g.as ? 1 : g.hs < g.as ? 0 : 0.5;
        const a = agg[k];
        a.n++;
        a.brier += (p - y) ** 2;
        a.ll += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
        a.mae += Math.abs(g.hs - g.as - pm);
        a.acc += (p > 0.5) === (y === 1) ? 1 : 0;
      }
    });
  }
  console.log(`\n${s.id} (${rows.length} games this season, ${CUTOFFS.length} cutoffs, ${agg[0].n} predictions each)`);
  console.log('  carry   acc    Brier   logloss  MAE');
  let best = 0;
  agg.forEach((a, k) => {
    if (a.ll < agg[best].ll) best = k;
  });
  agg.forEach((a, k) => {
    console.log(
      `  ${CARRIES[k].toFixed(2)}   ${((100 * a.acc) / a.n).toFixed(1)}%  ${(a.brier / a.n).toFixed(4)}  ${(a.ll / a.n).toFixed(4)}  ${(a.mae / a.n).toFixed(2)}${k === best ? '  <- best logloss' : ''}${CARRIES[k] === s.carry ? '  (configured)' : ''}`,
    );
  });
}

for (const s of SETTINGS) if (!only || s.file === only) evalLeague(s.file);
