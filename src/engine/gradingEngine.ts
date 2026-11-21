import type { GradeBox, GradeKey, LetterGrade, TeamMetrics } from '../types/sports';
import { normalCDF } from './mathModel';

const THRESHOLDS: [number, LetterGrade][] = [
  [97, 'A+'],
  [92, 'A'],
  [87, 'A-'],
  [80, 'B+'],
  [70, 'B'],
  [60, 'B-'],
  [50, 'C+'],
  [40, 'C'],
  [30, 'C-'],
  [15, 'D'],
];

export function percentileToGrade(percentile: number): LetterGrade {
  for (const [min, grade] of THRESHOLDS) if (percentile >= min) return grade;
  return 'F';
}

export function gradeColor(grade: LetterGrade): string {
  if (grade.startsWith('A')) return 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10';
  if (grade.startsWith('B')) return 'text-lime-300 border-lime-500/40 bg-lime-500/10';
  if (grade.startsWith('C')) return 'text-amber-300 border-amber-500/40 bg-amber-500/10';
  if (grade === 'D') return 'text-orange-400 border-orange-500/40 bg-orange-500/10';
  return 'text-rose-400 border-rose-500/40 bg-rose-500/10';
}

export type StatKey =
  | 'powerRating'
  | 'offRating'
  | 'defRating'
  | 'pace'
  | 'sos'
  | 'consistency'
  | 'trendDelta'
  | 'net';

export function statValue(t: TeamMetrics, key: StatKey): number {
  return key === 'net' ? t.offRating - t.defRating : t[key];
}

/** Lower values are better only for defensive rating. */
export function lowerIsBetter(key: StatKey): boolean {
  return key === 'defRating';
}

export function meanSd(values: number[]): { mean: number; sd: number } {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return { mean, sd: Math.sqrt(variance) || 1 };
}

/** 1-based league rank for a stat, where 1 is best. */
export function rankOf(team: TeamMetrics, teams: TeamMetrics[], key: StatKey): number {
  const v = statValue(team, key);
  const better = teams.filter((t) =>
    lowerIsBetter(key) ? statValue(t, key) < v : statValue(t, key) > v,
  ).length;
  return better + 1;
}

/** Z-score oriented so that positive always means "better". */
export function orientedZ(team: TeamMetrics, teams: TeamMetrics[], key: StatKey): number {
  const { mean, sd } = meanSd(teams.map((t) => statValue(t, key)));
  const z = (statValue(team, key) - mean) / sd;
  return lowerIsBetter(key) ? -z : z;
}

export function percentileOf(team: TeamMetrics, teams: TeamMetrics[], key: StatKey): number {
  return normalCDF(orientedZ(team, teams, key)) * 100;
}

const BOXES: { key: GradeKey; label: string; stat: StatKey; fmt: (t: TeamMetrics) => string }[] = [
  { key: 'OFFENSE', label: 'Offense', stat: 'offRating', fmt: (t) => t.offRating.toFixed(1) },
  { key: 'DEFENSE', label: 'Defense', stat: 'defRating', fmt: (t) => t.defRating.toFixed(1) },
  { key: 'PACE', label: 'Tempo', stat: 'pace', fmt: (t) => t.pace.toFixed(1) },
  { key: 'SOS', label: 'Strength of Schedule', stat: 'sos', fmt: (t) => t.sos.toFixed(1) },
  { key: 'CONSISTENCY', label: 'Consistency', stat: 'consistency', fmt: (t) => t.consistency.toFixed(2) },
  { key: 'POWER', label: 'Power Rating', stat: 'powerRating', fmt: (t) => t.powerRating.toFixed(1) },
];

export function computeTeamGrades(team: TeamMetrics, teams: TeamMetrics[]): GradeBox[] {
  return BOXES.map((b) => {
    const percentile = percentileOf(team, teams, b.stat);
    return {
      key: b.key,
      label: b.label,
      displayValue: b.fmt(team),
      zScore: orientedZ(team, teams, b.stat),
      percentile,
      rank: rankOf(team, teams, b.stat),
      grade: percentileToGrade(percentile),
    };
  });
}
