# Versus Sports Simulator Replica

Result-driven rating, projection and simulation app for NFL (32 teams), NCAAF (138 FBS teams) and NBA (30 teams).
React 18 + TypeScript (strict) + Vite + Tailwind + Recharts.

```bash
npm install
npm run dev        # app (uses the committed data snapshot)
npm run build      # typecheck + production build
npm run data       # refresh: fetch real results from ESPN, then re-solve ratings and season odds
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

## Known limitations
- No preseason priors (prior-season results are not fetched), so early-season ratings lean on ridge shrinkage.
- Tempo/pace is an index inferred from game totals, not real plays or possessions.
- Walk-forward check (rate through 14 days ago, predict games since): winner accuracy 76% NFL (n=29), 60% NCAAF
  (n=125), 61% NBA (n=97); Brier 0.214 / 0.229 / 0.227 vs 0.250 for a coin flip. Small samples.
