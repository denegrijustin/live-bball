import { useEffect } from 'react';
import { TrendingDown, TrendingUp, X } from 'lucide-react';
import type { TeamMetrics } from '../../types/sports';
import { computeTeamGrades } from '../../engine/gradingEngine';
import { fmtSigned } from '../../lib/format';
import { GradePill, Last5, percentileColor, SparkBar, TeamBadge } from '../common/ui';

interface Props {
  team: TeamMetrics;
  allTeams: TeamMetrics[];
  onClose: () => void;
  onSimulateAgainst?: (t: TeamMetrics) => void;
}

export default function TeamReportModal({ team, allTeams, onClose }: Props) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const grades = computeTeamGrades(team, allTeams);
  const n = allTeams.length;
  const powerRank = [...allTeams].sort((a, b) => b.powerRating - a.powerRating).findIndex((t) => t.id === team.id) + 1;
  const up = team.trendDelta >= 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`${team.name} report`}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <aside className="relative h-full w-full max-w-md overflow-y-auto border-l border-slate-700 bg-slate-950 shadow-2xl">
        <div
          className="flex items-center gap-4 p-5"
          style={{ background: `linear-gradient(135deg, ${team.primaryColor}55, transparent)` }}
        >
          <TeamBadge team={team} size={64} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-extrabold">{team.name}</h2>
            <div className="num text-sm text-slate-400">
              {team.record} · {team.conference} · #{powerRank} of {n}
            </div>
            <div className="mt-1 flex items-center gap-3">
              <Last5 results={team.last5} />
              <span className={`num flex items-center gap-1 text-xs font-semibold ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
                {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                {fmtSigned(team.trendDelta)} / 14d
              </span>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-2 hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 p-5">
          {grades.map((g) => (
            <div key={g.key} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{g.label}</div>
                  <div className="num mt-0.5 text-lg font-bold">{g.displayValue}</div>
                </div>
                <GradePill grade={g.grade} large />
              </div>
              <SparkBar percentile={g.percentile} color={percentileColor(g.percentile)} />
              <div className="num mt-1 flex justify-between text-[11px] text-slate-500">
                <span>{g.percentile.toFixed(0)}th pct</span>
                <span>
                  #{g.rank} · z {g.zScore >= 0 ? '+' : ''}
                  {g.zScore.toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>
        <p className="px-5 pb-6 text-[11px] leading-relaxed text-slate-600">
          Grades convert each rating to a z-score versus the league (defense inverted so lower points allowed grades
          higher), then to a percentile via the normal CDF: A+ ≥ 97th, A ≥ 92nd, A− ≥ 87th, B+ ≥ 80th, B ≥ 70th, B− ≥
          60th, C+ ≥ 50th, C ≥ 40th, C− ≥ 30th, D ≥ 15th, otherwise F.
        </p>
      </aside>
    </div>
  );
}
