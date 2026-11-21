import type { LeagueConfig, MatchupModel, MonteCarloResult, TeamMetrics } from '../../types/sports';
import { fmtLine, fmtPct } from '../../lib/format';
import { TeamBadge } from '../common/ui';

interface Props {
  league: LeagueConfig;
  teamA: TeamMetrics;
  teamB: TeamMetrics;
  model: MatchupModel;
  mc: MonteCarloResult;
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-slate-950/60 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="num text-lg font-bold">{value}</div>
      {sub && <div className="num text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

export default function SimulationHero({ league, teamA, teamB, model, mc }: Props) {
  const aPct = model.teamAWinProb * 100;
  const bPct = model.teamBWinProb * 100;
  const favorite = model.teamBWinProb >= 0.5 ? teamB : teamA;
  const favLine = -Math.abs(model.projectedSpreadTeamB);
  const aWins = model.teamAProjectedScore > model.teamBProjectedScore;

  const side = (team: TeamMetrics, score: number, win: boolean, align: 'left' | 'right') => (
    <div className={`flex flex-1 items-center gap-4 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
      <TeamBadge team={team} size={64} />
      <div>
        <div className="text-sm font-semibold text-slate-300">{team.shortName}</div>
        <div className={`num text-5xl font-extrabold leading-none ${win ? 'text-white' : 'text-slate-500'}`}>
          {score.toFixed(1)}
        </div>
        <div className="num mt-1 text-xs text-slate-500">{team.record}</div>
      </div>
    </div>
  );

  return (
    <section className="card overflow-hidden p-5">
      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
        {side(teamA, model.teamAProjectedScore, aWins, 'left')}
        <div className="text-center text-xs font-bold uppercase tracking-widest text-slate-600">
          Projected
          <br />
          Final
        </div>
        {side(teamB, model.teamBProjectedScore, !aWins, 'right')}
      </div>

      <div className="mt-5">
        <div className="mb-1 flex justify-between text-xs font-semibold">
          <span className="num">
            {teamA.abbreviation} {fmtPct(aPct)} <span className="text-slate-500">({model.teamAImpliedOdds})</span>
          </span>
          <span className="num">
            <span className="text-slate-500">({model.teamBImpliedOdds})</span> {fmtPct(bPct)} {teamB.abbreviation}
          </span>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-slate-800">
          <div style={{ width: `${aPct}%`, background: teamA.primaryColor === '#000000' ? '#475569' : teamA.primaryColor }} />
          <div style={{ width: `${bPct}%`, background: teamB.primaryColor === '#000000' ? '#475569' : teamB.primaryColor, opacity: 0.85 }} />
        </div>
        <div className="num mt-1 text-center text-[11px] text-slate-500">
          Monte Carlo ({mc.iterations.toLocaleString()} runs): {teamA.abbreviation} {fmtPct(mc.teamAEmpiricalWinPct)} ·{' '}
          {teamB.abbreviation} {fmtPct(mc.teamBEmpiricalWinPct)}
          {mc.tiePct > 0 && ` · tie ${fmtPct(mc.tiePct)}`}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-5">
        <Metric label="Model Line" value={`${favorite.abbreviation} ${fmtLine(favLine)}`} />
        <Metric label="Projected Total" value={model.projectedTotal.toFixed(1)} />
        <Metric
          label={league.paceLabel}
          value={model.expectedPace.toFixed(1)}
          sub={`lg avg ${league.avgPace.toFixed(1)}`}
        />
        <Metric
          label="Median Margin"
          value={`${mc.medianMarginTeamB >= 0 ? teamB.abbreviation : teamA.abbreviation} by ${Math.abs(mc.medianMarginTeamB)}`}
          sub={`σ ${model.marginSd.toFixed(1)}`}
        />
        <Metric
          label="Avg Sim Score"
          value={`${mc.avgTeamAScore.toFixed(1)}–${mc.avgTeamBScore.toFixed(1)}`}
          sub={`${teamA.abbreviation}–${teamB.abbreviation}`}
        />
      </div>
    </section>
  );
}
