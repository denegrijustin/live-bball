# Versus Sports Simulator Replica

Quantitative sports analytics and Monte Carlo simulator for NFL (32 teams), NCAAF (top 30 FBS) and NBA (30 teams).
React 18 + TypeScript (strict) + Vite + Tailwind + Recharts.

```bash
npm install
npm run dev     # local dev server
npm run build   # typecheck + production build
```

Views: Simulator (matchup, What-If Lab, Line Evaluator, margin histogram, tale of the tape), Daily Slate,
Power Rankings (table + efficiency matrix + team report grades) and Lean Board (model vs. market edges).
App state is mirrored to the URL query string (`league`, `tab`, `a`, `b`, `venue`, `spread`, `total`).

All team ratings, records and sportsbook lines are illustrative sample data, not live feeds.

## Model notes
- Score = (offense + opponent defense − league average) × pace scale, ± half the league home advantage per side.
  NBA scales by possessions/100; football scales by plays / league-average plays.
- Margin and total are normal with league standard deviations divided by the matchup's mean consistency multiplier.
- Win probability: normal CDF (Abramowitz & Stegun erf). Monte Carlo: seeded 10,000-run Box-Muller on integer scores;
  regulation ties are resolved as overtime (winner drawn from the model win probability).
