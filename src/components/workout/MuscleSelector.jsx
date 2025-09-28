import { useEffect, useMemo, useState } from 'react';
import { fetchAllMuscles } from '@/api/wger.js';

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

const WGER_ASSET_BASE_URL = 'https://wger.de';

function toAbsoluteAssetUrl(url) {
  if (!url) {
    return '';
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  if (url.startsWith('//')) {
    return `https:${url}`;
  }

  const normalizedBase = WGER_ASSET_BASE_URL.replace(/\/$/, '');
  const normalizedPath = url.startsWith('/') ? url : `/${url}`;
  return `${normalizedBase}${normalizedPath}`;
}

function buildMuscleVisuals(records = []) {
  const byId = new Map();
  records.forEach((record) => {
    if (record?.id != null) {
      byId.set(record.id, record);
    }
  });

  const resolveBaseImage = (isFront) => {
    for (const record of records) {
      if (record?.image_url_secondary && Boolean(record.is_front) === isFront) {
        return toAbsoluteAssetUrl(record.image_url_secondary);
      }
    }
    return '';
  };

  const resolveOverlayImage = (group, view) => {
    const isFront = view === 'front';

    for (const id of group.apiIds) {
      const record = byId.get(id);
      if (!record) continue;
      if (Boolean(record.is_front) === isFront && record.image_url_main) {
        return toAbsoluteAssetUrl(record.image_url_main);
      }
    }

    for (const id of group.apiIds) {
      const record = byId.get(id);
      if (!record) continue;
      if (record.image_url_secondary) {
        return toAbsoluteAssetUrl(record.image_url_secondary);
      }
    }

    for (const id of group.apiIds) {
      const record = byId.get(id);
      if (!record) continue;
      if (record.image_url_main) {
        return toAbsoluteAssetUrl(record.image_url_main);
      }
    }

    return '';
  };

  const overlays = new Map();
  for (const group of MUSCLE_GROUPS) {
    overlays.set(group.key, {
      front: resolveOverlayImage(group, 'front'),
      back: resolveOverlayImage(group, 'back'),
    });
  }

  return {
    base: {
      front: resolveBaseImage(true),
      back: resolveBaseImage(false),
    },
    overlays,
  };
}

export default function MuscleSelector({ view = 'front', selectedKeys = [], onToggle }) {
  const muscles = useMemo(() => getMusclesForView(view), [view]);
  const [visuals, setVisuals] = useState({ status: 'idle', data: null, error: '' });
  const [hoveredKey, setHoveredKey] = useState('');

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();

    setVisuals((prev) => ({ ...prev, status: 'loading', error: '' }));

    fetchAllMuscles({ signal: controller.signal })
      .then((records) => {
        if (!isActive) return;
        setVisuals({ status: 'success', data: buildMuscleVisuals(records), error: '' });
      })
      .catch((error) => {
        if (!isActive || error.name === 'AbortError') return;
        setVisuals({ status: 'error', data: null, error: error.message || 'Unable to load anatomy visuals.' });
      });

    return () => {
      isActive = false;
      controller.abort();
    };
  }, []);

  const baseImage = visuals.data?.base?.[view] || '';
  const overlaysForView = visuals.data?.overlays || new Map();
  const previewKeys = useMemo(() => {
    const keys = new Set(selectedKeys);
    if (hoveredKey) {
      keys.add(hoveredKey);
    }
    return Array.from(keys);
  }, [hoveredKey, selectedKeys]);

  const visibleOverlayImages = previewKeys
    .map((key) => overlaysForView.get(key)?.[view])
    .filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="relative mx-auto aspect-[3/5] w-full max-w-sm overflow-hidden rounded-3xl border border-emerald-100 bg-white/80 shadow-inner">
        <div className="absolute inset-0">
          {baseImage ? (
            <img
              src={baseImage}
              alt={`${view} anatomy silhouette`}
              className="h-full w-full object-contain"
              style={{ filter: 'grayscale(1) saturate(0) brightness(1.1)' }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-emerald-50 via-white to-emerald-100 text-sm text-emerald-500">
              {visuals.status === 'loading' ? 'Loading anatomy…' : 'Anatomy illustration unavailable'}
            </div>
          )}

          {visibleOverlayImages.map((src, index) => (
            <img
              key={`${src}-${index}`}
              src={src}
              alt="Selected muscle highlight"
              className="pointer-events-none absolute inset-0 h-full w-full object-contain mix-blend-multiply opacity-90 transition"
            />
          ))}

          {visuals.status === 'error' && (
            <div className="absolute inset-x-4 bottom-4 rounded-xl border border-yellow-300 bg-yellow-50/95 px-3 py-2 text-center text-xs font-medium text-yellow-700 shadow-sm">
              Unable to load anatomy art from wger.
            </div>
          )}
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
              onMouseEnter={() => setHoveredKey(muscle.key)}
              onMouseLeave={() => setHoveredKey('')}
              onFocus={() => setHoveredKey(muscle.key)}
              onBlur={() => setHoveredKey('')}
              aria-pressed={isSelected}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-transparent transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
                isSelected
                  ? 'border-emerald-500/80 bg-emerald-400/10 shadow-lg shadow-emerald-500/10'
                  : 'border-transparent hover:border-emerald-500/70'
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
          const overlaySrc = overlaysForView.get(muscle.key)?.[view];

          return (
            <button
              key={muscle.key}
              type="button"
              onClick={() => onToggle?.(muscle)}
              onMouseEnter={() => setHoveredKey(muscle.key)}
              onMouseLeave={() => setHoveredKey('')}
              onFocus={() => setHoveredKey(muscle.key)}
              onBlur={() => setHoveredKey('')}
              className={`flex w-full items-center gap-3 rounded-xl border bg-white/80 px-4 py-3 text-left transition hover:shadow-md ${
                isSelected ? 'border-emerald-500/70 shadow-emerald-200' : 'border-emerald-100 text-emerald-900/70'
              }`}
            >
              {overlaySrc ? (
                <img
                  src={overlaySrc}
                  alt=""
                  aria-hidden="true"
                  className={`h-12 w-12 flex-shrink-0 rounded-full border border-emerald-100 bg-white object-contain p-1 ${
                    isSelected ? 'opacity-100' : 'opacity-80'
                  }`}
                />
              ) : (
                <div className="h-12 w-12 flex-shrink-0 rounded-full border border-emerald-100 bg-gradient-to-br from-emerald-50 to-emerald-100" />
              )}
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-emerald-900">{muscle.label}</span>
                  <span className={`text-xs uppercase tracking-wide ${isSelected ? 'text-emerald-600' : 'text-emerald-400'}`}>
                    {isSelected ? 'Selected' : view}
                  </span>
                </div>
                <p className="mt-1 text-xs text-emerald-800/70">{muscle.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
