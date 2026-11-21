import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ActiveTab, LeagueId, ScheduledGame, TeamMetrics, VenueType, WhatIfAdjustments } from './types/sports';
import { findTeam, getConfig, getMeta, getSeason, getSlate, getTeams, topTwoTeams } from './data';
import { NEUTRAL_ADJUSTMENTS } from './engine/mathModel';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import SimulatorView from './components/simulator/SimulatorView';
import DailySlateView from './components/slate/DailySlateView';
import PowerRankingsView from './components/rankings/PowerRankingsView';
import TeamReportModal from './components/rankings/TeamReportModal';
import LeanBoardView from './components/leanboard/LeanBoardView';
import SeasonView from './components/season/SeasonView';

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
}

const TABS: ActiveTab[] = ['SIMULATOR', 'SLATE', 'RANKINGS', 'LEAN_BOARD', 'SEASON'];
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
  const league: LeagueId = l === 'NFL' || l === 'NCAAF' || l === 'NBA' ? l : 'NFL';
  const t = q.get('tab') as ActiveTab | null;
  const v = q.get('venue') as VenueType | null;
  const d = defaultsFor(league);
  const a = q.get('a');
  const b = q.get('b');
  const okA = a && findTeam(league, a);
  const okB = b && findTeam(league, b);
  const teamAId = okA ? (a as string) : d.teamAId;
  let teamBId = okB ? (b as string) : d.teamBId;
  if (teamBId === teamAId) teamBId = d.teamBId === teamAId ? d.teamAId : d.teamBId;
  return {
    league,
    tab: t && TABS.includes(t) ? t : 'SIMULATOR',
    teamAId,
    teamBId,
    venue: v && VENUES.includes(v) ? v : 'TEAM_B_HOME',
    adj: NEUTRAL_ADJUSTMENTS,
    vegasSpread: num(q.get('spread')),
    vegasTotal: num(q.get('total')),
    runId: 1,
  };
}

export default function App() {
  const [s, setS] = useState<AppState>(readUrl);
  const [reportTeam, setReportTeam] = useState<TeamMetrics | null>(null);

  const config = getConfig(s.league);
  const teams = useMemo(() => getTeams(s.league), [s.league]);
  const games = useMemo(() => getSlate(s.league), [s.league]);
  const season = useMemo(() => getSeason(s.league), [s.league]);
  const meta = getMeta(s.league);
  const teamA = findTeam(s.league, s.teamAId) ?? teams[0];
  const teamB = findTeam(s.league, s.teamBId) ?? teams[1];

  useEffect(() => {
    const q = new URLSearchParams();
    q.set('league', s.league);
    q.set('tab', s.tab);
    q.set('a', s.teamAId);
    q.set('b', s.teamBId);
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
      ...defaultsFor(league),
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
          <SeasonView league={config} teams={teams} season={season} iterations={meta.seasonIterations} onSelect={setReportTeam} />
        )}
      </main>
      <Footer meta={meta} />
      {reportTeam && <TeamReportModal team={reportTeam} allTeams={teams} onClose={() => setReportTeam(null)} />}
    </div>
  );
}
