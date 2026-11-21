/**
 * Forward tracking of the model's real, out-of-sample predictions.
 *
 * Every data refresh stores a prediction for each upcoming game (locked once the game has started), and the next refresh
 * grades the ones that finished. Only daily totals are kept, so the file stays small however long it runs.
 */
import type { TrackingSummary } from '../../src/types/sports';

export interface Prediction {
  key: string; // `${homeId}|${awayId}|${YYYY-MM-DD}` (UTC date of the scheduled start)
  date: string; // scheduled start (ISO)
  home: string;
  away: string;
  pHome: number; // model probability the home team wins
  margin: number; // model expected margin, home minus away
  spread: number | null; // market home spread at prediction time (negative = home favoured)
  total: number | null;
  modelTotal: number;
}

export interface DayBucket {
  d: string; // YYYY-MM-DD (UTC) of the result
  n: number;
  correct: number;
  brier: number; // sum
  logloss: number; // sum
  absErr: number; // sum of |actual margin - model margin|
  mkN: number; // games that also had a market line
  mkModelErr: number; // sum of model abs error on those games
  mkMarketErr: number; // sum of market abs error on those games
  atsN: number; // model-vs-market picks with at least a 1-point edge (pushes excluded)
  atsW: number;
}

export interface CalBin {
  n: number;
  sumP: number;
  homeWins: number;
}

export interface TrackingFile {
  league: string;
  firstPredictionAt: string | null;
  pending: Prediction[];
  days: DayBucket[];
  calibration: CalBin[]; // 10 bins of predicted home win probability
}

export const CAL_BINS = 10;

export function emptyTracking(league: string): TrackingFile {
  return {
    league,
    firstPredictionAt: null,
    pending: [],
    days: [],
    calibration: Array.from({ length: CAL_BINS }, () => ({ n: 0, sumP: 0, homeWins: 0 })),
  };
}

export type ResultRow = [string, string, string, number, number, number, number?]; // date, home, away, hs, as, neutral, conf

const DAY = 86400000;
const dayOf = (iso: string) => iso.slice(0, 10);

/**
 * Grades every pending prediction that now has a final score. Predictions older than `staleDays` with no result
 * (postponed or cancelled) are dropped. Returns a new file; the input is not mutated.
 */
export function gradePending(file: TrackingFile, results: ResultRow[], nowMs: number, staleDays = 10): { file: TrackingFile; graded: number } {
  const byPair = new Map<string, ResultRow[]>();
  for (const r of results) {
    const k = `${r[1]}|${r[2]}`;
    if (!byPair.has(k)) byPair.set(k, []);
    byPair.get(k)!.push(r);
  }
  const days = new Map(file.days.map((d) => [d.d, { ...d }]));
  const calibration = file.calibration.map((c) => ({ ...c }));
  const pending: Prediction[] = [];
  let graded = 0;

  for (const p of file.pending) {
    const start = Date.parse(p.date);
    const hit = (byPair.get(`${p.home}|${p.away}`) ?? []).find((r) => Math.abs(Date.parse(r[0]) - start) < 1.5 * DAY);
    if (!hit) {
      if (nowMs - start < staleDays * DAY) pending.push(p);
      continue;
    }
    const [date, , , hs, as] = hit;
    const homeWon = hs > as ? 1 : hs < as ? 0 : 0.5;
    const pc = Math.min(0.995, Math.max(0.005, p.pHome));
    const margin = hs - as;
    const d = dayOf(date);
    const b = days.get(d) ?? { d, n: 0, correct: 0, brier: 0, logloss: 0, absErr: 0, mkN: 0, mkModelErr: 0, mkMarketErr: 0, atsN: 0, atsW: 0 };
    b.n += 1;
    b.correct += (p.pHome > 0.5) === (homeWon === 1) ? 1 : 0;
    b.brier += (p.pHome - homeWon) ** 2;
    b.logloss += -(homeWon * Math.log(pc) + (1 - homeWon) * Math.log(1 - pc));
    b.absErr += Math.abs(margin - p.margin);
    if (p.spread !== null) {
      const marketMargin = -p.spread;
      b.mkN += 1;
      b.mkModelErr += Math.abs(margin - p.margin);
      b.mkMarketErr += Math.abs(margin - marketMargin);
      const edge = p.margin - marketMargin; // > 0: model likes the home side more than the market
      if (Math.abs(edge) >= 1) {
        const homeCover = margin + p.spread; // > 0: home covered
        if (homeCover !== 0) {
          b.atsN += 1;
          if ((edge > 0 && homeCover > 0) || (edge < 0 && homeCover < 0)) b.atsW += 1;
        }
      }
    }
    days.set(d, b);
    const bin = Math.min(CAL_BINS - 1, Math.floor(p.pHome * CAL_BINS));
    calibration[bin].n += 1;
    calibration[bin].sumP += p.pHome;
    calibration[bin].homeWins += homeWon;
    graded++;
  }

  return {
    graded,
    file: {
      ...file,
      pending,
      calibration,
      days: [...days.values()].sort((a, b) => a.d.localeCompare(b.d)),
    },
  };
}

