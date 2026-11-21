import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, BarChart3, CalendarDays, Gauge, Scale, Search, Target, Trophy, X } from 'lucide-react';
import type { ActiveTab, LeagueId, TeamMetrics } from '../../types/sports';
import { LEAGUE_IDS, isCbb } from '../../data/leaguesConfig';
import { TeamBadge } from '../common/ui';

const TABS: { id: ActiveTab; label: string; short: string; icon: typeof Activity }[] = [
  { id: 'SIMULATOR', label: 'Simulator', short: 'Sim', icon: Activity },
  { id: 'SLATE', label: 'Daily Slate', short: 'Slate', icon: CalendarDays },
  { id: 'RANKINGS', label: 'Power Rankings', short: 'Rankings', icon: BarChart3 },
  { id: 'LEAN_BOARD', label: 'Lean Board', short: 'Leans', icon: Target },
  { id: 'SEASON', label: 'Season Odds', short: 'Season', icon: Trophy },
  { id: 'LEVERAGE', label: 'Tourney Leverage', short: 'Leverage', icon: Scale },
  { id: 'TRACKING', label: 'Track Record', short: 'Record', icon: Gauge },
];

interface Props {
  league: LeagueId;
  tab: ActiveTab;
  teams: TeamMetrics[];
  onLeague: (l: LeagueId) => void;
  onTab: (t: ActiveTab) => void;
  onPickTeam: (t: TeamMetrics) => void;
}

function SearchBox({ teams, onPick, autoFocus = false }: { teams: TeamMetrics[]; onPick: (t: TeamMetrics) => void; autoFocus?: boolean }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return teams
      .filter((t) => t.name.toLowerCase().includes(s) || t.abbreviation.toLowerCase().includes(s) || t.conference.toLowerCase().includes(s))
      .slice(0, 8);
  }, [q, teams]);

  return (
    <div className="relative w-full">
      <Search size={14} className="absolute left-2.5 top-3 text-slate-500" />
      <input
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search teams…"
        aria-label="Search teams"
        className="w-full rounded-lg border border-slate-800 bg-slate-900 py-2 pl-8 pr-2 text-sm placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
      />
      {open && results.length > 0 && (
        <ul className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-xl lg:left-auto lg:w-72">
          {results.map((t) => (
            <li key={t.id}>
              <button
                onMouseDown={() => {
                  onPick(t);
                  setQ('');
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-slate-800"
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
  );
}

export default function Navbar({ league, tab, teams, onLeague, onTab, onPickTeam }: Props) {
  const [searchOpen, setSearchOpen] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const tabs = TABS.filter((t) => t.id !== 'LEVERAGE' || isCbb(league));

  // Keep the active tab visible in the horizontally scrolling mobile strip.
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [tab, league]);

  const pick = (t: TeamMetrics) => {
    setSearchOpen(false);
    onPickTeam(t);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-3 py-2 sm:px-4 lg:gap-x-4 lg:py-3">
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-slate-950">
            <Activity size={18} strokeWidth={3} />
          </div>
          <span className="hidden text-sm font-extrabold tracking-tight sm:inline">
            VERSUS<span className="text-emerald-400"> SIM</span>
          </span>
        </div>

        <div className="no-scrollbar flex min-w-0 overflow-x-auto rounded-lg border border-slate-800 bg-slate-900 p-0.5" role="tablist" aria-label="League">
          {LEAGUE_IDS.map((l) => (
            <button
              key={l}
              role="tab"
              aria-selected={l === league}
              onClick={() => onLeague(l)}
              className={`num shrink-0 rounded-md px-2.5 py-1.5 text-xs font-bold transition sm:px-3 ${
                l === league ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Desktop tabs: their own row until the screen is wide enough to share the first one */}
        <nav className="order-last hidden w-full gap-1 lg:flex 2xl:order-none 2xl:w-auto">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-semibold transition ${
                tab === id ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </nav>

        {/* Search: always visible on desktop, behind an icon on phones */}
        <div className="ml-auto hidden w-44 lg:block">
          <SearchBox teams={teams} onPick={pick} />
        </div>
        <button
          onClick={() => setSearchOpen((o) => !o)}
          aria-label={searchOpen ? 'Close search' : 'Search teams'}
          className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300 lg:hidden"
        >
          {searchOpen ? <X size={18} /> : <Search size={18} />}
        </button>
      </div>

      {searchOpen && (
        <div className="px-3 pb-2 lg:hidden">
          <SearchBox teams={teams} onPick={pick} autoFocus />
        </div>
      )}

      {/* Mobile tab strip: scrolls sideways, with a fade that hints at more tabs */}
      <div className="relative lg:hidden">
        <div ref={stripRef} className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2" role="tablist" aria-label="Sections">
          {tabs.map(({ id, short, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              data-active={tab === id}
              onClick={() => onTab(id)}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold transition ${
                tab === id ? 'bg-slate-800 text-white' : 'text-slate-400'
              }`}
            >
              <Icon size={15} />
              {short}
            </button>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-slate-950 to-transparent" />
      </div>
    </header>
  );
}
