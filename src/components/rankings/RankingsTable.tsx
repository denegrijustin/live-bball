import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { TeamMetrics } from '../../types/sports';
import { percentileOf, statValue, type StatKey } from '../../engine/gradingEngine';
import { fmtSigned } from '../../lib/format';
import { Last5, percentileColor, SparkBar, TeamBadge } from '../common/ui';

type SortKey = StatKey | 'wins' | 'name';

interface Col {
  key: SortKey;
  label: string;
  digits: number;
  spark?: boolean;
}

const COLS: Col[] = [
  { key: 'powerRating', label: 'Power', digits: 1, spark: true },
  { key: 'offRating', label: 'Off', digits: 1, spark: true },
  { key: 'defRating', label: 'Def', digits: 1, spark: true },
  { key: 'net', label: 'Net', digits: 1 },
  { key: 'pace', label: 'Pace', digits: 1 },
  { key: 'sos', label: 'SOS', digits: 1 },
  { key: 'trendDelta', label: '14d', digits: 1 },
];

interface Props {
  teams: TeamMetrics[]; // filtered view
  allTeams: TeamMetrics[]; // used for percentiles
  onSelect: (t: TeamMetrics) => void;
}

export default function RankingsTable({ teams, allTeams, onSelect }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('powerRating');
  const [desc, setDesc] = useState(true);

  const sorted = useMemo(() => {
    const val = (t: TeamMetrics): number | string => {
      if (sortKey === 'name') return t.name;
      if (sortKey === 'wins') return t.wins / Math.max(1, t.wins + t.losses);
      return statValue(t, sortKey);
    };
    const list = [...teams].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c = typeof x === 'string' ? x.localeCompare(y as string) : x - (y as number);
      return desc ? -c : c;
    });
    return list;
  }, [teams, sortKey, desc]);

  const rankByPower = useMemo(() => {
    const m = new Map<string, number>();
    [...allTeams].sort((a, b) => b.powerRating - a.powerRating).forEach((t, i) => m.set(t.id, i + 1));
    return m;
  }, [allTeams]);

  const sortButton = (key: SortKey, label: string) => (
      <button
        onClick={() => {
          if (sortKey === key) setDesc((d) => !d);
          else {
            setSortKey(key);
            // Defense sorts best-first (ascending) by default since lower is better.
            setDesc(key === 'name' || key === 'defRating' ? false : true);
          }
        }}
        className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider ${
          sortKey === key ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'
        }`}
      >
        {label}
        {sortKey === key && (desc ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
      </button>
  );

  const header = (key: SortKey, label: string, align: 'left' | 'right' = 'right') => (
    <th className={`px-2 py-2 ${align === 'left' ? 'text-left' : 'text-right'}`}>{sortButton(key, label)}</th>
  );

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm md:min-w-[820px]">
        <thead className="border-b border-slate-800">
          <tr>
            <th className="px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">#</th>
            {header('name', 'Team', 'left')}
            {header('wins', 'Record')}
            {COLS.map((c) => (
              <th key={c.key} className={`px-2 py-2 text-right ${c.key === 'powerRating' ? '' : 'hidden md:table-cell'}`}>
                {sortButton(c.key, c.label)}
              </th>
            ))}
            <th className="hidden px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 md:table-cell">Last 5</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => (
            <tr
              key={t.id}
              onClick={() => onSelect(t)}
              className="cursor-pointer border-b border-slate-800/60 hover:bg-slate-800/40"
            >
              <td className="num px-2 py-2 text-slate-500">{rankByPower.get(t.id)}</td>
              <td className="px-2 py-2">
                <div className="flex items-center gap-2">
                  <TeamBadge team={t} size={28} />
                  <div className="min-w-0">
                    <div className="truncate font-semibold"><span className="md:hidden">{t.shortName}</span><span className="hidden md:inline">{t.name}</span></div>
                    <div className="truncate text-[11px] text-slate-500">{t.conference}</div>
                  </div>
                </div>
              </td>
              <td className="num px-2 py-2 text-right">{t.record}</td>
              {COLS.map((c) => {
                const v = statValue(t, c.key as StatKey);
                const pct = percentileOf(t, allTeams, c.key as StatKey);
                const text =
                  c.key === 'net' || c.key === 'trendDelta' ? fmtSigned(v, c.digits) : v.toFixed(c.digits);
                return (
                  <td key={c.key} className={`px-2 py-2 text-right ${c.key === 'powerRating' ? '' : 'hidden md:table-cell'}`}>
                    <div className="ml-auto w-16">
                      <div
                        className={`num font-semibold ${
                          (c.key === 'trendDelta' || c.key === 'net') && v !== 0
                            ? v > 0
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                            : ''
                        }`}
                      >
                        {text}
                      </div>
                      {c.spark && <SparkBar percentile={pct} color={percentileColor(pct)} />}
                    </div>
                  </td>
                );
              })}
              <td className="hidden px-2 py-2 md:table-cell">
                <Last5 results={t.last5} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length === 0 && <p className="py-8 text-center text-slate-500">No teams match.</p>}
      <p className="px-3 py-2 text-[11px] text-slate-600">
        Defense is points allowed, so lower is better. Spark bars show league percentile (green = elite).
      </p>
    </div>
  );
}
