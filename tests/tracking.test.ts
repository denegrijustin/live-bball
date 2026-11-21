import { describe, expect, it } from 'vitest';
import {
  emptyTracking,
  gradePending,
  refreshPending,
  summarize,
  type Prediction,
  type ResultRow,
} from '../scripts/lib/tracking';

const DAY = 86400000;
const T0 = Date.parse('2026-11-21T12:00:00Z');

const pred = (over: Partial<Prediction> = {}): Prediction => ({
  key: 'h1|a1|2026-11-22',
  date: '2026-11-22T18:00:00Z',
  home: 'h1',
  away: 'a1',
  pHome: 0.7,
  margin: 5,
  spread: -3,
  total: 45,
  modelTotal: 47,
  ...over,
});

describe('refreshPending', () => {
  it('adds predictions for games that have not started and records when tracking began', () => {
    const f = refreshPending(emptyTracking('NFL'), [pred()], T0);
    expect(f.pending).toHaveLength(1);
    expect(f.firstPredictionAt).toBe(new Date(T0).toISOString());
  });

  it('overwrites a prediction before kickoff but never changes it after the game has started', () => {
    let f = refreshPending(emptyTracking('NFL'), [pred({ pHome: 0.6 })], T0);
    f = refreshPending(f, [pred({ pHome: 0.8 })], T0 + 3600000); // still before kickoff
    expect(f.pending[0].pHome).toBe(0.8);
    const afterStart = Date.parse('2026-11-22T19:00:00Z');
    f = refreshPending(f, [pred({ pHome: 0.1 })], afterStart); // game underway: frozen
    expect(f.pending[0].pHome).toBe(0.8);
  });

  it('does not create a prediction for a game that has already started', () => {
    const f = refreshPending(emptyTracking('NFL'), [pred()], Date.parse('2026-11-22T19:00:00Z'));
    expect(f.pending).toHaveLength(0);
    expect(f.firstPredictionAt).toBeNull();
  });
});

