import { useEffect, useMemo, useState } from 'react';
import { getSilhouetteAsset } from '@/utils/wgerAssets.js';

function buildOverlayStyle(opacity = 0) {
  return {
    opacity,
    visibility: opacity > 0 ? 'visible' : 'hidden',
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
  const normalizedSelectedIds = useMemo(
    () => selectedIds.map((id) => Number(id)).filter((id) => Number.isFinite(id)),
    [selectedIds]
  );

  const musclesForView = useMemo(
    () => muscles.filter((muscle) => muscle.view === view),
    [muscles, view]
  );

  useEffect(() => {
    setHoveredId(null);
  }, [view]);

  const activeMuscle = useMemo(() => {
    if (hoveredId != null) {
      return musclesForView.find((muscle) => muscle.id === hoveredId) || null;
    }
    for (const id of normalizedSelectedIds) {
      const match = musclesForView.find((muscle) => Number(muscle.id) === id);
      if (match) return match;
    }
    return null;
  }, [hoveredId, musclesForView, normalizedSelectedIds]);

  const baseImage = getSilhouetteAsset(view);
  const statusCopy = getStatusCopy(status, error);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(22rem,1fr)_minmax(0,1fr)] lg:items-start lg:gap-8">
      <div
        className="relative mx-auto aspect-[3/5] w-full max-w-sm overflow-hidden rounded-[2.25rem] border border-emerald-100 bg-gradient-to-b from-emerald-50 via-white to-emerald-100 shadow-inner lg:mx-0 lg:h-full lg:max-w-none"
        onPointerLeave={() => setHoveredId(null)}
        role="presentation"
        style={{
          cursor: status === 'success' ? 'pointer' : 'default',
          pointerEvents: status === 'success' ? 'auto' : 'none',
        }}
      >
        {baseImage ? (
          <img
            src={baseImage}
            alt={`${view} anatomy silhouette`}
            className="h-full w-full select-none object-contain"
            style={{ filter: 'grayscale(1) saturate(0.7) brightness(1.05)' }}
            draggable={false}
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

          const muscleId = Number(muscle.id);
          const isSelected = normalizedSelectedIds.includes(muscleId);
          const isHovered = hoveredId === muscle.id;
          const opacity = isSelected ? 1 : isHovered ? 0.9 : 0;
          const overlayStyle = buildOverlayStyle(opacity);

          return (
            <div
              key={muscle.id}
              title={muscle.label}
              className="absolute inset-0"
            >
              <button
                type="button"
                aria-pressed={isSelected}
                className="absolute inset-0"
                onClick={() => onToggle?.(muscle)}
                onPointerEnter={() => setHoveredId(muscle.id)}
                onPointerLeave={() => setHoveredId(null)}
                onFocus={() => setHoveredId(muscle.id)}
                onBlur={() => setHoveredId(null)}
                style={{
                  WebkitMaskImage: `url(${highlight})`,
                  maskImage: `url(${highlight})`,
                  WebkitMaskRepeat: 'no-repeat',
                  maskRepeat: 'no-repeat',
                  WebkitMaskSize: 'contain',
                  maskSize: 'contain',
                  WebkitMaskPosition: 'center',
                  maskPosition: 'center',
                  backgroundColor: isSelected
                    ? 'rgba(16, 185, 129, 0.18)'
                    : 'rgba(16, 185, 129, 0.12)',
                  transition: 'background-color 150ms ease, opacity 150ms ease',
                  opacity: isSelected || isHovered ? 1 : 0,
                }}
              >
                <span className="sr-only">{`${isSelected ? 'Deselect' : 'Select'} ${muscle.label}`}</span>
              </button>
              <img
                aria-hidden="true"
                src={highlight}
                alt=""
                className="pointer-events-none absolute inset-0 h-full w-full object-contain transition-opacity duration-200"
                style={{
                  ...overlayStyle,
                  filter: isSelected
                    ? 'drop-shadow(0 12px 18px rgba(16,185,129,0.28))'
                    : 'drop-shadow(0 10px 12px rgba(45,212,191,0.2))',
                }}
              />
            </div>
          );
        })}

        {activeMuscle && (
          <div className="pointer-events-none absolute inset-x-6 bottom-5 rounded-2xl border border-emerald-200/70 bg-white/90 px-4 py-3 text-sm text-emerald-900 shadow-lg shadow-emerald-100/60">
            <p className="font-semibold">{activeMuscle.label}</p>
            <p className="mt-1 text-xs text-emerald-800/75">{activeMuscle.description}</p>
          </div>
        )}
      </div>

      <div className="grid gap-3 text-sm text-emerald-900/80 md:grid-cols-2">
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
          const muscleId = Number(muscle.id);
          const isSelected = normalizedSelectedIds.includes(muscleId);
          const isHovered = hoveredId === muscle.id;
          const overlayStyle = buildOverlayStyle(isSelected || isHovered ? 1 : 0.65);

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
                  <img
                    src={highlight}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full object-contain transition-opacity duration-200"
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
