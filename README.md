# Versus Sports Simulator Replica

Result-driven rating, projection and simulation app for NFL (32 teams), NCAAF (138 FBS teams), NBA (30 teams) and
men's / women's college basketball (NCAAM 365 and NCAAW 363 Division I teams).
React 18 + TypeScript (strict) + Vite + Tailwind + Recharts.

```bash
npm install
npm run dev        # app (uses the committed data snapshot)
npm run build      # typecheck + production build
npm run data       # refresh: fetch real results from ESPN, then re-solve ratings and season odds
npm run data:prior # (rarely) refetch last season's results used as preseason priors
npm test           # unit tests (Vitest)
npm run backtest   # walk-forward backtest of the model and prior carry-over weights
npm run backtest:record  # same, and append the result to data/tracking/backtest-history.json
```

## Views
Team pages (click any team): rating history, grades, season outlook, upcoming games with win probabilities and a game
log showing the model's pre-game probability for each result (upsets flagged).

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

## NCAA tournament and game leverage (NCAAM / NCAAW)
`src/engine/tourneySim.ts` simulates the rest of the regular season 20,000 times with a per-team strength shock
(early-season ratings are uncertain; shocks shrink with games played), runs each conference's tournament (top 8 by
conference record, single elimination) for automatic bids, then fills the remaining at-large spots by a selection score
of `rating + lambda x (wins above expectation) + committee noise`. Output: bid %, automatic vs at-large %, average seed.

**Leverage** = P(bid | team wins a game) - P(bid | team loses it), per team per remaining game. Estimators (see the file
header): a low-variance counterfactual (forced-outcome equivalent), a Rao-Blackwellised estimator that also reflects what
a result says about a team's strength, and a split-by-outcome estimator for close conference games (which also sees
conference seeding). They are blended by effective sample size and were validated against forced-outcome simulations
(`TOURNEY_CHECK=1 npx tsx scripts/buildRatings.ts ncaam`). Swings run about 1.5x a forced "pretend it won" calculation
because a result also revises belief about the team. Simplifications: the committee is a score threshold, not
NET/quadrants; conference tournaments have no byes; no First Four logic beyond seed lines.

League data loads on demand (one chunk per league) so the basketball files (~2 MB each) are not in the initial bundle.

## Forward tracking
Every refresh locks in a prediction for each upcoming game (frozen at kickoff; a game is never predicted after it
starts) and grades the finished ones on the next run, keeping only daily totals in `data/tracking/<league>.json`:
accuracy, Brier score, log loss, margin error, calibration bins and, where a line was posted, model-vs-market error and
against-the-spread picks. The Track Record tab shows it next to the latest walk-forward backtest. Honest numbers need
a few weeks to accumulate.

## Season rules
- **NFL**: four division winners + three wild cards per conference; ties on wins broken by head-to-head, division
  record (within a division), conference record, then a coin flip. Strength of victory/schedule and common-games
  tiebreakers are not modelled; multi-team ties use pooled head-to-head instead of the official elimination steps.
- **NBA**: top six by record (ties: division winner, head-to-head, conference record) then the 7-10 play-in with home
  court for the higher seed.
- **NCAAF**: conference titles by conference record, with a championship game between the top two in SEC, Big Ten, ACC,
  Big 12, MAC, Mountain West, Sun Belt and CUSA (assumption: American and Pac-12 have none); the 12-team CFP takes the
  five highest-ranked champions plus seven at-large.

## Preseason priors
Last season's results (`data/raw/*-prior.json`) are solved with the same model. Each team is then shrunk toward
`carry x last season's rating` (not the league mean) with ridge scaled by `1/(1-carry^2)`; as games accumulate the data
term dominates, so the prior fades on its own. `carry` is NFL 0.65, NCAAF 0.65, NBA 0.7, NCAAM 0.65, NCAAW 0.75, picked from the plateau of
`npm run backtest` (the curve is flat above ~0.65). Walk-forward results over 5 cutoffs this season, carry 0 -> chosen:
winner accuracy 56% -> ~64% NFL, 65% -> ~69% NCAAF, 65% -> ~70% NBA, with better Brier and log loss in all three.
Carry-over was tuned on the same season it is evaluated on (one parameter per league), so expect a little optimism.

## Known limitations
- Tempo/pace is an index inferred from game totals, not real plays or possessions.
- No roster, transfer-portal or coaching-change information, so teams that changed a lot carry over too much.
- Backtest samples are small (110 / 475 / 170 predictions per carry setting); the live Track Record is the real test.
