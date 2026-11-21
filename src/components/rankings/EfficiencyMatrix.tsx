import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import type { LeagueConfig, TeamMetrics } from '../../types/sports';

interface Props {
  league: LeagueConfig;
  teams: TeamMetrics[];
  highlightIds: Set<string>;
  onSelect: (t: TeamMetrics) => void;
}

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: TeamMetrics;
}

export default function EfficiencyMatrix({ league, teams, highlightIds, onSelect }: Props) {
  const avg = league.avgEfficiency;
  const xs = teams.map((t) => t.offRating);
  const ys = teams.map((t) => t.defRating);
  const pad = league.id === 'NBA' ? 1.5 : 1;
  const xDom: [number, number] = [Math.floor(Math.min(...xs, avg) - pad), Math.ceil(Math.max(...xs, avg) + pad)];
  const yDom: [number, number] = [Math.floor(Math.min(...ys, avg) - pad), Math.ceil(Math.max(...ys, avg) + pad)];

  const renderDot = (props: DotProps) => {
    const { cx, cy, payload } = props;
    if (cx === undefined || cy === undefined || !payload) return <g />;
    const dim = highlightIds.size > 0 && !highlightIds.has(payload.id);
    const fill = payload.primaryColor === '#000000' ? '#475569' : payload.primaryColor;
    if (teams.length > 60) {
      // Large leagues (FBS): small dots; hover for the name.
      return (
        <g onClick={() => onSelect(payload)} style={{ cursor: 'pointer' }} opacity={dim ? 0.15 : 0.95}>
          <circle cx={cx} cy={cy} r={5.5} fill={fill} stroke={payload.secondaryColor} strokeWidth={1.5} />
        </g>
      );
    }
    return (
      <g onClick={() => onSelect(payload)} style={{ cursor: 'pointer' }} opacity={dim ? 0.2 : 1}>
        <circle cx={cx} cy={cy} r={9} fill={fill} stroke={payload.secondaryColor} strokeWidth={2} />
        <text
          x={cx}
          y={cy + 3}
          textAnchor="middle"
          fontSize={7}
          fontWeight={700}
          fill="#fff"
          style={{ fontFamily: 'JetBrains Mono, monospace', pointerEvents: 'none' }}
        >
          {payload.abbreviation.slice(0, 3)}
        </text>
      </g>
    );
  };

  return (
    <div className="card p-4">
      <div className="h-[560px]">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 24, right: 24, bottom: 36, left: 12 }}>
            <CartesianGrid stroke="#1e293b" />
            <XAxis
              type="number"
              dataKey="offRating"
              name="Offense"
              domain={xDom}
              tick={{ fill: '#64748b', fontSize: 11 }}
              stroke="#334155"
              label={{ value: `Offense (${league.unitLabel}) →  better`, position: 'bottom', fill: '#94a3b8', fontSize: 12 }}
            />
            {/* Reversed so that better (lower points allowed) is at the top. */}
            <YAxis
              type="number"
              dataKey="defRating"
              name="Defense"
              reversed
              domain={yDom}
              tick={{ fill: '#64748b', fontSize: 11 }}
              stroke="#334155"
              label={{ value: '← worse   Defense (pts allowed)   better →', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 12, dy: 110 }}
            />
            <ZAxis range={[100, 100]} />
            <ReferenceLine x={avg} stroke="#64748b" strokeDasharray="4 4" />
            <ReferenceLine y={avg} stroke="#64748b" strokeDasharray="4 4" />
            <Tooltip
              cursor={{ strokeDasharray: '3 3', stroke: '#475569' }}
              content={({ payload }) => {
                const t = payload?.[0]?.payload as TeamMetrics | undefined;
                if (!t) return null;
                return (
                  <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl">
                    <div className="mb-1 text-sm font-bold">{t.name}</div>
                    <div className="num text-slate-400">
                      Off {t.offRating.toFixed(1)} · Def {t.defRating.toFixed(1)}
                    </div>
                    <div className="num text-slate-400">
                      Net {(t.offRating - t.defRating).toFixed(1)} · Power {t.powerRating.toFixed(1)}
                    </div>
                  </div>
                );
              }}
            />
            <Scatter data={teams} shape={renderDot} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-center text-[11px] font-bold uppercase tracking-wider">
        <span className="rounded bg-emerald-500/10 py-1 text-emerald-400">Top-right: Elite (strong O + strong D)</span>
        <span className="rounded bg-sky-500/10 py-1 text-sky-400">Top-left: Defense-first</span>
        <span className="rounded bg-amber-500/10 py-1 text-amber-400">Bottom-right: Offense-first</span>
        <span className="rounded bg-rose-500/10 py-1 text-rose-400">Bottom-left: Rebuilding</span>
      </div>
    </div>
  );
}
