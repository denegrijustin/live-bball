import { RotateCcw } from 'lucide-react';
import type { MatchupModel, MonteCarloResult, TeamMetrics } from '../../types/sports';
import { breakEvenProb, expectedValue } from '../../engine/edgeCalculator';
import { fmtLine, fmtMoney, fmtPct } from '../../lib/format';
import { SectionTitle } from '../common/ui';

interface Props {
  teamA: TeamMetrics;
  teamB: TeamMetrics;
  model: MatchupModel;
  mc: MonteCarloResult;
  spread: number;
  total: number;
  isCustom: boolean;
  onSpread: (v: number | null) => void;
  onTotal: (v: number | null) => void;
  onResetLines: () => void;
}

function Result({
  label,
  prob,
  loseProb,
  push,
}: {
  label: string;
  prob: number;
  loseProb: number;
  push: number;
}) {
  const ev = expectedValue(prob / 100, loseProb / 100);
  const be = breakEvenProb() * 100;
  const good = prob > be;
  return (
    <div className={`rounded-lg border px-3 py-2 ${good ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-slate-800 bg-slate-950/50'}`}>
      <div className="text-xs font-semibold text-slate-400">{label}</div>
      <div className={`num text-2xl font-bold ${good ? 'text-emerald-400' : 'text-slate-200'}`}>{fmtPct(prob)}</div>
      <div className="num text-[11px] text-slate-500">
        EV {fmtMoney(ev)} / $100 · push {fmtPct(push)}
      </div>
    </div>
  );
}

export default function LineEvaluator({
  teamA,
  teamB,
  model,
  mc,
  spread,
  total,
  isCustom,
  onSpread,
  onTotal,
  onResetLines,
}: Props) {
  const parse = (v: string): number | null => {
    if (v === '' || v === '-' || v === '+') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const spreadEdge = spread - model.projectedSpreadTeamB;
  const totalEdge = model.projectedTotal - total;

  return (
    <section className="card p-4">
      <SectionTitle
        right={
          isCustom && (
            <button onClick={onResetLines} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white">
              <RotateCcw size={12} /> Use model lines
            </button>
          )
        }
      >
        Line Evaluator
      </SectionTitle>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <div className="mb-1 text-xs text-slate-400">
            {teamB.abbreviation} spread <span className="text-slate-600">(− = {teamB.abbreviation} favored)</span>
          </div>
          <input
            type="number"
            step={0.5}
            value={spread}
            onChange={(e) => onSpread(parse(e.target.value))}
            className="num w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-lg font-bold focus:border-emerald-500 focus:outline-none"
          />
          <div className="num mt-1 text-[11px] text-slate-500">
            Model {fmtLine(model.projectedSpreadTeamB)} · edge {spreadEdge >= 0 ? teamB.abbreviation : teamA.abbreviation}{' '}
            {Math.abs(spreadEdge).toFixed(1)} pts
          </div>
        </label>
        <label className="block">
          <div className="mb-1 text-xs text-slate-400">Game total</div>
          <input
            type="number"
            step={0.5}
            value={total}
            onChange={(e) => onTotal(parse(e.target.value))}
            className="num w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-lg font-bold focus:border-emerald-500 focus:outline-none"
          />
          <div className="num mt-1 text-[11px] text-slate-500">
            Model {model.projectedTotal.toFixed(1)} · edge {totalEdge >= 0 ? 'Over' : 'Under'} {Math.abs(totalEdge).toFixed(1)} pts
          </div>
        </label>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Result
          label={`${teamA.abbreviation} ${fmtLine(-spread)}`}
          prob={mc.teamACoverProb}
          loseProb={mc.teamBCoverProb}
          push={mc.spreadPushProb}
        />
        <Result
          label={`${teamB.abbreviation} ${fmtLine(spread)}`}
          prob={mc.teamBCoverProb}
          loseProb={mc.teamACoverProb}
          push={mc.spreadPushProb}
        />
        <Result label={`Over ${total}`} prob={mc.overProb} loseProb={mc.underProb} push={mc.totalPushProb} />
        <Result label={`Under ${total}`} prob={mc.underProb} loseProb={mc.overProb} push={mc.totalPushProb} />
      </div>
      <p className="mt-3 text-[11px] text-slate-600">
        Highlighted when the simulated probability beats the {fmtPct(breakEvenProb() * 100)} break-even at −110 juice.
      </p>
    </section>
  );
}
