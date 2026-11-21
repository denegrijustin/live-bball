# Versus Sports Simulator Replica

Result-driven rating, projection and simulation app for NFL (32 teams), NCAAF (138 FBS teams) and NBA (30 teams).
React 18 + TypeScript (strict) + Vite + Tailwind + Recharts.

```bash
npm install
npm run dev        # app (uses the committed data snapshot)
npm run build      # typecheck + production build
npm run data       # refresh: fetch real results from ESPN, then re-solve ratings and season odds
npm run data:prior # (rarely) refetch last season's results used as preseason priors
npm run backtest   # walk-forward backtest of the model and prior carry-over weights
```

## Views
Simulator (matchup, What-If Lab, Line Evaluator, margin histogram, tale of the tape), Daily Slate, Power Rankings
(table + efficiency matrix + team report grades), Lean Board (model vs posted lines) and Season Odds.
App state is mirrored to the URL query string (`league`, `tab`, `a`, `b`, `venue`, `spread`, `total`).

## Data pipeline
1. `scripts/fetchData.mjs` pulls completed results, the remaining schedule and posted sportsbook lines from ESPN's
   public scoreboard JSON into `data/raw/*.json` (uses `curl`; no API keys).
2. `scripts/buildRatings.ts` runs the solver in `src/engine/ratingSolver.ts`, calibrates league constants, builds the
   slate and runs the season Monte Carlo, writing `src/data/generated/*.json`, which the app imports.

Only final scores, dates and venues are used: no box scores, injuries, weather or lines.
Sportsbook lines appear only where ESPN has posted them (NBA lines are often missing until game day).

## Model
- **Solver** (`ratingSolver.ts`): weighted ridge least squares on capped margins and on points scored (team offence,
  defence as points allowed, home advantage), then iteratively reweighted logistic regression (IRLS) on wins for the
  overall performance rating. Exponential recency weights (half-life 60-75 days). Home advantage has a prior toward
  the league's long-run value. For NCAAF only FBS-vs-FBS games are fitted (FCS mismatches bias home advantage).
- **Calibration**: league home advantage and margin/total SD are fitted to the same results; team consistency is the
  inverse of each team's shrunk margin-residual SD.
- **Single game**: score = offence + opponent defence - league mean, +/- half the home advantage; win probability from
  the normal CDF (Abramowitz & Stegun erf). A seeded 10,000-run Box-Muller Monte Carlo supplies cover, push and
  over/under rates and the margin histogram; regulation ties are resolved as overtime.
- **Season odds** (`seasonSim.ts`): 10,000 simulations of the remaining schedule with simplified tiebreakers
  (random on equal wins). NFL: division winners + 3 wild cards per conference; NBA: top 6 + play-in; NCAAF:
  top-12 by simulated record then rating (no conference championships) and bowl eligibility.

## Preseason priors
Last season's results (`data/raw/*-prior.json`) are solved with the same model. Each team is then shrunk toward
`carry x last season's rating` (not the league mean) with ridge scaled by `1/(1-carry^2)`; as games accumulate the data
term dominates, so the prior fades on its own. `carry` is NFL 0.65, NCAAF 0.65, NBA 0.7, picked from the plateau of
`npm run backtest` (the curve is flat above ~0.65). Walk-forward results over 5 cutoffs this season, carry 0 -> chosen:
winner accuracy 56% -> ~64% NFL, 65% -> ~69% NCAAF, 65% -> ~70% NBA, with better Brier and log loss in all three.
Carry-over was tuned on the same season it is evaluated on (one parameter per league), so expect a little optimism.

## Known limitations
- Tempo/pace is an index inferred from game totals, not real plays or possessions.
- No roster, transfer-portal or coaching-change information, so teams that changed a lot carry over too much.
- Backtest samples are small (110 / 475 / 170 predictions per carry setting).
