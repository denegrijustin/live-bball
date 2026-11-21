import { useState } from 'react';
import { ChevronDown, Play } from 'lucide-react';
import type { LeanRow, TeamMetrics } from '../../types/sports';
import { rankOf, statValue, lowerIsBetter, type StatKey } from '../../engine/gradingEngine';
import { fmtLine, fmtPct } from '../../lib/format';
import { Last5, RankBadge, TeamBadge } from '../common/ui';

interface Props {
  row: LeanRow;
  allTeams: TeamMetrics[];
  onSimulate: () => void;
}

interface Cmp {
  label: string;
  stat: StatKey;
  digits: number;
}

const TOP10: Cmp[] = [
  { label: 'Power Rating', stat: 'powerRating', digits: 1 },
  { label: 'Offense', stat: 'offRating', digits: 1 },
  { label: 'Defense', stat: 'defRating', digits: 1 },
  { label: 'Net Efficiency', stat: 'net', digits: 1 },
  { label: 'Pace', stat: 'pace', digits: 1 },
  { label: 'Strength of Schedule', stat: 'sos', digits: 1 },
  { label: 'Consistency', stat: 'consistency', digits: 2 },
  { label: '14-Day Trend', stat: 'trendDelta', digits: 1 },
];

export default function GameSlateCard({ row, allTeams, onSimulate }: Props) {
  const [open, setOpen] = useState(false);
  const { game, away, home, model } = row;
  const favIsHome = model.teamBWinProb >= 0.5;
  const modelFav = favIsHome ? home : away;
  const n = allTeams.length;

  const teamRow = (t: TeamMetrics, prob: number, score: number, line: string) => (
    <div className="flex items-center gap-2 py-1.5 sm:gap-3">
      <TeamBadge team={t} size={34} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold"><span className="sm:hidden">{t.shortName}</span><span className="hidden sm:inline">{t.name}</span></div>
        <div className="flex items-center gap-2">
          <span className="num whitespace-nowrap text-xs text-slate-500">{t.record}</span>
          <span className="hidden sm:block"><Last5 results={t.last5} /></span>
        </div>
      </div>
      <div className="num w-10 text-right text-sm text-slate-400 sm:w-14">{fmtPct(prob * 100, 0)}</div>
      <div className="num w-12 text-right text-base font-bold sm:w-14 sm:text-lg">{score.toFixed(1)}</div>
      <div className="num w-12 text-right text-sm font-semibold text-amber-300 sm:w-14">{line}</div>
    </div>
  );

  return (
    <article className="card overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2 text-xs text-slate-400 sm:px-4">
        <span className="font-semibold">
          {game.startTime} · {game.weekOrDateLabel}
          {game.neutralSite && <span className="ml-2 rounded bg-sky-500/15 px-1.5 py-0.5 text-sky-300">Neutral</span>}
        </span>
        <div className="num flex gap-2 pr-1 sm:gap-6">
          <span className="w-10 text-right sm:w-14">Win</span>
          <span className="w-12 text-right sm:w-14">Proj</span>
          <span className="w-12 text-right sm:w-14">Line</span>
        </div>
      </div>
      <div className="px-3 py-2 sm:px-4">
        {teamRow(away, model.teamAWinProb, model.teamAProjectedScore, row.hasSpread ? fmtLine(-row.vegasSpreadHome) : '—')}
        {teamRow(home, model.teamBWinProb, model.teamBProjectedScore, row.hasSpread ? fmtLine(row.vegasSpreadHome) : '—')}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 bg-slate-950/40 px-4 py-2 text-xs">
        <div className="num flex flex-wrap gap-x-4 gap-y-1 text-slate-400">
          <span>
            Model: <b className="text-slate-200">{modelFav.abbreviation} {fmtLine(-Math.abs(model.projectedSpreadTeamB))}</b>
          </span>
          <span>
            Total: <b className="text-slate-200">{model.projectedTotal.toFixed(1)}</b> vs {row.hasTotal ? row.vegasTotal : 'no line'}
          </span>
          {row.hasSpread ? (
            <span className={row.spreadEdge >= 2 ? 'text-emerald-400' : ''}>
              Edge: {row.spreadPick === 'HOME' ? home.abbreviation : away.abbreviation} {row.spreadEdge.toFixed(1)}
            </span>
          ) : (
            <span className="text-slate-600">No line posted yet</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 font-semibold text-slate-300 hover:border-slate-500"
          >
            Top-10 Efficiency
            <ChevronDown size={13} className={`transition ${open ? 'rotate-180' : ''}`} />
          </button>
          <button
            onClick={onSimulate}
            className="flex items-center gap-1 rounded-md bg-emerald-500 px-2.5 py-1 font-bold text-slate-950 hover:bg-emerald-400"
          >
            <Play size={12} fill="currentColor" /> Simulate Matchup
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-slate-800 px-4 py-3">
          <div className="mb-1 grid grid-cols-[1fr_auto_1fr] gap-2 text-xs font-bold text-slate-300">
            <span>{away.abbreviation}</span>
            <span />
            <span className="text-right">{home.abbreviation}</span>
          </div>
          {TOP10.map((c) => {
            const a = statValue(away, c.stat);
            const h = statValue(home, c.stat);
            const aBetter = lowerIsBetter(c.stat) ? a < h : a > h;
            return (
              <div key={c.stat} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-1 text-sm">
                <div className="flex items-center gap-2">
                  <span className={`num font-semibold ${aBetter ? 'text-emerald-400' : 'text-slate-300'}`}>
                    {a.toFixed(c.digits)}
                  </span>
                  <RankBadge rank={rankOf(away, allTeams, c.stat)} total={n} />
                </div>
                <span className="text-[11px] uppercase tracking-wide text-slate-500">{c.label}</span>
                <div className="flex items-center justify-end gap-2">
                  <RankBadge rank={rankOf(home, allTeams, c.stat)} total={n} />
                  <span className={`num font-semibold ${!aBetter && a !== h ? 'text-emerald-400' : 'text-slate-300'}`}>
                    {h.toFixed(c.digits)}
                  </span>
                </div>
              </div>
            );
          })}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-1 text-sm">
            <span className="num font-semibold">{away.wins}-{away.losses}</span>
            <span className="text-[11px] uppercase tracking-wide text-slate-500">Record</span>
            <span className="num text-right font-semibold">{home.wins}-{home.losses}</span>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-1 text-sm">
            <span className="num font-semibold">{away.last5.filter((r) => r === 'W').length}-{away.last5.filter((r) => r === 'L').length}</span>
            <span className="text-[11px] uppercase tracking-wide text-slate-500">Last 5</span>
            <span className="num text-right font-semibold">{home.last5.filter((r) => r === 'W').length}-{home.last5.filter((r) => r === 'L').length}</span>
          </div>
        </div>
      )}
    </article>
  );
}
