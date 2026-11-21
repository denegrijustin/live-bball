import { useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import type {
  LeagueConfig,
  LeverageRow,
  ScheduledGame,
  SeasonProjection,
  TeamMetrics,
} from '../../types/sports';
import { TeamBadge } from '../common/ui';

interface Props {
  league: LeagueConfig;
  teams: TeamMetrics[];
  leverage: LeverageRow[];
  season: SeasonProjection[];
  slate: ScheduledGame[];
  initialTeamId: string | null;
  asOf: string;
  onSimulate: (g: ScheduledGame) => void;
}

const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' }).format(
    new Date(iso),
  );

const swingOf = (r: LeverageRow) => r.bidIfWin - r.bidIfLoss;

function Pct({ v, base }: { v: number; base: number }) {
  const d = v - base;
  const tone = d > 0.05 ? 'text-emerald-300' : d < -0.05 ? 'text-rose-300' : 'text-slate-300';
  return (
    <span className="num">
      <span className="font-semibold">{v.toFixed(1)}%</span>{' '}
      <span className={`text-[11px] ${tone}`}>
        ({d >= 0 ? '+' : ''}
        {d.toFixed(1)})
      </span>
    </span>
  );
}

function Swing({ v }: { v: number }) {
  const tone = v >= 15 ? 'bg-emerald-500/20 text-emerald-300' : v >= 6 ? 'bg-lime-500/15 text-lime-300' : v >= 2 ? 'bg-amber-500/10 text-amber-300' : 'bg-slate-800 text-slate-400';
  return <span className={`num rounded px-2 py-0.5 text-xs font-bold ${tone}`}>{v.toFixed(1)} pts</span>;
}

