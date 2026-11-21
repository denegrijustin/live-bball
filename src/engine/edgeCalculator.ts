import type { LeagueConfig, LeanRow, ScheduledGame, TeamMetrics } from '../types/sports';
import { americanToProb, NEUTRAL_ADJUSTMENTS, projectMatchup } from './mathModel';
import { hashString, runMonteCarlo } from './monteCarlo';

export const STANDARD_JUICE = -110;

/** Expected profit in dollars per $100 risked at the given American odds. Pushes refund the stake. */
export function expectedValue(winProb: number, loseProb: number, odds: number = STANDARD_JUICE): number {
  const payout = odds < 0 ? (100 / -odds) * 100 : odds;
  return winProb * payout - loseProb * 100;
}

export function breakEvenProb(odds: number = STANDARD_JUICE): number {
  return americanToProb(odds);
}

export function evaluateGame(
  game: ScheduledGame,
  away: TeamMetrics,
  home: TeamMetrics,
  league: LeagueConfig,
): LeanRow {
  const venue = game.neutralSite ? 'NEUTRAL' : 'TEAM_B_HOME';
  const model = projectMatchup(away, home, venue, NEUTRAL_ADJUSTMENTS, league);
  const mc = runMonteCarlo(model, league, {
    vegasSpreadTeamB: game.vegasSpreadHome,
    vegasTotal: game.vegasTotal,
    seed: hashString(game.id),
  });

  const modelSpreadHome = model.projectedSpreadTeamB;
  // Positive means the model likes the home side more than the market does.
  const rawSpreadEdge = game.vegasSpreadHome - modelSpreadHome;
  const spreadPick = rawSpreadEdge >= 0 ? 'HOME' : 'AWAY';
  const spreadCoverProb = spreadPick === 'HOME' ? mc.teamBCoverProb : mc.teamACoverProb;
  const spreadLoseProb = spreadPick === 'HOME' ? mc.teamACoverProb : mc.teamBCoverProb;
  const spreadPickLine = spreadPick === 'HOME' ? game.vegasSpreadHome : -game.vegasSpreadHome;

  const rawTotalEdge = model.projectedTotal - game.vegasTotal;
  const totalPick = rawTotalEdge >= 0 ? 'OVER' : 'UNDER';
  const totalProb = totalPick === 'OVER' ? mc.overProb : mc.underProb;
  const totalLose = totalPick === 'OVER' ? mc.underProb : mc.overProb;

  return {
    game,
    away,
    home,
    model,
    modelSpreadHome,
    vegasSpreadHome: game.vegasSpreadHome,
    spreadEdge: Math.abs(rawSpreadEdge),
    spreadPick,
    spreadPickLine,
    spreadCoverProb,
    spreadEv: expectedValue(spreadCoverProb / 100, spreadLoseProb / 100),
    modelTotal: model.projectedTotal,
    vegasTotal: game.vegasTotal,
    totalEdge: Math.abs(rawTotalEdge),
    totalPick,
    totalProb,
    totalEv: expectedValue(totalProb / 100, totalLose / 100),
  };
}
