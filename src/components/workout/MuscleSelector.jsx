import { useMemo, useState } from 'react';

const BASE_SILHOUETTES = {
  front: 'https://wger.de/static/images/muscles/muscular_system_front.svg',
  back: 'https://wger.de/static/images/muscles/muscular_system_back.svg',
};

const OVERLAY_BASE_STYLE = {
  backgroundRepeat: 'no-repeat',
  backgroundSize: 'contain',
  backgroundPosition: 'center',
};

function buildMaskStyle(src = '') {
  if (!src) return {};
  return {
    WebkitMaskImage: `url(${src})`,
    maskImage: `url(${src})`,
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
  };
}

function buildOverlayStyle(src = '', opacity = 0) {
  if (!src) return { opacity: 0 };
  return {
    ...OVERLAY_BASE_STYLE,
    backgroundImage: `url(${src})`,
    opacity,
  };
}

function getStatusCopy(status, error) {
  if (status === 'loading') {
    return 'Loading anatomy…';
  }
  if (status === 'error') {
    return error || 'Unable to load anatomy data from wger.';
  }
  return '';
}

export default function MuscleSelector({
  view = 'front',
  muscles = [],
  selectedIds = [],
  onToggle,
  status = 'idle',
  error = '',
}) {
  const [hoveredId, setHoveredId] = useState(null);

  const musclesForView = useMemo(
    () => muscles.filter((muscle) => muscle.view === view),
    [muscles, view]
  );

  const activeMuscle = useMemo(() => {
    if (hoveredId != null) {
      return musclesForView.find((muscle) => muscle.id === hoveredId) || null;
    }
    for (const id of selectedIds) {
      const match = musclesForView.find((muscle) => muscle.id === id);
      if (match) return match;
    }
    return null;
  }, [hoveredId, musclesForView, selectedIds]);

  const baseImage = BASE_SILHOUETTES[view];
  const statusCopy = getStatusCopy(status, error);

  return (
    <div className="space-y-6">
      <div className="relative mx-auto aspect-[3/5] w-full max-w-sm overflow-hidden rounded-[2.25rem] border border-emerald-100 bg-gradient-to-b from-emerald-50 via-white to-emerald-100 shadow-inner">
        {baseImage ? (
          <img
            src={baseImage}
            alt={`${view} anatomy silhouette`}
            className="h-full w-full object-contain"
            style={{ filter: 'grayscale(1) saturate(0.7) brightness(1.05)' }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-emerald-500">
            Anatomy illustration unavailable
          </div>
        )}

        {statusCopy && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-center text-sm font-medium text-emerald-600 backdrop-blur-sm">
            {statusCopy}
          </div>
        )}

        {musclesForView.map((muscle) => {
          const highlight = muscle.highlightUrl || muscle.secondaryUrl;
          if (!highlight) return null;

          const isSelected = selectedIds.includes(muscle.id);
          const isHovered = hoveredId === muscle.id;
          const opacity = isSelected ? 1 : isHovered ? 0.9 : 0;
          const maskStyle = buildMaskStyle(highlight);
          const overlayStyle = buildOverlayStyle(highlight, opacity);

          return (
            <button
              key={muscle.id}
              type="button"
              aria-pressed={isSelected}
              title={muscle.label}
              onClick={() => onToggle?.(muscle)}
              onMouseEnter={() => setHoveredId(muscle.id)}
              onMouseLeave={() => setHoveredId(null)}
              onFocus={() => setHoveredId(muscle.id)}
              onBlur={() => setHoveredId(null)}
              className="absolute inset-0 focus-visible:outline-none"
              style={{
                ...maskStyle,
                cursor: 'pointer',
              }}
            >
              <span className="sr-only">Toggle {muscle.label}</span>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 transition-opacity duration-200"
                style={{
                  ...overlayStyle,
                  filter: isSelected
                    ? 'drop-shadow(0 12px 18px rgba(16,185,129,0.28))'
                    : 'drop-shadow(0 10px 12px rgba(45,212,191,0.2))',
                }}
              />
            </button>
          );
        })}

        {activeMuscle && (
          <div className="pointer-events-none absolute inset-x-6 bottom-5 rounded-2xl border border-emerald-200/70 bg-white/90 px-4 py-3 text-sm text-emerald-900 shadow-lg shadow-emerald-100/60">
            <p className="font-semibold">{activeMuscle.label}</p>
            <p className="mt-1 text-xs text-emerald-800/75">{activeMuscle.description}</p>
          </div>
        )}
      </div>

      <div className="grid gap-3 text-sm text-emerald-900/80 sm:grid-cols-2">
        {status === 'loading' && (
          <p className="col-span-full rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/70 px-4 py-3 text-center text-xs font-medium text-emerald-600">
            Fetching muscle overlays from the wger API…
          </p>
        )}

        {status === 'error' && (
          <p className="col-span-full rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-center text-xs font-medium text-red-600">
            We couldn’t load the anatomy list. Please try again.
          </p>
        )}

        {musclesForView.length === 0 && status === 'success' && (
          <p className="col-span-full rounded-2xl border border-emerald-100 bg-white/70 px-4 py-3 text-center text-xs text-emerald-600">
            No muscles available for this view.
          </p>
        )}

        {musclesForView.map((muscle) => {
          const highlight = muscle.highlightUrl || muscle.secondaryUrl;
          const isSelected = selectedIds.includes(muscle.id);
          const isHovered = hoveredId === muscle.id;
          const overlayStyle = buildOverlayStyle(highlight, isSelected || isHovered ? 1 : 0.65);

          return (
            <button
              key={`list-${muscle.id}`}
              type="button"
              onClick={() => onToggle?.(muscle)}
              onMouseEnter={() => setHoveredId(muscle.id)}
              onMouseLeave={() => setHoveredId(null)}
              onFocus={() => setHoveredId(muscle.id)}
              onBlur={() => setHoveredId(null)}
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
                isSelected
                  ? 'border-emerald-400/70 bg-white shadow-md shadow-emerald-100'
                  : 'border-emerald-100 bg-white/80 hover:border-emerald-300'
              }`}
            >
              <span className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-emerald-50">
                {highlight ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 transition-opacity duration-200"
                    style={{
                      ...overlayStyle,
                      filter: isSelected
                        ? 'drop-shadow(0 10px 14px rgba(16,185,129,0.28))'
                        : 'grayscale(0.2) saturate(1.1)',
                    }}
                  />
                ) : (
                  <span className="h-8 w-8 rounded-full bg-emerald-100" aria-hidden="true" />
                )}
              </span>

              <span className="flex-1">
                <span className="block font-semibold text-emerald-900">{muscle.label}</span>
                <span className="mt-1 block text-xs text-emerald-800/75">{muscle.description}</span>
              </span>

              <span
                className={`text-xs font-semibold uppercase tracking-wide ${
                  isSelected ? 'text-emerald-600' : 'text-emerald-400'
                }`}
              >
                {isSelected ? 'Selected' : 'Tap to add'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
