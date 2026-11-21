import { useMemo, useState } from 'react';
import { Grid3x3, Table2 } from 'lucide-react';
import type { LeagueConfig, TeamMetrics } from '../../types/sports';
import RankingsTable from './RankingsTable';
import EfficiencyMatrix from './EfficiencyMatrix';

interface Props {
  league: LeagueConfig;
  teams: TeamMetrics[];
  onSelect: (t: TeamMetrics) => void;
}

export default function PowerRankingsView({ league, teams, onSelect }: Props) {
  const [mode, setMode] = useState<'TABLE' | 'MATRIX'>('TABLE');
  const [conf, setConf] = useState('ALL');
  const [query, setQuery] = useState('');

  const conferences = useMemo(() => Array.from(new Set(teams.map((t) => t.conference))).sort(), [teams]);
  const filtered = useMemo(() => {
    const s = query.trim().toLowerCase();
    return teams.filter(
      (t) =>
        (conf === 'ALL' || t.conference === conf) &&
        (!s || t.name.toLowerCase().includes(s) || t.abbreviation.toLowerCase().includes(s)),
    );
  }, [teams, conf, query]);
  const highlight = useMemo(
    () => (conf === 'ALL' && !query ? new Set<string>() : new Set(filtered.map((t) => t.id))),
    [filtered, conf, query],
  );

  const toggle = (m: 'TABLE' | 'MATRIX', label: string, Icon: typeof Table2) => (
    <button
      onClick={() => setMode(m)}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold ${
        mode === m ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-slate-100'
      }`}
    >
      <Icon size={13} /> {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-lg font-extrabold">{league.name} Power Rankings</h2>
        <div className="flex rounded-lg border border-slate-800 bg-slate-900 p-0.5">
          {toggle('TABLE', 'Data Table', Table2)}
          {toggle('MATRIX', 'Efficiency Matrix', Grid3x3)}
        </div>
        <select
          value={conf}
          onChange={(e) => setConf(e.target.value)}
          aria-label="Conference filter"
          className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
        >
          <option value="ALL">All conferences</option>
          {conferences.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter teams…"
          className="ml-auto w-44 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1 text-sm focus:border-emerald-500 focus:outline-none"
        />
      </div>
      {mode === 'TABLE' ? (
        <RankingsTable teams={filtered} allTeams={teams} onSelect={onSelect} />
      ) : (
        <EfficiencyMatrix league={league} teams={teams} highlightIds={highlight} onSelect={onSelect} />
      )}
    </div>
  );
}
