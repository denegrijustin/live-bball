import { useState, type ReactNode } from 'react';
import type { LetterGrade, TeamMetrics } from '../../types/sports';
import { gradeColor } from '../../engine/gradingEngine';

const CDN = 'https://a.espncdn.com';

/** Resized logo URL from ESPN's image service. Sizes are bucketed so the browser cache is shared across views. */
export function logoUrl(path: string, size: number): string {
  const px = Math.min(200, Math.max(48, Math.ceil((size * 2) / 16) * 16));
  return `${CDN}/combiner/i?img=${path}&w=${px}&h=${px}`;
}

/** Official team logo, falling back to a coloured letter badge if there is none or it fails to load. */
export function TeamBadge({ team, size = 40 }: { team: TeamMetrics; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (team.logo && !failed) {
    return (
      <img
        src={logoUrl(team.logo, size)}
        alt={team.name}
        title={team.name}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="shrink-0 object-contain"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="num flex shrink-0 items-center justify-center rounded-full font-bold text-white shadow-inner"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.3,
        background: `linear-gradient(135deg, ${team.primaryColor}, ${team.primaryColor}cc)`,
        border: `2px solid ${team.secondaryColor}`,
        textShadow: '0 1px 2px rgba(0,0,0,.6)',
      }}
      title={team.name}
    >
      {team.abbreviation.slice(0, 4)}
    </div>
  );
}

export function GradePill({ grade, large = false }: { grade: LetterGrade; large?: boolean }) {
  return (
    <span
      className={`num inline-flex items-center justify-center rounded-md border font-bold ${gradeColor(grade)} ${
        large ? 'h-12 w-14 text-2xl' : 'h-6 min-w-[2rem] px-1 text-xs'
      }`}
    >
      {grade}
    </span>
  );
}

export function RankBadge({ rank, total }: { rank: number; total: number }) {
  const tier =
    rank <= total * 0.15
      ? 'bg-emerald-500/15 text-emerald-300'
      : rank <= total * 0.5
        ? 'bg-sky-500/15 text-sky-300'
        : rank <= total * 0.8
          ? 'bg-amber-500/15 text-amber-300'
          : 'bg-rose-500/15 text-rose-300';
  return <span className={`num rounded px-1.5 py-0.5 text-[11px] font-semibold ${tier}`}>#{rank}</span>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">{children}</h3>
      {right}
    </div>
  );
}

export function Last5({ results }: { results: ('W' | 'L')[] }) {
  return (
    <div className="flex gap-0.5">
      {results.map((r, i) => (
        <span
          key={i}
          className={`num flex h-4 w-4 items-center justify-center rounded-sm text-[9px] font-bold ${
            r === 'W' ? 'bg-emerald-500/25 text-emerald-300' : 'bg-rose-500/25 text-rose-300'
          }`}
        >
          {r}
        </span>
      ))}
    </div>
  );
}

export function SparkBar({ percentile, color = '#10b981' }: { percentile: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
      <div className="h-full rounded-full" style={{ width: `${Math.max(2, percentile)}%`, background: color }} />
    </div>
  );
}

export function percentileColor(p: number): string {
  if (p >= 80) return '#10b981';
  if (p >= 55) return '#84cc16';
  if (p >= 35) return '#f59e0b';
  if (p >= 15) return '#f97316';
  return '#f43f5e';
}
