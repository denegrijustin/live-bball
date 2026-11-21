import type { DataMeta } from '../../types/sports';

export default function Footer({ meta }: { meta: DataMeta }) {
  const asOf = new Date(meta.asOf).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <footer className="mt-12 border-t border-slate-800 py-8">
      <div className="mx-auto max-w-7xl space-y-2 px-4 text-xs leading-relaxed text-slate-500">
        <p className="font-semibold text-slate-400">
          Methodology &amp; data <span className="font-normal text-slate-600">· snapshot {asOf}</span>
        </p>
        <p>
          Ratings are solved from {meta.gamesUsed.toLocaleString()} completed game results ({meta.source}); no box
          scores, injuries, weather or betting lines are used. A weighted ridge least-squares fit on margins and on
          points seeds team offence, defence and home advantage; an iteratively reweighted logistic regression
          (IRLS, {meta.irlsIterations} iterations) refines overall performance. Games decay with a {meta.halfLifeDays}-day
          half-life. League home advantage and margin/total variance are fitted to the same results (home advantage is
          shrunk toward its long-run value), and team consistency scales variance.
        </p>
        <p>
          Single-game win probability and projected score are analytic (normal CDF, Abramowitz &amp; Stegun erf). Cover,
          push and over/under rates come from a seeded 10,000-run Box-Muller Monte Carlo on integer scores. Season odds
          run {meta.seasonIterations.toLocaleString()} simulations of the remaining schedule with simplified tiebreakers.
          Sportsbook lines are shown only when posted. For analysis and education only; not betting advice.
        </p>
      </div>
    </footer>
  );
}
