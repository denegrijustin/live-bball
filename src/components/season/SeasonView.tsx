import { useMemo, useState } from 'react';
import type { LeagueConfig, SeasonProjection, TeamMetrics } from '../../types/sports';
import { isCbb } from '../../data/leaguesConfig';
import { TeamBadge } from '../common/ui';

interface Props {
  league: LeagueConfig;
  teams: TeamMetrics[];
  season: SeasonProjection[];
  iterations: number;
  onSelect: (t: TeamMetrics) => void;
  /** College basketball: open the leverage view for a team. */
  onLeverage?: (t: TeamMetrics) => void;
}

interface Col {
  key: keyof SeasonProjection;
  label: string;
  title: string;
}

function columnsFor(league: LeagueConfig['id']): Col[] {
  if (league === 'NFL')
    return [
      { key: 'playoffPct', label: 'Playoffs', title: 'Makes the 7-team conference bracket' },
      { key: 'divisionPct', label: 'Division', title: 'Wins the division' },
      { key: 'topSeedPct', label: '#1 Seed', title: 'Earns the conference #1 seed' },
    ];
  if (league === 'NBA')
    return [
      { key: 'playoffPct', label: 'Playoffs', title: 'Qualifies directly or through the play-in' },
      { key: 'topSixPct', label: 'Top 6', title: 'Finishes top six in the conference (no play-in)' },
      { key: 'playInPct', label: 'Play-In', title: 'Finishes 7th-10th and plays the play-in tournament' },
      { key: 'topSeedPct', label: '#1 Seed', title: 'Earns the conference #1 seed' },
    ];
  if (isCbb(league))
    return [
      { key: 'bidPct', label: 'Tourney Bid', title: 'Makes the 68-team NCAA tournament field' },
      { key: 'autoBidPct', label: 'Auto Bid', title: 'Wins its conference tournament' },
      { key: 'atLargePct', label: 'At-Large', title: 'Selected at-large' },
    ];
  return [
    { key: 'confChampPct', label: 'Conf Title', title: 'Wins its conference (championship game where one is played)' },
    { key: 'cfpPct', label: 'CFP Field', title: 'Makes the 12-team playoff: five highest-ranked conference champions plus seven at-large' },
    { key: 'bowlPct', label: 'Bowl Eligible', title: 'Finishes with 6+ wins' },
  ];
}

function PctCell({ value }: { value: number }) {
  const hue = value >= 80 ? '#10b981' : value >= 40 ? '#84cc16' : value >= 10 ? '#f59e0b' : '#64748b';
  return (
    <div className="ml-auto w-24">
      <div className="num text-right font-semibold" style={{ color: value > 0 ? undefined : '#475569' }}>
        {value >= 99.95 ? '100' : value < 0.05 ? '0' : value.toFixed(1)}%
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: hue }} />
      </div>
    </div>
  );
}

export default function SeasonView({ league, teams, season, iterations, onSelect, onLeverage }: Props) {
  const cbb = isCbb(league.id);
  const cols = columnsFor(league.id);
  const [sortKey, setSortKey] = useState<keyof SeasonProjection>(cols[0].key);
  const [conf, setConf] = useState('ALL');

  const byId = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const groups = useMemo(() => {
    const field = (t: TeamMetrics) => (league.id === 'NFL' ? t.conference : t.conference);
    return Array.from(new Set(teams.map(field))).sort();
  }, [teams, league.id]);

  const rows = useMemo(() => {
    const list = season.filter((p) => {
      const t = byId.get(p.teamId);
      return t && (conf === 'ALL' || t.conference === conf || t.division === conf);
    });
    return [...list].sort(
      (a, b) => ((b[sortKey] as number | undefined) ?? 0) - ((a[sortKey] as number | undefined) ?? 0) || b.avgWins - a.avgWins,
    );
  }, [season, byId, conf, sortKey]);

  const remaining = season.reduce((m, p) => Math.max(m, p.gamesRemaining), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-lg font-extrabold">{cbb ? `${league.name} NCAA Tournament Odds` : `${league.name} Season Odds`}</h2>
        <select
          value={conf}
          onChange={(e) => setConf(e.target.value)}
          aria-label="Group filter"
          className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
        >
          <option value="ALL">{league.id === 'NFL' ? 'All divisions' : 'All conferences'}</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <span className="num ml-auto text-xs text-slate-500">
          {iterations.toLocaleString()} simulations · up to {remaining} games left per team
        </span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Team</th>
              <th className="px-2 py-2 text-right">Record</th>
              <th className="px-2 py-2 text-right">Left</th>
              <th className="px-2 py-2 text-right">Proj. Record</th>
              {cols.map((c) => (
                <th key={c.key} className="px-2 py-2 text-right" title={c.title}>
                  <button
                    onClick={() => setSortKey(c.key)}
                    className={sortKey === c.key ? 'text-emerald-400' : 'hover:text-slate-300'}
                  >
                    {c.label}
                  </button>
                </th>
              ))}
              {cbb && <th className="px-2 py-2 text-right" title="Average seed line when in the field">Avg Seed</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const t = byId.get(p.teamId) as TeamMetrics;
              const games = p.wins + p.losses + p.gamesRemaining;
              return (
                <tr
                  key={p.teamId}
                  onClick={() => (cbb && onLeverage ? onLeverage(t) : onSelect(t))}
                  className="cursor-pointer border-b border-slate-800/60 hover:bg-slate-800/40"
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <TeamBadge team={t} size={28} />
                      <div>
                        <div className="font-semibold">{t.name}</div>
                        <div className="text-[11px] text-slate-500">{t.division ?? t.conference}</div>
                      </div>
                    </div>
                  </td>
                  <td className="num px-2 py-2 text-right">{t.record}</td>
                  <td className="num px-2 py-2 text-right text-slate-400">{p.gamesRemaining}</td>
                  <td className="num px-2 py-2 text-right font-semibold">
                    {p.avgWins.toFixed(1)}–{(games - p.avgWins).toFixed(1)}
                  </td>
                  {cols.map((c) => (
                    <td key={c.key} className="px-2 py-2">
                      <PctCell value={((p[c.key] as number | undefined) ?? 0)} />
                    </td>
                  ))}
                  {cbb && (
                    <td className="num px-2 py-2 text-right">{p.avgSeed ? p.avgSeed.toFixed(1) : '—'}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] leading-relaxed text-slate-600">
        Each remaining game is simulated from its analytic win probability (ratings, venue, home advantage).
        {league.id === 'NFL' &&
          ' The bracket takes the four division winners plus three wild cards per conference. Ties on wins are broken by head-to-head record, then division record (within a division), then conference record, then a coin flip; strength of victory and common-games tiebreakers are not modelled.'}
        {league.id === 'NBA' &&
          ' Top six per conference qualify directly; seeds 7–10 play the play-in (7v8 winner is the 7 seed; the 9v10 loser is out; the 7v8 loser hosts the 9v10 winner for the 8 seed). Ties on wins are broken by division winner, head-to-head, then conference record.'}
        {cbb &&
          ' Each team’s simulated season runs through conference tournaments (top 8 by conference record, single elimination) for automatic bids, then at-large spots go to the best selection scores (rating plus wins above expectation, with committee noise). Click a team to see how each remaining game moves its bid.'}
        {league.id === 'NCAAF' &&
          ' Conference titles use conference record with a championship game between the top two in conferences that play one; the 12-team CFP takes the five highest-ranked champions plus seven at-large, ranked by wins then rating with committee noise. Only games between FBS teams are simulated.'}
      </p>
    </div>
  );
}
