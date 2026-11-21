export default function Footer() {
  return (
    <footer className="mt-12 border-t border-slate-800 py-8">
      <div className="mx-auto max-w-7xl space-y-2 px-4 text-xs leading-relaxed text-slate-500">
        <p className="font-semibold text-slate-400">Methodology &amp; calibration</p>
        <p>
          Score projections combine each team's offensive efficiency with the opponent's defensive efficiency, scaled
          by expected pace, with home advantage split evenly between the two sides. Win probability uses a normal
          model on the projected margin (Abramowitz &amp; Stegun erf, error &lt; 1.5&times;10<sup>-7</sup>). Cover,
          push and over/under rates come from a seeded 10,000-iteration Box-Muller Monte Carlo on integer scores.
          Team consistency scales margin and total variance.
        </p>
        <p>
          All team ratings, records and sportsbook lines are illustrative sample data, not live feeds, and this tool is
          for analysis and education only. It is not betting advice.
        </p>
      </div>
    </footer>
  );
}
