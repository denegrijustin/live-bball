import { useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import type { LeagueConfig, LeanRow, ScheduledGame, TeamMetrics } from '../../types/sports';
import { evaluateGame } from '../../engine/edgeCalculator';
import { fmtLine, fmtMoney, fmtPct } from '../../lib/format';
import { TeamBadge } from '../common/ui';

interface Props {
  league: LeagueConfig;
  games: ScheduledGame[];
  teams: TeamMetrics[];
  onSimulate: (g: ScheduledGame) => void;
}

type Sort = 'SPREAD_EDGE' | 'TOTAL_EDGE' | 'EV';

function edgeTone(e: number): string {
  if (e >= 4) return 'text-emerald-300 bg-emerald-500/20';
  if (e >= 2) return 'text-lime-300 bg-lime-500/15';
  if (e >= 1) return 'text-amber-300 bg-amber-500/10';
  return 'text-slate-400 bg-slate-800';
}

export default function LeanBoardView({ league, games, teams, onSimulate }: Props) {
  const [sort, setSort] = useState<Sort>('SPREAD_EDGE');
  const [minEdge, setMinEdge] = useState(0);

  const rows = useMemo<LeanRow[]>(
    () =>
      games.flatMap((g) => {
        const away = teams.find((t) => t.id === g.awayTeamId);
        const home = teams.find((t) => t.id === g.homeTeamId);
        if (!away || !home || (g.vegasSpreadHome === null && g.vegasTotal === null)) return [];
        return [evaluateGame(g, away, home, league)];
      }),
    [games, teams, league],
  );

  const sorted = useMemo(() => {
    const list = rows.filter((r) => Math.max(r.hasSpread ? r.spreadEdge : 0, r.hasTotal ? r.totalEdge : 0) >= minEdge);
    const key = (r: LeanRow) =>
      sort === 'SPREAD_EDGE'
        ? (r.hasSpread ? r.spreadEdge : -1)
        : sort === 'TOTAL_EDGE'
          ? (r.hasTotal ? r.totalEdge : -1)
          : Math.max(r.hasSpread ? r.spreadEv : -1e9, r.hasTotal ? r.totalEv : -1e9);
    return list.sort((a, b) => key(b) - key(a));
  }, [rows, sort, minEdge]);

  const tab = (s: Sort, label: string) => (
    <button
      onClick={() => setSort(s)}
      className={`rounded-md px-3 py-1 text-xs font-semibold ${
        sort === s ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-slate-100'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-2 text-lg font-extrabold">{league.name} Lean Board</h2>
        <div className="flex rounded-lg border border-slate-800 bg-slate-900 p-0.5">
          {tab('SPREAD_EDGE', 'Spread edge')}
          {tab('TOTAL_EDGE', 'Total edge')}
          {tab('EV', 'Best EV')}
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          Min edge
          <input
            type="range"
            min={0}
            max={6}
            step={0.5}
            value={minEdge}
            onChange={(e) => setMinEdge(Number(e.target.value))}
            className="accent-emerald-500"
          />
          <span className="num w-8 font-semibold text-slate-200">{minEdge.toFixed(1)}</span>
        </label>
      </div>

      {/* Phones: one card per game so the pick and edge are visible without sideways scrolling */}
      <div className="space-y-3 md:hidden">
        {sorted.map((r) => {
          const pick = r.spreadPick === 'HOME' ? r.home : r.away;
          return (
            <article key={r.game.id} className="card p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <TeamBadge team={r.away} size={30} />
                  <span className="text-xs text-slate-500">@</span>
                  <TeamBadge team={r.home} size={30} />
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{r.away.abbreviation} @ {r.home.abbreviation}</div>
                    <div className="truncate text-[11px] text-slate-500">{r.game.startTime}</div>
                  </div>
                </div>
                <button
                  onClick={() => onSimulate(r.game)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-500 px-3 py-2 text-xs font-bold text-slate-950"
                >
                  <Play size={11} fill="currentColor" /> Simulate
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-slate-950/60 p-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Spread</div>
                  {r.hasSpread ? (
                    <>
                      <div className={`font-semibold ${r.spreadEdge >= 2 ? 'text-emerald-300' : ''}`}>{pick.abbreviation} {fmtLine(r.spreadPickLine)}</div>
                      <div className="num text-[11px] text-slate-500">edge {r.spreadEdge.toFixed(1)} · model {fmtLine(r.modelSpreadHome)}</div>
                      <div className="num text-[11px] text-slate-500">{fmtPct(r.spreadCoverProb)} · EV {fmtMoney(r.spreadEv)}</div>
                    </>
                  ) : (
                    <div className="text-sm text-slate-600">No line posted</div>
                  )}
                </div>
                <div className="rounded-lg bg-slate-950/60 p-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total</div>
                  {r.hasTotal ? (
                    <>
                      <div className={`font-semibold ${r.totalEdge >= 2 ? 'text-emerald-300' : ''}`}>{r.totalPick === 'OVER' ? 'Over' : 'Under'} {r.vegasTotal}</div>
                      <div className="num text-[11px] text-slate-500">edge {r.totalEdge.toFixed(1)} · model {r.modelTotal.toFixed(1)}</div>
                      <div className="num text-[11px] text-slate-500">{fmtPct(r.totalProb)} · EV {fmtMoney(r.totalEv)}</div>
                    </>
                  ) : (
                    <div className="text-sm text-slate-600">No total</div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
        {sorted.length === 0 && (
          <p className="py-8 text-center text-slate-500">
            {rows.length === 0 ? 'No sportsbook lines are posted yet for this slate.' : 'No games clear the minimum edge.'}
          </p>
        )}
      </div>

      <div className="card hidden overflow-x-auto md:block">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Game</th>
              <th className="px-2 py-2 text-right">Model</th>
              <th className="px-2 py-2 text-right">Vegas</th>
              <th className="px-2 py-2 text-right">Edge</th>
              <th className="px-2 py-2 text-left">Spread lean</th>
              <th className="px-2 py-2 text-right">Mdl Tot</th>
              <th className="px-2 py-2 text-right">Vegas Tot</th>
              <th className="px-2 py-2 text-right">Edge</th>
              <th className="px-2 py-2 text-left">Total lean</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const pick = r.spreadPick === 'HOME' ? r.home : r.away;
              const hot = r.spreadEdge >= 2;
              return (
                <tr key={r.game.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <TeamBadge team={r.away} size={26} />
                      <span className="text-xs text-slate-500">@</span>
                      <TeamBadge team={r.home} size={26} />
                      <div className="ml-1">
                        <div className="font-semibold">
                          {r.away.abbreviation} @ {r.home.abbreviation}
                        </div>
                        <div className="text-[11px] text-slate-500">{r.game.startTime}</div>
                      </div>
                    </div>
                  </td>
                  <td className="num px-2 py-2 text-right">
                    {r.home.abbreviation} {fmtLine(r.modelSpreadHome)}
                  </td>
                  <td className="num px-2 py-2 text-right">
                    {r.hasSpread ? `${r.home.abbreviation} ${fmtLine(r.vegasSpreadHome)}` : '—'}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {r.hasSpread ? (
                      <span className={`num rounded px-2 py-0.5 font-bold ${edgeTone(r.spreadEdge)}`}>
                        {r.spreadEdge.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {r.hasSpread ? (
                      <>
                        <div className={`font-semibold ${hot ? 'text-emerald-300' : ''}`}>
                          {pick.abbreviation} {fmtLine(r.spreadPickLine)}
                        </div>
                        <div className="num text-[11px] text-slate-500">
                          {fmtPct(r.spreadCoverProb)} · EV {fmtMoney(r.spreadEv)}
                        </div>
                      </>
                    ) : (
                      <span className="text-slate-600">No spread</span>
                    )}
                  </td>
                  <td className="num px-2 py-2 text-right">{r.modelTotal.toFixed(1)}</td>
                  <td className="num px-2 py-2 text-right">{r.hasTotal ? r.vegasTotal : '—'}</td>
                  <td className="px-2 py-2 text-right">
                    {r.hasTotal ? (
                      <span className={`num rounded px-2 py-0.5 font-bold ${edgeTone(r.totalEdge)}`}>
                        {r.totalEdge.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {r.hasTotal ? (
                      <>
                        <div className="font-semibold">
                          {r.totalPick === 'OVER' ? 'Over' : 'Under'} {r.vegasTotal}
                        </div>
                        <div className="num text-[11px] text-slate-500">
                          {fmtPct(r.totalProb)} · EV {fmtMoney(r.totalEv)}
                        </div>
                      </>
                    ) : (
                      <span className="text-slate-600">No total</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      onClick={() => onSimulate(r.game)}
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-500 px-2.5 py-1 text-xs font-bold text-slate-950 hover:bg-emerald-400"
                    >
                      <Play size={11} fill="currentColor" /> Simulate Matchup
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <p className="py-8 text-center text-slate-500">
            {rows.length === 0
              ? 'No sportsbook lines are posted yet for this slate. Lines usually appear closer to game day.'
              : 'No games clear the minimum edge.'}
          </p>
        )}
      </div>
      <p className="text-[11px] text-slate-600">
        Edge = how many points the model line differs from the market on the recommended side. EV is expected profit per
        $100 risked at −110 using Monte Carlo cover/over rates.
      </p>
    </div>
  );
}
