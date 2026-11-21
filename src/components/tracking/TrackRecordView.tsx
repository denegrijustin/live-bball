import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { LeagueConfig, TrackingSummary } from '../../types/sports';
import { SectionTitle } from '../common/ui';

interface Props {
  league: LeagueConfig;
  tracking: TrackingSummary | null;
}

const pct = (x: number | null, d = 1) => (x === null ? '—' : `${(x * 100).toFixed(d)}%`);
const fmt = (x: number | null, d = 3) => (x === null ? '—' : x.toFixed(d));
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function Stat({ label, value, sub, good }: { label: string; value: string; sub?: string; good?: boolean | null }) {
  return (
    <div className="rounded-lg bg-slate-950/60 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`num text-xl font-bold ${good === true ? 'text-emerald-300' : good === false ? 'text-rose-300' : ''}`}>{value}</div>
      {sub && <div className="num text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

export default function TrackRecordView({ league, tracking }: Props) {
  if (!tracking) return <p className="py-10 text-center text-slate-500">No tracking data.</p>;
  const t = tracking;
  const live = t.n > 0;
  const bt = t.backtest;
  const beatsCoin = t.brier === null ? null : t.brier < 0.25;
  const m = t.market;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold">{league.name} Model Track Record</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Before each game starts, the model's prediction is locked in. After the game, it is graded. This page is the
          running total of those real, out-of-sample predictions, so it cannot be flattered by hindsight. Brier score:
          lower is better, and 0.250 is a coin flip.
        </p>
      </div>

      {/* Live */}
      <section className="card p-4">
        <SectionTitle
          right={
            <span className="num text-[11px] text-slate-500">
              {t.since ? `tracking since ${day(t.since)}` : 'tracking not started'} · {t.pendingGames} games awaiting results
            </span>
          }
        >
          Live predictions
        </SectionTitle>
        {live ? (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <Stat label="Graded" value={String(t.n)} />
            <Stat label="Winner accuracy" value={pct(t.accuracy)} />
            <Stat label="Brier score" value={fmt(t.brier)} sub="coin flip 0.250" good={beatsCoin} />
            <Stat label="Log loss" value={fmt(t.logloss)} sub="coin flip 0.693" good={t.logloss === null ? null : t.logloss < 0.693} />
            <Stat label="Margin error" value={t.mae === null ? '—' : `${t.mae.toFixed(1)} pts`} sub="mean absolute" />
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            Nothing has been graded yet. {t.pendingGames.toLocaleString()} predictions are locked in for upcoming games;
            the first results appear after the next data refresh that follows those games.
          </p>
        )}
        {m && (
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat
              label="Model vs market"
              value={`${m.modelMae.toFixed(1)} vs ${m.marketMae.toFixed(1)}`}
              sub={`margin error, ${m.n} games with a line`}
              good={m.modelMae < m.marketMae}
            />
            <Stat
              label="Picks vs spread"
              value={m.atsN ? `${m.atsWins}-${m.atsN - m.atsWins}` : '—'}
              sub={m.atsN ? `${((m.atsWins / m.atsN) * 100).toFixed(0)}% (edge ≥ 1 pt; break-even 52.4%)` : 'edge ≥ 1 pt'}
              good={m.atsN >= 20 ? m.atsWins / m.atsN > 0.524 : null}
            />
          </div>
        )}
        {live && t.n < 100 && (
          <p className="mt-3 text-[11px] text-amber-300/80">
            Only {t.n} graded games so far, so these numbers are still noisy (a 100-game sample can swing accuracy by
            about ±5 points).
          </p>
        )}
      </section>

      {/* Cumulative chart */}
      {t.series.length >= 2 && (
        <section className="card p-4">
          <SectionTitle>Cumulative accuracy and Brier score</SectionTitle>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={t.series} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                <CartesianGrid stroke="#1e293b" vertical={false} />
                <XAxis dataKey="d" tick={{ fill: '#64748b', fontSize: 11 }} stroke="#334155" tickFormatter={(v: string) => v.slice(5)} />
                <YAxis yAxisId="acc" domain={[0.3, 1]} tick={{ fill: '#64748b', fontSize: 11 }} stroke="#334155" tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
                <YAxis yAxisId="br" orientation="right" domain={[0.1, 0.35]} tick={{ fill: '#64748b', fontSize: 11 }} stroke="#334155" />
                <ReferenceLine yAxisId="br" y={0.25} stroke="#475569" strokeDasharray="4 3" />
                <Tooltip
                  content={({ payload }) => {
                    const p = payload?.[0]?.payload as TrackingSummary['series'][number] | undefined;
                    if (!p) return null;
                    return (
                      <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl">
                        <div className="font-semibold">{day(p.d)}</div>
                        <div className="num text-slate-400">{p.n} graded · accuracy {(p.accuracy * 100).toFixed(1)}% · Brier {p.brier.toFixed(3)}</div>
                      </div>
                    );
                  }}
                />
                <Line yAxisId="acc" type="monotone" dataKey="accuracy" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line yAxisId="br" type="monotone" dataKey="brier" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-[11px] text-slate-600">
            <span className="text-emerald-400">Green</span>: winner accuracy (left axis). <span className="text-amber-400">Amber</span>:
            Brier score (right axis; dashed line = coin flip).
          </p>
        </section>
      )}

      {/* Calibration */}
      {live && (
        <section className="card p-4">
          <SectionTitle>Calibration</SectionTitle>
          <p className="mb-2 text-xs text-slate-500">
            When the model says the home team has a given chance, how often did it win? Close agreement between the two
            columns means the probabilities can be taken at face value.
          </p>
          <table className="w-full max-w-xl text-sm">
            <thead className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-1 text-left">Predicted</th>
                <th className="py-1 text-right">Games</th>
                <th className="py-1 text-right">Avg predicted</th>
                <th className="py-1 text-right">Actual win rate</th>
                <th className="w-32 py-1" />
              </tr>
            </thead>
            <tbody>
              {t.calibration.map((c) => (
                <tr key={c.lo} className="border-t border-slate-800/60">
                  <td className="num py-1">{Math.round(c.lo * 100)}–{Math.round(c.hi * 100)}%</td>
                  <td className="num py-1 text-right text-slate-400">{c.n}</td>
                  <td className="num py-1 text-right">{pct(c.predicted, 0)}</td>
                  <td className="num py-1 text-right font-semibold">{pct(c.actual, 0)}</td>
                  <td className="py-1 pl-3">
                    {c.actual !== null && (
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${c.actual * 100}%` }} />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Backtest */}
      <section className="card p-4">
        <SectionTitle right={bt && <span className="num text-[11px] text-slate-500">last run {day(bt.ranAt)}</span>}>
          Walk-forward backtest
        </SectionTitle>
        {bt ? (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              <Stat label="Predictions" value={String(bt.predictions)} sub="across 5 cutoffs this season" />
              <Stat label="Winner accuracy" value={pct(bt.accuracy)} />
              <Stat label="Brier score" value={fmt(bt.brier)} good={bt.brier < 0.25} />
              <Stat label="Log loss" value={fmt(bt.logloss)} good={bt.logloss < 0.693} />
              <Stat label="Margin error" value={`${bt.mae.toFixed(1)} pts`} />
            </div>
            <p className="mt-2 text-[11px] text-slate-600">
              Re-rates teams using only games up to each cutoff (plus last season as a prior, carry-over {bt.carry}), then
              predicts the next block of games. The carry-over weight was tuned on this same season, so it is a little
              optimistic. The live record above is the honest one.
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-400">No backtest recorded yet. Run <code className="num">npm run backtest:record</code>.</p>
        )}
      </section>
    </div>
  );
}
