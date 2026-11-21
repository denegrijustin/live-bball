import type { TeamMetrics } from '../../types/sports';
import { rankOf, statValue, lowerIsBetter, type StatKey } from '../../engine/gradingEngine';
import { fmtSigned } from '../../lib/format';
import { RankBadge, SectionTitle, Last5 } from '../common/ui';

interface Row {
  label: string;
  stat: StatKey;
  digits: number;
  signed?: boolean;
}

const ROWS: Row[] = [
  { label: 'Power Rating', stat: 'powerRating', digits: 1 },
  { label: 'Offense', stat: 'offRating', digits: 1 },
  { label: 'Defense (lower is better)', stat: 'defRating', digits: 1 },
  { label: 'Net Efficiency', stat: 'net', digits: 1, signed: true },
  { label: 'Pace', stat: 'pace', digits: 1 },
  { label: 'Strength of Schedule', stat: 'sos', digits: 1 },
  { label: 'Consistency', stat: 'consistency', digits: 2 },
  { label: '14-Day Trend', stat: 'trendDelta', digits: 1, signed: true },
];

interface Props {
  teamA: TeamMetrics;
  teamB: TeamMetrics;
  allTeams: TeamMetrics[];
}

export default function TaleOfTheTape({ teamA, teamB, allTeams }: Props) {
  const n = allTeams.length;
  return (
    <section className="card p-4">
      <SectionTitle>Tale of the Tape</SectionTitle>
      <div className="mb-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm font-bold">
        <span className="text-left">{teamA.shortName}</span>
        <span />
        <span className="text-right">{teamB.shortName}</span>
      </div>
      <div className="divide-y divide-slate-800/70">
        {ROWS.map((r) => {
          const a = statValue(teamA, r.stat);
          const b = statValue(teamB, r.stat);
          const aBetter = lowerIsBetter(r.stat) ? a < b : a > b;
          const tie = a === b;
          const fmt = (v: number) => (r.signed ? fmtSigned(v, r.digits) : v.toFixed(r.digits));
          return (
            <div key={r.stat} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-2">
              <div className="flex items-center gap-2">
                <span className={`num text-base font-bold ${!tie && aBetter ? 'text-emerald-400' : 'text-slate-300'}`}>
                  {fmt(a)}
                </span>
                <RankBadge rank={rankOf(teamA, allTeams, r.stat)} total={n} />
              </div>
              <span className="text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {r.label}
              </span>
              <div className="flex items-center justify-end gap-2">
                <RankBadge rank={rankOf(teamB, allTeams, r.stat)} total={n} />
                <span className={`num text-base font-bold ${!tie && !aBetter ? 'text-emerald-400' : 'text-slate-300'}`}>
                  {fmt(b)}
                </span>
              </div>
            </div>
          );
        })}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-2">
          <div className="flex items-center gap-2">
            <span className="num font-bold">{teamA.record}</span>
            <Last5 results={teamA.last5} />
          </div>
          <span className="text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Record · Last 5
          </span>
          <div className="flex items-center justify-end gap-2">
            <Last5 results={teamB.last5} />
            <span className="num font-bold">{teamB.record}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
