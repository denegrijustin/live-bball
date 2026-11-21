import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowLeft, Play, Scale, TrendingDown, TrendingUp } from 'lucide-react';
import type { LeagueConfig, SeasonProjection, TeamDetail, TeamMetrics } from '../../types/sports';
import { isCbb } from '../../data/leaguesConfig';
import { computeTeamGrades } from '../../engine/gradingEngine';
import { fmtLine, fmtSigned } from '../../lib/format';
import { GradePill, Last5, percentileColor, SectionTitle, SparkBar, TeamBadge } from '../common/ui';

interface Props {
  league: LeagueConfig;
  team: TeamMetrics;
  allTeams: TeamMetrics[];
  detail: TeamDetail | null;
  season: SeasonProjection | undefined;
  onBack: () => void;
  onOpenTeam: (id: string) => void;
  onSimulate: (awayId: string, homeId: string, neutral: boolean, homeSpread: number | null) => void;
  onLeverage: (t: TeamMetrics) => void;
}

const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(iso));

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-lg bg-slate-950/60 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`num text-lg font-bold ${tone === 'good' ? 'text-emerald-300' : tone === 'bad' ? 'text-rose-300' : ''}`}>{value}</div>
    </div>
  );
}

export default function TeamDetailView({ league, team, allTeams, detail, season, onBack, onOpenTeam, onSimulate, onLeverage }: Props) {
  const byId = new Map(allTeams.map((t) => [t.id, t]));
  const grades = computeTeamGrades(team, allTeams);
  const powerRank = [...allTeams].sort((a, b) => b.powerRating - a.powerRating).findIndex((t) => t.id === team.id) + 1;
  const up = team.trendDelta >= 0;
  const cbb = isCbb(league.id);

  const oppLabel = (id: string | null, name: string) => {
    const o = id ? byId.get(id) : undefined;
    return o ? (
      <button onClick={() => onOpenTeam(o.id)} className="flex items-center gap-2 text-left hover:text-emerald-300">
        <TeamBadge team={o} size={22} />
        <span>{o.shortName}</span>
      </button>
    ) : (
      <span className="text-slate-400">{name}</span>
    );
  };

  const odds: [string, string][] = [];
  if (season) {
    odds.push(['Proj. record', `${season.avgWins.toFixed(1)}–${(season.wins + season.losses + season.gamesRemaining - season.avgWins).toFixed(1)}`]);
    if (cbb) {
      odds.push(['Tourney bid', `${(season.bidPct ?? 0).toFixed(1)}%`], ['Auto bid', `${(season.autoBidPct ?? 0).toFixed(1)}%`], ['At-large', `${(season.atLargePct ?? 0).toFixed(1)}%`]);
      if (season.avgSeed) odds.push(['Avg seed', season.avgSeed.toFixed(1)]);
    } else if (league.id === 'NFL') {
      odds.push(['Playoffs', `${season.playoffPct.toFixed(1)}%`], ['Division', `${season.divisionPct.toFixed(1)}%`], ['#1 seed', `${season.topSeedPct.toFixed(1)}%`]);
    } else if (league.id === 'NBA') {
      odds.push(['Playoffs', `${season.playoffPct.toFixed(1)}%`], ['Top 6', `${season.topSixPct.toFixed(1)}%`], ['Play-in', `${(season.playInPct ?? 0).toFixed(1)}%`], ['#1 seed', `${season.topSeedPct.toFixed(1)}%`]);
    } else {
      odds.push(['Conf title', `${(season.confChampPct ?? 0).toFixed(1)}%`], ['CFP field', `${season.cfpPct.toFixed(1)}%`], ['Bowl eligible', `${season.bowlPct.toFixed(1)}%`]);
    }
  }

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-400 hover:text-white">
        <ArrowLeft size={14} /> Back to rankings
      </button>

      {/* Header */}
      <section className="card overflow-hidden" style={{ background: `linear-gradient(135deg, ${team.primaryColor}33, transparent 60%)` }}>
        <div className="flex flex-wrap items-center gap-3 p-4 sm:gap-4 sm:p-5">
          <TeamBadge team={team} size={64} />
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-extrabold sm:text-2xl">{team.name}</h2>
            <div className="num text-sm text-slate-400">
              {team.record} · {team.division ?? team.conference}
              {team.division && league.id !== 'NFL' ? ` · ${team.conference}` : ''}
            </div>
            <div className="mt-2 flex items-center gap-4">
              <Last5 results={team.last5} />
              <span className={`num flex items-center gap-1 text-xs font-semibold ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
                {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                {fmtSigned(team.trendDelta)} in 14 days
              </span>
            </div>
          </div>
          <div className="num grid w-full grid-cols-3 gap-2 text-center sm:w-auto">
            <Stat label="Power" value={team.powerRating.toFixed(1)} />
            <Stat label="Rank" value={`#${powerRank}`} />
            <Stat label="Net" value={fmtSigned(team.offRating - team.defRating)} tone={team.offRating - team.defRating >= 0 ? 'good' : 'bad'} />
          </div>
        </div>
      </section>

      {/* Season outlook */}
      {odds.length > 0 && (
        <section className="card p-4">
          <SectionTitle
            right={
              cbb && (
                <button onClick={() => onLeverage(team)} className="flex items-center gap-1 text-xs font-semibold text-emerald-300 hover:text-emerald-200">
                  <Scale size={13} /> See how each game moves the bid
                </button>
              )
            }
          >
            Season outlook
          </SectionTitle>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            {odds.map(([k, v]) => (
              <Stat key={k} label={k} value={v} />
            ))}
          </div>
        </section>
      )}

      {/* Rating history */}
      <section className="card p-4">
        <SectionTitle>Rating history</SectionTitle>
        {detail && detail.history.length >= 2 ? (
          <>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={detail.history} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                  <CartesianGrid stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} stroke="#334155" tickFormatter={(v: string) => v.slice(5, 10)} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} stroke="#334155" />
                  <Tooltip
                    content={({ payload }) => {
                      const p = payload?.[0]?.payload as TeamDetail['history'][number] | undefined;
                      if (!p) return null;
                      return (
                        <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl">
                          <div className="font-semibold">{fmtDay(p.date)}</div>
                          <div className="num text-slate-400">Power {p.power.toFixed(1)} · rank #{p.rank}</div>
                        </div>
                      );
                    }}
                  />
                  <Line type="monotone" dataKey="power" stroke={team.primaryColor === '#000000' ? '#10b981' : '#10b981'} strokeWidth={2.5} dot={{ r: 3, fill: '#10b981' }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 text-[11px] text-slate-600">
              Weekly snapshots of the rating using only games played up to each date. The first point is the preseason
              rating from last season's results.
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-500">{detail ? 'Not enough history yet.' : 'Loading…'}</p>
        )}
      </section>

      {/* Grades */}
      <section>
        <SectionTitle>Grades vs the league</SectionTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {grades.map((g) => (
            <div key={g.key} className="card p-3">
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{g.label}</div>
                  <div className="num mt-0.5 text-lg font-bold">{g.displayValue}</div>
                </div>
                <GradePill grade={g.grade} />
              </div>
              <SparkBar percentile={g.percentile} color={percentileColor(g.percentile)} />
              <div className="num mt-1 flex justify-between text-[11px] text-slate-500">
                <span>{g.percentile.toFixed(0)}th</span>
                <span>#{g.rank}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upcoming */}
        <section className="card overflow-x-auto">
          <div className="px-4 pt-4"><SectionTitle>Upcoming games</SectionTitle></div>
          {detail && detail.upcoming.length > 0 ? (
            <table className="w-full text-sm sm:min-w-[420px]">
              <thead className="border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left sm:px-4">Date</th>
                  <th className="px-2 py-2 text-left">Opponent</th>
                  <th className="px-2 py-2 text-right">Win %</th>
                  <th className="px-2 py-2 text-right">Line</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {detail.upcoming.map((g, i) => {
                  const o = byId.get(g.oppId);
                  return (
                    <tr key={i} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                      <td className="px-4 py-2">{fmtDay(g.date)}</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 text-[11px] text-slate-500">{g.neutral ? 'N' : g.home ? 'vs' : '@'}</span>
                          {oppLabel(g.oppId, '')}
                        </div>
                      </td>
                      <td className={`num px-2 py-2 text-right font-semibold ${g.winProb >= 0.5 ? 'text-emerald-300' : 'text-rose-300'}`}>{(g.winProb * 100).toFixed(0)}%</td>
                      <td className="num px-2 py-2 text-right text-slate-400">{g.line === null ? '—' : fmtLine(g.line)}</td>
                      <td className="px-2 py-2 text-right">
                        {o && (
                          <button
                            title="Open in the simulator"
                            onClick={() => {
                              const awayId = g.home ? o.id : team.id;
                              const homeId = g.home ? team.id : o.id;
                              const homeSpread = g.line === null ? null : g.home ? g.line : -g.line;
                              onSimulate(awayId, homeId, g.neutral, homeSpread);
                            }}
                            className="rounded-md bg-emerald-500 p-1 text-slate-950 hover:bg-emerald-400"
                          >
                            <Play size={11} fill="currentColor" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="px-4 pb-4 text-sm text-slate-500">{detail ? 'No scheduled games with a rated opponent.' : 'Loading…'}</p>
          )}
        </section>

        {/* Game log */}
        <section className="card overflow-x-auto">
          <div className="px-4 pt-4"><SectionTitle>Game log</SectionTitle></div>
          {detail && detail.log.length > 0 ? (
            <table className="w-full text-sm sm:min-w-[460px]">
              <thead className="border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-2 py-2 text-left">Opponent</th>
                  <th className="px-2 py-2 text-right">Result</th>
                  <th className="px-2 py-2 text-right" title="Model win probability from the ratings in force before the game">Pre-game</th>
                </tr>
              </thead>
              <tbody>
                {[...detail.log].reverse().map((g, i) => {
                  const won = g.pts > g.oppPts;
                  const upset = g.winProb !== null && ((won && g.winProb <= 0.35) || (!won && g.winProb >= 0.65));
                  return (
                    <tr key={i} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                      <td className="px-4 py-2">{fmtDay(g.date)}</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 text-[11px] text-slate-500">{g.neutral ? 'N' : g.home ? 'vs' : '@'}</span>
                          {oppLabel(g.oppId, g.oppName)}
                        </div>
                      </td>
                      <td className="num px-2 py-2 text-right">
                        <span className={`mr-1 rounded px-1.5 py-0.5 text-[11px] font-bold ${won ? 'bg-emerald-500/20 text-emerald-300' : g.pts === g.oppPts ? 'bg-slate-700 text-slate-300' : 'bg-rose-500/20 text-rose-300'}`}>
                          {won ? 'W' : g.pts === g.oppPts ? 'T' : 'L'}
                        </span>
                        {g.pts}–{g.oppPts}
                      </td>
                      <td className="num px-2 py-2 text-right text-slate-400">
                        {g.winProb === null ? '—' : `${(g.winProb * 100).toFixed(0)}%`}
                        {upset && <span className="ml-1 rounded bg-amber-500/15 px-1 text-[10px] font-bold text-amber-300">upset</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="px-4 pb-4 text-sm text-slate-500">{detail ? 'No games played yet.' : 'Loading…'}</p>
          )}
        </section>
      </div>
    </div>
  );
}
