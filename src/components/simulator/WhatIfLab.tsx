import { RotateCcw } from 'lucide-react';
import type { LeagueConfig, TeamMetrics, WhatIfAdjustments } from '../../types/sports';
import { NEUTRAL_ADJUSTMENTS } from '../../engine/mathModel';
import { SectionTitle } from '../common/ui';

interface SliderDef {
  key: keyof WhatIfAdjustments;
  label: string;
  min: number;
  max: number;
  step: number;
  hint: string;
}

function sliders(prefix: 'A' | 'B'): SliderDef[] {
  return [
    { key: `team${prefix}OffDelta` as keyof WhatIfAdjustments, label: 'Offense', min: -10, max: 10, step: 0.5, hint: '+ = better' },
    { key: `team${prefix}DefDelta` as keyof WhatIfAdjustments, label: 'Defense (pts allowed)', min: -10, max: 10, step: 0.5, hint: '− = better' },
    { key: `team${prefix}PaceDelta` as keyof WhatIfAdjustments, label: 'Pace', min: -8, max: 8, step: 0.5, hint: '+ = faster' },
  ];
}

interface Props {
  league: LeagueConfig;
  teamA: TeamMetrics;
  teamB: TeamMetrics;
  adj: WhatIfAdjustments;
  onChange: (a: WhatIfAdjustments) => void;
}

export default function WhatIfLab({ league, teamA, teamB, adj, onChange }: Props) {
  // Presets are scaled to the league's rating units (NBA ratings are per 100 possessions).
  const s = league.id === 'NBA' ? 1 : 0.5;
  const presets: { label: string; apply: WhatIfAdjustments }[] = [
    { label: 'Reset', apply: NEUTRAL_ADJUSTMENTS },
    {
      label: `${teamA.abbreviation} star out`,
      apply: { ...NEUTRAL_ADJUSTMENTS, teamAOffDelta: -5 * s, teamADefDelta: 2 * s },
    },
    {
      label: `${teamB.abbreviation} star out`,
      apply: { ...NEUTRAL_ADJUSTMENTS, teamBOffDelta: -5 * s, teamBDefDelta: 2 * s },
    },
    { label: 'Pace up', apply: { ...NEUTRAL_ADJUSTMENTS, teamAPaceDelta: 4, teamBPaceDelta: 4 } },
    {
      label: 'Slow grind',
      apply: { ...NEUTRAL_ADJUSTMENTS, teamAPaceDelta: -4, teamBPaceDelta: -4, teamADefDelta: -1 * s, teamBDefDelta: -1 * s },
    },
    {
      label: 'Shootout',
      apply: { ...NEUTRAL_ADJUSTMENTS, teamAOffDelta: 3 * s, teamBOffDelta: 3 * s, teamADefDelta: 2 * s, teamBDefDelta: 2 * s },
    },
  ];

  const dirty = (Object.keys(adj) as (keyof WhatIfAdjustments)[]).some((k) => adj[k] !== 0);

  const column = (team: TeamMetrics, prefix: 'A' | 'B') => (
    <div className="flex-1 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: team.primaryColor === '#000000' ? '#e2e8f0' : undefined }}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: team.primaryColor, boxShadow: `0 0 0 2px ${team.secondaryColor}` }} />
        {team.name}
      </div>
      {sliders(prefix).map((d) => (
        <label key={d.key} className="block">
          <div className="mb-0.5 flex justify-between text-xs text-slate-400">
            <span>
              {d.label} <span className="text-slate-600">({d.hint})</span>
            </span>
            <span className={`num font-semibold ${adj[d.key] === 0 ? 'text-slate-500' : 'text-emerald-400'}`}>
              {adj[d.key] > 0 ? '+' : ''}
              {adj[d.key].toFixed(1)}
            </span>
          </div>
          <input
            type="range"
            min={d.min}
            max={d.max}
            step={d.step}
            value={adj[d.key]}
            onChange={(e) => onChange({ ...adj, [d.key]: Number(e.target.value) })}
            className="w-full accent-emerald-500"
          />
        </label>
      ))}
    </div>
  );

  return (
    <section className="card p-4">
      <SectionTitle
        right={
          dirty && (
            <button
              onClick={() => onChange(NEUTRAL_ADJUSTMENTS)}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white"
            >
              <RotateCcw size={12} /> Reset
            </button>
          )
        }
      >
        What-If Lab
      </SectionTitle>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p.label}
            onClick={() => onChange(p.apply)}
            className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium hover:border-emerald-500 hover:text-emerald-300"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-6 md:flex-row">
        {column(teamA, 'A')}
        {column(teamB, 'B')}
      </div>
    </section>
  );
}
