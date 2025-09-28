import { useMemo } from 'react';

export const MUSCLE_GROUPS = [
  {
    id: 4,
    apiIds: [4],
    key: 'chest',
    label: 'Chest',
    view: 'front',
    description: 'Push-focused muscles for pressing movements and posture.',
    position: { top: '28%', left: '50%' },
    size: { width: '110px', height: '80px' },
  },
  {
    id: 3,
    apiIds: [3, 13],
    key: 'shoulders',
    label: 'Shoulders',
    view: 'front',
    description: 'Deltoids that stabilize overhead and pushing motions.',
    position: { top: '18%', left: '50%' },
    size: { width: '120px', height: '70px' },
  },
  {
    id: 1,
    apiIds: [1, 13],
    key: 'biceps',
    label: 'Biceps',
    view: 'front',
    description: 'Elbow flexors supporting pulling and curling exercises.',
    position: { top: '32%', left: '32%' },
    size: { width: '70px', height: '70px' },
  },
  {
    id: 2,
    apiIds: [2],
    key: 'triceps',
    label: 'Triceps',
    view: 'back',
    description: 'Primary elbow extensors for pushing strength.',
    position: { top: '32%', left: '32%' },
    size: { width: '70px', height: '70px' },
  },
  {
    id: 11,
    apiIds: [11, 12],
    key: 'upper-back',
    label: 'Upper Back',
    view: 'back',
    description: 'Trapezius and lats that support pulling and posture.',
    position: { top: '26%', left: '50%' },
    size: { width: '120px', height: '90px' },
  },
  {
    id: 14,
    apiIds: [9, 10],
    key: 'lower-back',
    label: 'Lower Back',
    view: 'back',
    description: 'Spinal erectors that stabilize hip hinge patterns.',
    position: { top: '45%', left: '50%' },
    size: { width: '110px', height: '80px' },
  },
  {
    id: 6,
    apiIds: [6, 15],
    key: 'core',
    label: 'Core',
    view: 'front',
    description: 'Abdominals and obliques for trunk stability.',
    position: { top: '40%', left: '50%' },
    size: { width: '110px', height: '80px' },
  },
  {
    id: 8,
    apiIds: [8, 7],
    key: 'glutes',
    label: 'Glutes',
    view: 'back',
    description: 'Hip extensors driving squats, lunges, and deadlifts.',
    position: { top: '55%', left: '50%' },
    size: { width: '110px', height: '90px' },
  },
  {
    id: 7,
    apiIds: [8, 9],
    key: 'quads',
    label: 'Quadriceps',
    view: 'front',
    description: 'Front thigh muscles powering squats and lunges.',
    position: { top: '58%', left: '50%' },
    size: { width: '130px', height: '110px' },
  },
  {
    id: 10,
    apiIds: [10, 11],
    key: 'hamstrings',
    label: 'Hamstrings',
    view: 'back',
    description: 'Posterior thigh muscles supporting hip hinges.',
    position: { top: '60%', left: '50%' },
    size: { width: '130px', height: '110px' },
  },
  {
    id: 5,
    apiIds: [7],
    key: 'calves',
    label: 'Calves',
    view: 'back',
    description: 'Lower leg muscles for explosive and balance work.',
    position: { top: '78%', left: '50%' },
    size: { width: '110px', height: '100px' },
  },
];

function getMusclesForView(view) {
  return MUSCLE_GROUPS.filter((group) => group.view === view || group.view === 'both');
}

export default function MuscleSelector({ view = 'front', selectedKeys = [], onToggle }) {
  const muscles = useMemo(() => getMusclesForView(view), [view]);

  return (
    <div className="space-y-6">
      <div className="relative mx-auto aspect-[3/5] w-full max-w-sm overflow-hidden rounded-3xl bg-gradient-to-b from-emerald-100 via-white to-emerald-50 shadow-inner">
        <div className="absolute inset-0">
          <div className="absolute left-1/2 top-0 h-full w-32 -translate-x-1/2 rounded-full bg-gradient-to-b from-emerald-200/70 via-emerald-100/40 to-emerald-200/70 blur-3xl" />
          <div className="absolute inset-0 flex flex-col items-center justify-between py-6 text-emerald-900/40">
            <div className="text-lg font-semibold uppercase tracking-[0.35em]">{view}</div>
            <div className="h-full w-px bg-gradient-to-b from-transparent via-emerald-200 to-transparent" />
            <div className="text-sm uppercase tracking-[0.3em]">anatomy</div>
          </div>
        </div>

        {muscles.map((muscle) => {
          const isSelected = selectedKeys.includes(muscle.key);
          const style = {
            top: muscle.position.top,
            left: muscle.position.left,
            width: muscle.size.width,
            height: muscle.size.height,
            marginLeft: `-${parseInt(muscle.size.width, 10) / 2}px`,
            marginTop: `-${parseInt(muscle.size.height, 10) / 2}px`,
          };

          return (
            <button
              key={`${muscle.key}-${view}`}
              type="button"
              onClick={() => onToggle?.(muscle)}
              aria-pressed={isSelected}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
                isSelected
                  ? 'border-emerald-500/80 bg-emerald-400/50 shadow-lg shadow-emerald-500/20'
                  : 'border-emerald-300/80 bg-white/70 hover:border-emerald-500/80'
              }`}
              style={style}
            >
              <span className="sr-only">{muscle.label}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 text-sm text-emerald-900/80">
        {muscles.map((muscle) => {
          const isSelected = selectedKeys.includes(muscle.key);
          return (
            <button
              key={muscle.key}
              type="button"
              onClick={() => onToggle?.(muscle)}
              className={`w-full rounded-xl border bg-white/80 px-4 py-3 text-left transition hover:shadow-md ${
                isSelected
                  ? 'border-emerald-500/70 shadow-emerald-200'
                  : 'border-emerald-100 text-emerald-900/70'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-emerald-900">{muscle.label}</span>
                <span className={`text-xs uppercase tracking-wide ${isSelected ? 'text-emerald-600' : 'text-emerald-400'}`}>
                  {isSelected ? 'Selected' : view}
                </span>
              </div>
              <p className="mt-1 text-xs text-emerald-800/70">{muscle.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