export default function LeverageView({ league, teams, leverage, season, slate, initialTeamId, asOf, onSimulate }: Props) {
  const byId = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const seasonById = useMemo(() => new Map(season.map((p) => [p.teamId, p])), [season]);
  const slateById = useMemo(() => new Map(slate.map((g) => [g.id, g])), [slate]);

  const [days, setDays] = useState<number>(7);
  const [minSwing, setMinSwing] = useState<number>(3);
  const [teamId, setTeamId] = useState<string>(initialTeamId ?? '');
  const [teamSort, setTeamSort] = useState<'DATE' | 'SWING'>('SWING');
  const [showAll, setShowAll] = useState(false);

  // ---- Biggest games ----
  const games = useMemo(() => {
    const start = Date.parse(asOf);
    const end = start + days * 86400000;
    const byGame = new Map<string, LeverageRow[]>();
    for (const r of leverage) {
      const t = Date.parse(r.date);
      if (t < start - 6 * 3600000 || t > end) continue;
      if (!byGame.has(r.gameId)) byGame.set(r.gameId, []);
      byGame.get(r.gameId)!.push(r);
    }
    return [...byGame.entries()]
      .map(([gameId, rows]) => ({ gameId, rows, top: Math.max(...rows.map(swingOf)) }))
      .filter((g) => g.top >= minSwing)
      .sort((a, b) => b.top - a.top)
      .slice(0, 80);
  }, [leverage, days, minSwing, asOf]);
  const shownGames = showAll ? games : games.slice(0, 20);

  // ---- Team lens ----
  const bubbleTeams = useMemo(() => {
    const withRows = new Set(leverage.map((r) => r.teamId));
    return teams
      .filter((t) => withRows.has(t.id))
      .sort((a, b) => (seasonById.get(b.id)?.bidPct ?? 0) - (seasonById.get(a.id)?.bidPct ?? 0));
  }, [teams, leverage, seasonById]);
  const team = byId.get(teamId);
  const teamRows = useMemo(() => {
    const rows = leverage.filter((r) => r.teamId === teamId);
    return rows.sort((a, b) => (teamSort === 'DATE' ? a.date.localeCompare(b.date) : swingOf(b) - swingOf(a)));
  }, [leverage, teamId, teamSort]);
  const teamSeason = seasonById.get(teamId);

  const chip = (active: boolean) =>
    `rounded-md px-3 py-1 text-xs font-semibold ${active ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-slate-100'}`;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-extrabold">{league.name} NCAA Tournament Leverage</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          For each remaining game: a team's chance of making the 68-team field if it <b className="text-emerald-300">wins</b> versus
          if it <b className="text-rose-300">loses</b>. The numbers in parentheses are the change from the team's current
          chance. The swing is the gap between the two outcomes, so bigger means the game matters more.
        </p>
      </div>

      {/* Biggest games */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Biggest games</h3>
          <div className="flex rounded-lg border border-slate-800 bg-slate-900 p-0.5">
            {[2, 7, 14, 400].map((d) => (
              <button key={d} onClick={() => setDays(d)} className={chip(days === d)}>
                {d === 400 ? 'All' : `Next ${d}d`}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            Min swing
            <input type="range" min={0} max={25} step={1} value={minSwing} onChange={(e) => setMinSwing(Number(e.target.value))} className="accent-emerald-500" />
            <span className="num w-12 font-semibold text-slate-200">{minSwing} pts</span>
          </label>
        </div>

        {/* Phones: a card per game */}
        <div className="space-y-3 md:hidden">
          {shownGames.map((g) => {
            const rows = [...g.rows].sort((a, b) => swingOf(b) - swingOf(a));
            const first = rows[0];
            const t0 = byId.get(first.teamId);
            const o0 = byId.get(first.oppId);
            if (!t0 || !o0) return null;
            const sg = slateById.get(g.gameId);
            return (
              <article key={g.gameId} className="card p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">
                      {first.home ? `${o0.abbreviation} @ ${t0.abbreviation}` : `${t0.abbreviation} @ ${o0.abbreviation}`}
                      {first.neutral && <span className="ml-1 rounded bg-sky-500/15 px-1 text-[10px] text-sky-300">N</span>}
                    </div>
                    <div className="text-[11px] text-slate-500">{fmtDay(first.date)}</div>
                  </div>
                  {sg && (
                    <button onClick={() => onSimulate(sg)} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-500 px-3 py-2 text-xs font-bold text-slate-950">
                      <Play size={11} fill="currentColor" /> Simulate
                    </button>
                  )}
                </div>
                <div className="mt-2 space-y-2">
                  {rows.map((r) => {
                    const t = byId.get(r.teamId);
                    if (!t) return null;
                    return (
                      <div key={r.teamId} className="rounded-lg bg-slate-950/60 p-2">
                        <div className="flex items-center gap-2">
                          <TeamBadge team={t} size={24} />
                          <span className="font-medium">{t.shortName}</span>
                          <span className="num text-[11px] text-slate-500">win {(r.winProb * 100).toFixed(0)}%</span>
                          <span className="ml-auto"><Swing v={swingOf(r)} /></span>
                        </div>
                        <div className="num mt-1.5 grid grid-cols-3 gap-1 text-xs">
                          <div><div className="text-[10px] uppercase text-slate-500">Now</div>{r.bidBase.toFixed(1)}%</div>
                          <div><div className="text-[10px] uppercase text-slate-500">If win</div><Pct v={r.bidIfWin} base={r.bidBase} /></div>
                          <div><div className="text-[10px] uppercase text-slate-500">If loss</div><Pct v={r.bidIfLoss} base={r.bidBase} /></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
          {games.length === 0 && <p className="py-8 text-center text-slate-500">No games clear that swing in this window.</p>}
          {games.length > 20 && (
            <div className="text-center">
              <button onClick={() => setShowAll((v) => !v)} className="text-xs font-semibold text-emerald-300">
                {showAll ? 'Show top 20 only' : `Show all ${games.length} games`}
              </button>
            </div>
          )}
        </div>

        <div className="card hidden overflow-x-auto md:block">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Game</th>
                <th className="px-2 py-2 text-left">Team</th>
                <th className="px-2 py-2 text-right">Now</th>
                <th className="px-2 py-2 text-right">If win</th>
                <th className="px-2 py-2 text-right">If loss</th>
                <th className="px-2 py-2 text-right">Swing</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {shownGames.flatMap((g) =>
                [...g.rows]
                  .sort((a, b) => swingOf(b) - swingOf(a))
                  .map((r, i) => {
                    const t = byId.get(r.teamId);
                    const o = byId.get(r.oppId);
                    if (!t || !o) return null;
                    const sg = slateById.get(g.gameId);
                    return (
                      <tr key={`${g.gameId}-${r.teamId}`} className={`border-slate-800/60 ${i === 0 ? 'border-t' : ''} hover:bg-slate-800/30`}>
                        {i === 0 ? (
                          <td className="px-3 py-2 align-top" rowSpan={g.rows.length}>
                            <div className="font-semibold">
                              {r.home ? `${o.abbreviation} @ ${t.abbreviation}` : `${t.abbreviation} @ ${o.abbreviation}`}
                              {r.neutral && <span className="ml-1 rounded bg-sky-500/15 px-1 text-[10px] text-sky-300">N</span>}
                            </div>
                            <div className="text-[11px] text-slate-500">{fmtDay(r.date)}</div>
                          </td>
                        ) : null}
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2">
                            <TeamBadge team={t} size={24} />
                            <span className="font-medium">{t.shortName}</span>
                            <span className="num text-[11px] text-slate-500">win {(r.winProb * 100).toFixed(0)}%</span>
                          </div>
                        </td>
                        <td className="num px-2 py-2 text-right">{r.bidBase.toFixed(1)}%</td>
                        <td className="px-2 py-2 text-right"><Pct v={r.bidIfWin} base={r.bidBase} /></td>
                        <td className="px-2 py-2 text-right"><Pct v={r.bidIfLoss} base={r.bidBase} /></td>
                        <td className="px-2 py-2 text-right"><Swing v={swingOf(r)} /></td>
                        <td className="px-2 py-2 text-right">
                          {i === 0 && sg && (
                            <button
                              onClick={() => onSimulate(sg)}
                              className="inline-flex items-center gap-1 rounded-md bg-emerald-500 px-2 py-1 text-xs font-bold text-slate-950 hover:bg-emerald-400"
                            >
                              <Play size={11} fill="currentColor" /> Simulate
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  }),
              )}
            </tbody>
          </table>
          {games.length === 0 && <p className="py-8 text-center text-slate-500">No games clear that swing in this window. Try a longer window or a lower minimum.</p>}
          {games.length > 20 && (
            <div className="border-t border-slate-800 p-3 text-center">
              <button onClick={() => setShowAll((v) => !v)} className="text-xs font-semibold text-emerald-300 hover:text-emerald-200">
                {showAll ? 'Show top 20 only' : `Show all ${games.length} games`}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Team lens */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Team lens</h3>
          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            aria-label="Team"
            className="max-w-xs rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
          >
            <option value="">Choose a team (bubble teams first)…</option>
            {bubbleTeams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {(seasonById.get(t.id)?.bidPct ?? 0).toFixed(0)}% bid
              </option>
            ))}
          </select>
          {team && (
            <div className="flex rounded-lg border border-slate-800 bg-slate-900 p-0.5">
              <button onClick={() => setTeamSort('SWING')} className={chip(teamSort === 'SWING')}>Biggest swing</button>
              <button onClick={() => setTeamSort('DATE')} className={chip(teamSort === 'DATE')}>By date</button>
            </div>
          )}
        </div>

        {team && teamSeason && (
          <div className="card flex flex-wrap items-center gap-4 p-4">
            <TeamBadge team={team} size={44} />
            <div>
              <div className="font-bold">{team.name}</div>
              <div className="num text-xs text-slate-500">{team.record} · {team.conference}</div>
            </div>
            <div className="num ml-auto flex gap-6 text-sm">
              <span>Bid <b className="text-emerald-300">{(teamSeason.bidPct ?? 0).toFixed(1)}%</b></span>
              <span>Auto <b>{(teamSeason.autoBidPct ?? 0).toFixed(1)}%</b></span>
              <span>At-large <b>{(teamSeason.atLargePct ?? 0).toFixed(1)}%</b></span>
              <span>Avg seed <b>{teamSeason.avgSeed ? teamSeason.avgSeed.toFixed(1) : '—'}</b></span>
            </div>
          </div>
        )}

        {team && (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm sm:min-w-[700px]">
              <thead className="border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-2 py-2 text-left">Opponent</th>
                  <th className="hidden px-2 py-2 text-right sm:table-cell">Win %</th>
                  <th className="px-2 py-2 text-right">If win</th>
                  <th className="px-2 py-2 text-right">If loss</th>
                  <th className="px-2 py-2 text-right">Swing</th>
                </tr>
              </thead>
              <tbody>
                {teamRows.map((r) => {
                  const o = byId.get(r.oppId);
                  if (!o) return null;
                  return (
                    <tr key={r.gameId} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                      <td className="px-3 py-2">{fmtDay(r.date)}</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <span className="w-8 text-[11px] text-slate-500">{r.neutral ? 'N' : r.home ? 'vs' : '@'}</span>
                          <TeamBadge team={o} size={22} />
                          <span>{o.shortName}</span>
                        </div>
                      </td>
                      <td className="num hidden px-2 py-2 text-right sm:table-cell">{(r.winProb * 100).toFixed(0)}%</td>
                      <td className="px-2 py-2 text-right"><Pct v={r.bidIfWin} base={r.bidBase} /></td>
                      <td className="px-2 py-2 text-right"><Pct v={r.bidIfLoss} base={r.bidBase} /></td>
                      <td className="px-2 py-2 text-right"><Swing v={swingOf(r)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {teamRows.length === 0 && (
              <p className="py-8 text-center text-slate-500">No leverage data for this team: its bid chance is near 0% or 100%, or no game moves it by 0.3 points.</p>
            )}
          </div>
        )}
        <p className="text-[11px] leading-relaxed text-slate-600">
          How it's computed: the season is simulated 20,000 times, including conference tournaments (automatic bids) and
          an at-large selection score of rating plus a credit for wins above expectation. Each game's win and loss
          chances come from the same simulations. The swing also reflects what a result reveals about a team's true
          strength, so it runs larger than a "pretend it won" calculation. Selection is a simplified score, not the
          committee's NET and quadrant formula, so treat bubble numbers as indicators.
        </p>
      </section>
    </div>
  );
}
