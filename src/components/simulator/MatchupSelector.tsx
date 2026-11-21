import { useMemo, useRef, useState, useEffect } from 'react';
import { ArrowLeftRight, ChevronDown } from 'lucide-react';
import type { TeamMetrics, VenueType } from '../../types/sports';
import { TeamBadge } from '../common/ui';

function TeamPicker({
  label,
  team,
  teams,
  disabledId,
  onChange,
}: {
  label: string;
  team: TeamMetrics;
  teams: TeamMetrics[];
  disabledId: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return teams.filter(
      (t) =>
        !s ||
        t.name.toLowerCase().includes(s) ||
        t.abbreviation.toLowerCase().includes(s) ||
        t.conference.toLowerCase().includes(s),
    );
  }, [q, teams]);

  return (
    <div className="relative flex-1" ref={ref}>
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-left hover:border-slate-500"
      >
        <TeamBadge team={team} size={36} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{team.name}</div>
          <div className="num text-xs text-slate-500">
            {team.record} · {team.conference}
          </div>
        </div>
        <ChevronDown size={16} className="text-slate-500" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 shadow-2xl">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search team, abbr, or conference…"
            className="w-full rounded-t-lg border-b border-slate-800 bg-slate-950 px-3 py-2 text-sm focus:outline-none"
          />
          <ul className="max-h-64 overflow-y-auto">
            {list.map((t) => (
              <li key={t.id}>
                <button
                  disabled={t.id === disabledId}
                  onClick={() => {
                    onChange(t.id);
                    setOpen(false);
                    setQ('');
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-800 disabled:opacity-30"
                >
                  <TeamBadge team={t} size={24} />
                  <span className="flex-1 truncate">{t.name}</span>
                  <span className="num text-xs text-slate-500">{t.powerRating.toFixed(1)}</span>
                </button>
              </li>
            ))}
            {list.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">No teams found</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

interface Props {
  teams: TeamMetrics[];
  teamA: TeamMetrics;
  teamB: TeamMetrics;
  venue: VenueType;
  onTeamA: (id: string) => void;
  onTeamB: (id: string) => void;
  onSwap: () => void;
  onVenue: (v: VenueType) => void;
}

export default function MatchupSelector({ teams, teamA, teamB, venue, onTeamA, onTeamB, onSwap, onVenue }: Props) {
  const venues: { id: VenueType; label: string }[] = [
    { id: 'TEAM_A_HOME', label: `${teamA.abbreviation} Home` },
    { id: 'NEUTRAL', label: 'Neutral' },
    { id: 'TEAM_B_HOME', label: `${teamB.abbreviation} Home` },
  ];
  return (
    <section className="card p-4">
      <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-end">
        <TeamPicker label="Team A (Away)" team={teamA} teams={teams} disabledId={teamB.id} onChange={onTeamA} />
        <button
          onClick={onSwap}
          title="Swap teams"
          className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-800 hover:bg-slate-700"
        >
          <ArrowLeftRight size={16} />
        </button>
        <TeamPicker label="Team B (Home)" team={teamB} teams={teams} disabledId={teamA.id} onChange={onTeamB} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Venue</span>
        <div className="flex rounded-lg border border-slate-800 bg-slate-950 p-0.5">
          {venues.map((v) => (
            <button
              key={v.id}
              onClick={() => onVenue(v.id)}
              className={`rounded-md px-3 py-1 text-xs font-semibold ${
                venue === v.id ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
