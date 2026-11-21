import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ActiveTab, LeagueId, ScheduledGame, TeamMetrics, VenueType, WhatIfAdjustments } from './types/sports';
import {
  ensureLeague,
  findTeam,
  getConfig,
  getLeverage,
  getMeta,
  getSeason,
  getSlate,
  getTeams,
  isLoaded,
  topTwoTeams,
} from './data';
import { isCbb } from './data/leaguesConfig';
import { NEUTRAL_ADJUSTMENTS } from './engine/mathModel';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import SimulatorView from './components/simulator/SimulatorView';
import DailySlateView from './components/slate/DailySlateView';
import PowerRankingsView from './components/rankings/PowerRankingsView';
import TeamReportModal from './components/rankings/TeamReportModal';
import LeanBoardView from './components/leanboard/LeanBoardView';
import SeasonView from './components/season/SeasonView';
import LeverageView from './components/leverage/LeverageView';

interface AppState {
  league: LeagueId;
  tab: ActiveTab;
  teamAId: string;
  teamBId: string;
  venue: VenueType;
  adj: WhatIfAdjustments;
  vegasSpread: number | null;
  vegasTotal: number | null;
  runId: number;
  leverageTeamId: string | null;
}

const TABS: ActiveTab[] = ['SIMULATOR', 'SLATE', 'RANKINGS', 'LEAN_BOARD', 'SEASON', 'LEVERAGE'];
const VENUES: VenueType[] = ['TEAM_A_HOME', 'NEUTRAL', 'TEAM_B_HOME'];

function defaultsFor(league: LeagueId): Pick<AppState, 'teamAId' | 'teamBId'> {
  const [a, b] = topTwoTeams(league);
  return { teamAId: a.id, teamBId: b.id };
}

