import { useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import type { LeagueConfig, TeamMetrics, VenueType, WhatIfAdjustments } from '../../types/sports';
import { projectMatchup, roundHalf } from '../../engine/mathModel';
import { hashString, runMonteCarlo } from '../../engine/monteCarlo';
import MatchupSelector from './MatchupSelector';
import WhatIfLab from './WhatIfLab';
import SimulationHero from './SimulationHero';
import LineEvaluator from './LineEvaluator';
import MarginHistogram from './MarginHistogram';
import TaleOfTheTape from './TaleOfTheTape';

interface Props {
  league: LeagueConfig;
  teams: TeamMetrics[];
  teamA: TeamMetrics;
  teamB: TeamMetrics;
  venue: VenueType;
  adj: WhatIfAdjustments;
  vegasSpread: number | null;
  vegasTotal: number | null;
  runId: number;
  onTeamA: (id: string) => void;
  onTeamB: (id: string) => void;
  onSwap: () => void;
  onVenue: (v: VenueType) => void;
  onAdj: (a: WhatIfAdjustments) => void;
  onSpread: (v: number | null) => void;
  onTotal: (v: number | null) => void;
  onRerun: () => void;
}

export default function SimulatorView(p: Props) {
  const { league, teamA, teamB, venue, adj } = p;

  const model = useMemo(() => projectMatchup(teamA, teamB, venue, adj, league), [teamA, teamB, venue, adj, league]);

  // Until the user supplies a line (or one is loaded from the slate), default to the model's own rounded line.
  const spread = p.vegasSpread ?? roundHalf(model.projectedSpreadTeamB);
  const total = p.vegasTotal ?? roundHalf(model.projectedTotal);

  const mc = useMemo(
    () =>
      runMonteCarlo(model, league, {
        vegasSpreadTeamB: spread,
        vegasTotal: total,
        seed: hashString(`${teamA.id}|${teamB.id}|${p.runId}`) ^ Math.imul(p.runId, 2654435761),
      }),
    [model, league, spread, total, teamA.id, teamB.id, p.runId],
  );

  return (
    <div className="space-y-4">
      <MatchupSelector
        teams={p.teams}
        teamA={teamA}
        teamB={teamB}
        venue={venue}
        onTeamA={p.onTeamA}
        onTeamB={p.onTeamB}
        onSwap={p.onSwap}
        onVenue={p.onVenue}
      />
      <SimulationHero league={league} teamA={teamA} teamB={teamB} model={model} mc={mc} />
      <div className="flex justify-end">
        <button
          onClick={p.onRerun}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold hover:border-emerald-500"
        >
          <RefreshCw size={13} /> Re-run 10,000 simulations
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <LineEvaluator
            teamA={teamA}
            teamB={teamB}
            model={model}
            mc={mc}
            spread={spread}
            total={total}
            isCustom={p.vegasSpread !== null || p.vegasTotal !== null}
            onSpread={p.onSpread}
            onTotal={p.onTotal}
            onResetLines={() => {
              p.onSpread(null);
              p.onTotal(null);
            }}
          />
          <MarginHistogram teamA={teamA} teamB={teamB} mc={mc} vegasSpreadB={spread} />
          <WhatIfLab league={league} teamA={teamA} teamB={teamB} adj={adj} onChange={p.onAdj} />
        </div>
        <div className="lg:col-span-2">
          <TaleOfTheTape teamA={teamA} teamB={teamB} allTeams={p.teams} />
        </div>
      </div>
    </div>
  );
}