/**
 * Adds or refreshes predictions for upcoming games. A game that has not started yet gets the newest prediction;
 * once it has started, the existing prediction is frozen (a game with no earlier prediction is not added, so nothing
 * is ever predicted after the fact).
 */
export function refreshPending(file: TrackingFile, fresh: Prediction[], nowMs: number): TrackingFile {
  const map = new Map(file.pending.map((p) => [p.key, p]));
  let first = file.firstPredictionAt;
  for (const p of fresh) {
    const started = Date.parse(p.date) <= nowMs;
    if (started) continue;
    if (!map.has(p.key) && first === null) first = new Date(nowMs).toISOString();
    map.set(p.key, p);
  }
  return { ...file, firstPredictionAt: first, pending: [...map.values()].sort((a, b) => a.date.localeCompare(b.date)) };
}

export interface BacktestEntry {
  ranAt: string;
  league: string;
  games: number; // current-season games available
  predictions: number;
  carry: number;
  accuracy: number;
  brier: number;
  logloss: number;
  mae: number;
  bestCarry: number;
}

/** Collapses the daily buckets into totals, a cumulative series and calibration for the UI. */
export function summarize(file: TrackingFile, backtest: BacktestEntry | null): TrackingSummary {
  const total = file.days.reduce(
    (a, d) => ({
      n: a.n + d.n,
      correct: a.correct + d.correct,
      brier: a.brier + d.brier,
      logloss: a.logloss + d.logloss,
      absErr: a.absErr + d.absErr,
      mkN: a.mkN + d.mkN,
      mkModelErr: a.mkModelErr + d.mkModelErr,
      mkMarketErr: a.mkMarketErr + d.mkMarketErr,
      atsN: a.atsN + d.atsN,
      atsW: a.atsW + d.atsW,
    }),
    { n: 0, correct: 0, brier: 0, logloss: 0, absErr: 0, mkN: 0, mkModelErr: 0, mkMarketErr: 0, atsN: 0, atsW: 0 },
  );
  const r = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;
  let cn = 0;
  let cc = 0;
  let cb = 0;
  const series = file.days.map((d) => {
    cn += d.n;
    cc += d.correct;
    cb += d.brier;
    return { d: d.d, n: cn, accuracy: r(cc / cn), brier: r(cb / cn) };
  });
  return {
    since: file.firstPredictionAt,
    pendingGames: file.pending.length,
    n: total.n,
    accuracy: total.n ? r(total.correct / total.n) : null,
    brier: total.n ? r(total.brier / total.n) : null,
    logloss: total.n ? r(total.logloss / total.n) : null,
    mae: total.n ? r(total.absErr / total.n, 2) : null,
    market: total.mkN
      ? {
          n: total.mkN,
          modelMae: r(total.mkModelErr / total.mkN, 2),
          marketMae: r(total.mkMarketErr / total.mkN, 2),
          atsN: total.atsN,
          atsWins: total.atsW,
        }
      : null,
    series,
    calibration: file.calibration.map((c, i) => ({
      lo: i / CAL_BINS,
      hi: (i + 1) / CAL_BINS,
      n: c.n,
      predicted: c.n ? r(c.sumP / c.n) : null,
      actual: c.n ? r(c.homeWins / c.n) : null,
    })),
    backtest: backtest
      ? {
          ranAt: backtest.ranAt,
          predictions: backtest.predictions,
          carry: backtest.carry,
          accuracy: backtest.accuracy,
          brier: backtest.brier,
          logloss: backtest.logloss,
          mae: backtest.mae,
        }
      : null,
  };
}
