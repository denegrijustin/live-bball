import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { HistogramBin, MonteCarloResult, TeamMetrics } from '../../types/sports';
import { fmtLine } from '../../lib/format';
import { SectionTitle } from '../common/ui';

interface Props {
  teamA: TeamMetrics;
  teamB: TeamMetrics;
  mc: MonteCarloResult;
  vegasSpreadB: number;
}

const color = (hex: string) => (hex.toLowerCase() === '#000000' ? '#64748b' : hex);

export default function MarginHistogram({ teamA, teamB, mc, vegasSpreadB }: Props) {
  const colorA = color(teamA.primaryColor);
  const colorB = color(teamB.primaryColor) === colorA ? color(teamB.secondaryColor) : color(teamB.primaryColor);
  // Team B must win by more than -spread to cover. Margin axis = Team B - Team A.
  const coverLine = -vegasSpreadB;
  const nearestMid = mc.histogram.reduce((best, b) =>
    Math.abs(b.midpoint - coverLine) < Math.abs(best.midpoint - coverLine) ? b : best,
  );

  return (
    <section className="card p-4">
      <SectionTitle
        right={<span className="num text-xs text-slate-500">{mc.iterations.toLocaleString()} simulated games</span>}
      >
        Score Margin Distribution
      </SectionTitle>
      <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
        <span style={{ color: colorA }}>◀ {teamA.abbreviation} wins</span>
        <span style={{ color: colorB }}>{teamB.abbreviation} wins ▶</span>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={mc.histogram} margin={{ top: 22, right: 8, left: -12, bottom: 0 }} barCategoryGap={1}>
            <CartesianGrid stroke="#1e293b" vertical={false} />
            <XAxis
              dataKey="midpoint"
              tick={{ fill: '#64748b', fontSize: 11 }}
              interval="preserveStartEnd"
              minTickGap={14}
              stroke="#334155"
            />
            <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} stroke="#334155" />
            <Tooltip
              cursor={{ fill: 'rgba(148,163,184,.08)' }}
              content={({ payload }) => {
                const b = payload?.[0]?.payload as HistogramBin | undefined;
                if (!b) return null;
                return (
                  <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl">
                    <div className="mb-1 font-semibold">
                      Margin ({teamB.abbreviation} − {teamA.abbreviation}): {b.binLabel}
                    </div>
                    <div className="num text-slate-400">
                      {b.percentage.toFixed(2)}% · {b.count.toLocaleString()} runs
                    </div>
                  </div>
                );
              }}
            />
            <ReferenceLine x={0} stroke="#94a3b8" strokeDasharray="3 3" />
            <ReferenceLine
              x={nearestMid.midpoint}
              stroke="#fbbf24"
              strokeDasharray="4 2"
              label={{ value: `Spread ${teamB.abbreviation} ${fmtLine(vegasSpreadB)}`, fill: '#fbbf24', fontSize: 11, position: 'top' }}
            />
            <Bar dataKey="percentage" radius={[2, 2, 0, 0]} isAnimationActive={false}>
              {mc.histogram.map((b) => (
                <Cell
                  key={b.midpoint}
                  fill={b.winner === 'TEAM_A' ? colorA : b.winner === 'TEAM_B' ? colorB : '#94a3b8'}
                  fillOpacity={b.midpoint > coverLine ? 0.95 : 0.4}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px] text-slate-600">
        Bars are bins of 3 points. Bright bars are outcomes where {teamB.abbreviation} covers the spread; dim bars are
        outcomes where {teamA.abbreviation} covers.
      </p>
    </section>
  );
}
