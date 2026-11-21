import { useMemo, useState } from 'react';
import type { LeagueConfig, ScheduledGame, TeamMetrics } from '../../types/sports';
import { evaluateGame } from '../../engine/edgeCalculator';
import GameSlateCard from './GameSlateCard';

interface Props {
  league: LeagueConfig;
  games: ScheduledGame[];
  teams: TeamMetrics[];
  onSimulate: (g: ScheduledGame) => void;
}

type SortMode = 'TIME' | 'EDGE';

export default function DailySlateView({ league, games, teams, onSimulate }: Props) {
  const [day, setDay] = useState<string>('ALL');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortMode>('TIME');
  const [edgeOnly, setEdgeOnly] = useState(false);

  const rows = useMemo(
    () =>
      games.flatMap((g) => {
        const away = teams.find((t) => t.id === g.awayTeamId);
        const home = teams.find((t) => t.id === g.homeTeamId);
        return away && home ? [evaluateGame(g, away, home, league)] : [];
      }),
    [games, teams, league],
  );

  const days = useMemo(() => {
    const seen: string[] = [];
    games.forEach((g) => {
      const d = g.startTime.split(' ')[0];
      if (!seen.includes(d)) seen.push(d);
    });
    return seen;
  }, [games]);

  const visible = useMemo(() => {
    const s = query.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (day !== 'ALL' && r.game.startTime.split(' ')[0] !== day) return false;
      if (edgeOnly && !((r.hasSpread && r.spreadEdge >= 2) || (r.hasTotal && r.totalEdge >= 2))) return false;
      if (!s) return true;
      return (
        r.away.name.toLowerCase().includes(s) ||
        r.home.name.toLowerCase().includes(s) ||
        r.away.abbreviation.toLowerCase() === s ||
        r.home.abbreviation.toLowerCase() === s
      );
    });
    const best = (r: (typeof list)[number]) => Math.max(r.hasSpread ? r.spreadEdge : 0, r.hasTotal ? r.totalEdge : 0);
    if (sort === 'EDGE') list.sort((a, b) => best(b) - best(a));
    return list;
  }, [rows, day, query, sort, edgeOnly]);

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-semibold ${
      active ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300' : 'border-slate-700 text-slate-400 hover:border-slate-500'
    }`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-lg font-extrabold">{league.name} Slate</h2>
        <button className={chip(day === 'ALL')} onClick={() => setDay('ALL')}>
          All
        </button>
        {days.map((d) => (
          <button key={d} className={chip(day === d)} onClick={() => setDay(d)}>
            {d}
          </button>
        ))}
        <button className={chip(edgeOnly)} onClick={() => setEdgeOnly((v) => !v)}>
          Edges ≥ 2 pts
        </button>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
          aria-label="Sort games"
        >
          <option value="TIME">Sort: Start time</option>
          <option value="EDGE">Sort: Biggest edge</option>
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter teams…"
          className="ml-auto w-44 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1 text-sm focus:border-emerald-500 focus:outline-none"
        />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {visible.map((r) => (
          <GameSlateCard key={r.game.id} row={r} allTeams={teams} onSimulate={() => onSimulate(r.game)} />
        ))}
      </div>
      {visible.length === 0 && <p className="py-10 text-center text-slate-500">No games match your filters.</p>}
    </div>
  );
}