function num(v: string | null): number | null {
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Restore state from the query string so views are shareable and survive reloads. */
function readUrl(): AppState {
  const q = new URLSearchParams(window.location.search);
  const l = q.get('league');
  const league: LeagueId =
    l === 'NFL' || l === 'NCAAF' || l === 'NBA' || l === 'NCAAM' || l === 'NCAAW' ? l : 'NFL';
  const t = q.get('tab') as ActiveTab | null;
  const v = q.get('venue') as VenueType | null;
  // Team ids are validated against the league's data once it has loaded (see the effect in App).
  return {
    league,
    tab: t && TABS.includes(t) && (t !== 'LEVERAGE' || isCbb(league)) ? t : 'SIMULATOR',
    teamAId: q.get('a') ?? '',
    teamBId: q.get('b') ?? '',
    venue: v && VENUES.includes(v) ? v : 'TEAM_B_HOME',
    adj: NEUTRAL_ADJUSTMENTS,
    vegasSpread: num(q.get('spread')),
    vegasTotal: num(q.get('total')),
    runId: 1,
    leverageTeamId: null,
  };
}

export default function App() {
  const [s, setS] = useState<AppState>(readUrl);
  const [reportTeam, setReportTeam] = useState<TeamMetrics | null>(null);
  const [, setLoadTick] = useState(0); // bumps when a league's data finishes loading
  const [loadError, setLoadError] = useState<string | null>(null);

  const ready = isLoaded(s.league);
  const config = getConfig(s.league);
  const teams = useMemo(() => getTeams(s.league), [s.league, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const games = useMemo(() => getSlate(s.league), [s.league, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const season = useMemo(() => getSeason(s.league), [s.league, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const leverage = useMemo(() => getLeverage(s.league), [s.league, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const meta = getMeta(s.league);
  const teamA = findTeam(s.league, s.teamAId);
  const teamB = findTeam(s.league, s.teamBId);

  useEffect(() => {
    let alive = true;
    setLoadError(null);
    ensureLeague(s.league).then(
      () => alive && setLoadTick((n) => n + 1),
      (e: unknown) => alive && setLoadError(e instanceof Error ? e.message : 'Could not load data'),
    );
    return () => {
      alive = false;
    };
  }, [s.league]);

  // Once data is loaded, make sure the selected teams exist in this league (fresh load, bad URL, or league change).
  useEffect(() => {
    if (!ready) return;
    const okA = findTeam(s.league, s.teamAId);
    const okB = findTeam(s.league, s.teamBId);
    if (okA && okB && s.teamAId !== s.teamBId) return;
    const d = defaultsFor(s.league);
    const a = okA ? s.teamAId : d.teamAId;
    let b = okB ? s.teamBId : d.teamBId;
    if (b === a) b = d.teamBId === a ? d.teamAId : d.teamBId;
    setS((prev) => ({ ...prev, teamAId: a, teamBId: b }));
  }, [ready, s.league, s.teamAId, s.teamBId]);

  useEffect(() => {
    const q = new URLSearchParams();
    q.set('league', s.league);
    q.set('tab', s.tab);
    if (s.teamAId) q.set('a', s.teamAId);
    if (s.teamBId) q.set('b', s.teamBId);
    q.set('venue', s.venue);
    if (s.vegasSpread !== null) q.set('spread', String(s.vegasSpread));
    if (s.vegasTotal !== null) q.set('total', String(s.vegasTotal));
    window.history.replaceState(null, '', `?${q.toString()}`);
  }, [s.league, s.tab, s.teamAId, s.teamBId, s.venue, s.vegasSpread, s.vegasTotal]);

  const patch = useCallback((p: Partial<AppState>) => setS((prev) => ({ ...prev, ...p })), []);

  const changeLeague = (league: LeagueId) => {
    if (league === s.league) return;
    setReportTeam(null);
    patch({
      league,
      tab: s.tab === 'LEVERAGE' && !isCbb(league) ? 'SIMULATOR' : s.tab,
      leverageTeamId: null,
      teamAId: '',
      teamBId: '',
      venue: 'TEAM_B_HOME',
      adj: NEUTRAL_ADJUSTMENTS,
      vegasSpread: null,
      vegasTotal: null,
    });
  };

  /** Daily Slate / Lean Board -> Simulator: load both teams, venue and the sportsbook lines. */
  const simulateGame = (g: ScheduledGame) => {
    patch({
      tab: 'SIMULATOR',
      teamAId: g.awayTeamId,
      teamBId: g.homeTeamId,
      venue: g.neutralSite ? 'NEUTRAL' : 'TEAM_B_HOME',
      adj: NEUTRAL_ADJUSTMENTS,
      vegasSpread: g.vegasSpreadHome,
      vegasTotal: g.vegasTotal,
    });
    window.scrollTo({ top: 0 });
  };

  const setTeam = (which: 'A' | 'B', id: string) => {
    if (which === 'A') patch({ teamAId: id, vegasSpread: null, vegasTotal: null });
    else patch({ teamBId: id, vegasSpread: null, vegasTotal: null });
  };

  if (!ready || !teamA || !teamB || !meta) {
    return (
      <div className="min-h-screen">
        <Navbar league={s.league} tab={s.tab} teams={[]} onLeague={changeLeague} onTab={(tab) => patch({ tab })} onPickTeam={setReportTeam} />
        <main className="mx-auto max-w-7xl px-4 py-16 text-center text-slate-400">
          {loadError ? (
            <p>
              Couldn't load {s.league} data ({loadError}).{' '}
              <button className="underline" onClick={() => window.location.reload()}>
                Reload
              </button>
            </p>
          ) : (
            <p className="animate-pulse">Loading {s.league} data…</p>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar
        league={s.league}
        tab={s.tab}
        teams={teams}
        onLeague={changeLeague}
        onTab={(tab) => patch({ tab })}
        onPickTeam={setReportTeam}
      />
      <main className="mx-auto max-w-7xl px-4 py-6">
        {s.tab === 'SIMULATOR' && (
          <SimulatorView
            league={config}
            teams={teams}
            teamA={teamA}
            teamB={teamB}
            venue={s.venue}
            adj={s.adj}
            vegasSpread={s.vegasSpread}
            vegasTotal={s.vegasTotal}
            runId={s.runId}
            onTeamA={(id) => setTeam('A', id)}
            onTeamB={(id) => setTeam('B', id)}
            onSwap={() =>
              patch({
                teamAId: s.teamBId,
                teamBId: s.teamAId,
                venue: s.venue === 'TEAM_A_HOME' ? 'TEAM_B_HOME' : s.venue === 'TEAM_B_HOME' ? 'TEAM_A_HOME' : 'NEUTRAL',
                adj: {
                  teamAOffDelta: s.adj.teamBOffDelta,
                  teamADefDelta: s.adj.teamBDefDelta,
                  teamAPaceDelta: s.adj.teamBPaceDelta,
                  teamBOffDelta: s.adj.teamAOffDelta,
                  teamBDefDelta: s.adj.teamADefDelta,
                  teamBPaceDelta: s.adj.teamAPaceDelta,
                },
                // Spread is quoted from Team B's perspective, so flip it with the teams.
                vegasSpread: s.vegasSpread === null ? null : -s.vegasSpread,
              })
            }
            onVenue={(venue) => patch({ venue })}
            onAdj={(adj) => patch({ adj })}
            onSpread={(vegasSpread) => patch({ vegasSpread })}
            onTotal={(vegasTotal) => patch({ vegasTotal })}
            onRerun={() => setS((p) => ({ ...p, runId: p.runId + 1 }))}
          />
        )}
        {s.tab === 'SLATE' && <DailySlateView league={config} games={games} teams={teams} onSimulate={simulateGame} />}
        {s.tab === 'RANKINGS' && <PowerRankingsView league={config} teams={teams} onSelect={setReportTeam} />}
        {s.tab === 'LEAN_BOARD' && <LeanBoardView league={config} games={games} teams={teams} onSimulate={simulateGame} />}
        {s.tab === 'SEASON' && (
          <SeasonView
            league={config}
            teams={teams}
            season={season}
            iterations={meta.seasonIterations}
            onSelect={setReportTeam}
            onLeverage={(t) => patch({ tab: 'LEVERAGE', leverageTeamId: t.id })}
          />
        )}
        {s.tab === 'LEVERAGE' && isCbb(s.league) && (
          <LeverageView
            league={config}
            teams={teams}
            leverage={leverage}
            season={season}
            slate={games}
            initialTeamId={s.leverageTeamId}
            asOf={meta.asOf}
            onSimulate={simulateGame}
          />
        )}
      </main>
      <Footer meta={meta} />
      {reportTeam && <TeamReportModal team={reportTeam} allTeams={teams} onClose={() => setReportTeam(null)} />}
    </div>
  );
}