describe('gradePending', () => {
  const base = refreshPending(emptyTracking('NFL'), [pred()], T0);

  it('grades a finished game and removes it from pending', () => {
    const results: ResultRow[] = [['2026-11-22T18:00Z', 'h1', 'a1', 27, 20, 0, 0]];
    const { file, graded } = gradePending(base, results, T0 + 2 * DAY);
    expect(graded).toBe(1);
    expect(file.pending).toHaveLength(0);
    const day = file.days[0];
    expect(day.d).toBe('2026-11-22');
    expect(day.n).toBe(1);
    expect(day.correct).toBe(1);
    expect(day.brier).toBeCloseTo((0.7 - 1) ** 2, 12);
    expect(day.logloss).toBeCloseTo(-Math.log(0.7), 12);
    expect(day.absErr).toBeCloseTo(Math.abs(7 - 5), 12); // actual margin 7 vs model 5
  });

  it('scores an upset as a miss with the right Brier and log loss', () => {
    const results: ResultRow[] = [['2026-11-22T18:00Z', 'h1', 'a1', 10, 24, 0]];
    const { file } = gradePending(base, results, T0 + 2 * DAY);
    expect(file.days[0].correct).toBe(0);
    expect(file.days[0].brier).toBeCloseTo(0.49, 12);
    expect(file.days[0].logloss).toBeCloseTo(-Math.log(0.3), 12);
  });

  it('compares the model with the market line and counts against-the-spread picks', () => {
    // Market: home -3 (expects home by 3). Model expects home by 5 => edge +2 toward home.
    // Actual margin 7 => home covers (7 - 3 > 0). Model error 2, market error 4.
    const { file } = gradePending(base, [['2026-11-22T18:00Z', 'h1', 'a1', 27, 20, 0]], T0 + 2 * DAY);
    const d = file.days[0];
    expect(d.mkN).toBe(1);
    expect(d.mkModelErr).toBeCloseTo(2, 12);
    expect(d.mkMarketErr).toBeCloseTo(4, 12);
    expect(d.atsN).toBe(1);
    expect(d.atsW).toBe(1);
  });

  it('does not count a push or a sub-point edge as an ATS pick', () => {
    const push = gradePending(base, [['2026-11-22T18:00Z', 'h1', 'a1', 23, 20, 0]], T0 + 2 * DAY).file.days[0]; // margin 3 = line
    expect(push.atsN).toBe(0);
    const small = refreshPending(emptyTracking('NFL'), [pred({ margin: 3.5, spread: -3 })], T0); // model 3.5 vs market 3 => edge 0.5
    const r = gradePending(small, [['2026-11-22T18:00Z', 'h1', 'a1', 27, 20, 0]], T0 + 2 * DAY).file.days[0];
    expect(r.atsN).toBe(0);
  });

  it('keeps ungraded games pending and drops stale ones (postponed)', () => {
    const none = gradePending(base, [], T0 + 2 * DAY);
    expect(none.file.pending).toHaveLength(1);
    const stale = gradePending(base, [], T0 + 40 * DAY);
    expect(stale.file.pending).toHaveLength(0);
    expect(stale.graded).toBe(0);
  });

  it('matches the right result when teams meet twice, and ignores other pairings', () => {
    const results: ResultRow[] = [
      ['2026-10-01T18:00Z', 'h1', 'a1', 3, 30, 0], // an earlier meeting: must not be used
      ['2026-11-22T18:00Z', 'x', 'y', 50, 0, 0],
      ['2026-11-22T18:00Z', 'h1', 'a1', 27, 20, 0],
    ];
    const { file } = gradePending(base, results, T0 + 2 * DAY);
    expect(file.days[0].correct).toBe(1);
  });

  it('accumulates across runs and is idempotent for already-graded games', () => {
    const results: ResultRow[] = [['2026-11-22T18:00Z', 'h1', 'a1', 27, 20, 0]];
    const once = gradePending(base, results, T0 + 2 * DAY);
    const twice = gradePending(once.file, results, T0 + 3 * DAY);
    expect(twice.graded).toBe(0);
    expect(twice.file.days[0].n).toBe(1);
  });

  it('fills the calibration bins', () => {
    const { file } = gradePending(base, [['2026-11-22T18:00Z', 'h1', 'a1', 27, 20, 0]], T0 + 2 * DAY);
    expect(file.calibration[7].n).toBe(1); // pHome 0.7 falls in the 0.7-0.8 bin
    expect(file.calibration[7].homeWins).toBe(1);
  });
});

describe('summarize', () => {
  it('turns daily totals into accuracy, Brier, a cumulative series and calibration', () => {
    let f = refreshPending(emptyTracking('NFL'), [pred(), pred({ key: 'h2|a2|2026-11-23', date: '2026-11-23T18:00:00Z', home: 'h2', away: 'a2', pHome: 0.4, margin: -2, spread: null })], T0);
    f = gradePending(
      f,
      [
        ['2026-11-22T18:00Z', 'h1', 'a1', 27, 20, 0],
        ['2026-11-23T18:00Z', 'h2', 'a2', 21, 17, 0],
      ],
      T0 + 3 * DAY,
    ).file;
    const s = summarize(f, null);
    expect(s.n).toBe(2);
    expect(s.accuracy).toBeCloseTo(0.5, 6); // first correct, second (model liked the away side) missed
    expect(s.brier).toBeCloseTo(((0.3) ** 2 + (0.4 - 1) ** 2) / 2, 4);
    expect(s.series.map((p) => p.n)).toEqual([1, 2]);
    expect(s.market?.n).toBe(1); // only the first game had a line
    expect(s.calibration.reduce((a, c) => a + c.n, 0)).toBe(2);
    expect(s.backtest).toBeNull();
  });

  it('reports null metrics before anything has been graded', () => {
    const s = summarize(emptyTracking('NFL'), null);
    expect(s.n).toBe(0);
    expect(s.accuracy).toBeNull();
    expect(s.market).toBeNull();
  });
});
