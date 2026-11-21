import { useMemo, useState } from 'react';
import { Activity, BarChart3, CalendarDays, Scale, Search, Target, Trophy } from 'lucide-react';
import type { ActiveTab, LeagueId, TeamMetrics } from '../../types/sports';
import { LEAGUE_IDS, isCbb } from '../../data/leaguesConfig';
import { TeamBadge } from '../common/ui';

const TABS: { id: ActiveTab; label: string; icon: typeof Activity }[] = [
  { id: 'SIMULATOR', label: 'Simulator', icon: Activity },
  { id: 'SLATE', label: 'Daily Slate', icon: CalendarDays },
  { id: 'RANKINGS', label: 'Power Rankings', icon: BarChart3 },
  { id: 'LEAN_BOARD', label: 'Lean Board', icon: Target },
  { id: 'SEASON', label: 'Season Odds', icon: Trophy },
  { id: 'LEVERAGE', label: 'Tourney Leverage', icon: Scale },
];

interface Props {
  league: LeagueId;
  tab: ActiveTab;
  teams: TeamMetrics[];
  onLeague: (l: LeagueId) => void;
  onTab: (t: ActiveTab) => void;
  onPickTeam: (t: TeamMetrics) => void;
}

export default function Navbar({ league, tab, teams, onLeague, onTab, onPickTeam }: Props) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return teams
      .filter(
        (t) =>
          t.name.toLowerCase().includes(s) ||
          t.abbreviation.toLowerCase().includes(s) ||
          t.conference.toLowerCase().includes(s),
      )
      .slice(0, 8);
  }, [q, teams]);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-slate-950">
            <Activity size={18} strokeWidth={3} />
          </div>
          <span className="text-sm font-extrabold tracking-tight">
            VERSUS<span className="text-emerald-400"> SIM</span>
          </span>
        </div>

        <div className="flex rounded-lg border border-slate-800 bg-slate-900 p-0.5" role="tablist" aria-label="League">
          {LEAGUE_IDS.map((l) => (
            <button
              key={l}
              onClick={() => onLeague(l)}
              className={`num rounded-md px-3 py-1 text-xs font-bold transition ${
                l === league ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        <nav className="order-last flex w-full gap-1 overflow-x-auto md:order-none md:w-auto">
          {TABS.filter((t) => t.id !== 'LEVERAGE' || isCbb(league)).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onTab(id)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                tab === id ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </nav>

        <div className="relative ml-auto w-56">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-500" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder={`Search ${league} teams…`}
            className="w-full rounded-lg border border-slate-800 bg-slate-900 py-1.5 pl-8 pr-2 text-sm placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
          />
          {open && results.length > 0 && (
            <ul className="absolute right-0 z-50 mt-1 w-72 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
              {results.map((t) => (
                <li key={t.id}>
                  <button
                    onMouseDown={() => {
                      onPickTeam(t);
                      setQ('');
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-800"
                  >
                    <TeamBadge team={t} size={26} />
                    <span className="flex-1 truncate">{t.name}</span>
                    <span className="num text-xs text-slate-500">{t.record}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </header>
  );
}
