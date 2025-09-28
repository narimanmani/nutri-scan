import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const BASE_SILHOUETTES = {
  front: 'https://wger.de/static/images/muscles/muscular_system_front.svg',
  back: 'https://wger.de/static/images/muscles/muscular_system_back.svg',
};

const ALPHA_THRESHOLD = 25;

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
  const baseImageRef = useRef(null);
  const highlightCacheRef = useRef(new Map());
  const [, forceRender] = useState(0);

  const musclesForView = useMemo(
    () => muscles.filter((muscle) => muscle.view === view),
    [muscles, view]
  );

  useEffect(() => {
    setHoveredId(null);
  }, [view]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let isCancelled = false;
    const cache = highlightCacheRef.current;

    musclesForView.forEach((muscle) => {
      const src = muscle.highlightUrl || muscle.secondaryUrl;
      if (!src || cache.has(src)) {
        return;
      }

      const image = new Image();
      image.crossOrigin = 'anonymous';

      image.onload = () => {
        if (isCancelled) return;

        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });

        if (!context) {
          cache.set(src, null);
          forceRender((value) => value + 1);
          return;
        }

        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0);

        try {
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          cache.set(src, {
            width: canvas.width,
            height: canvas.height,
            data: imageData.data,
          });
        } catch (err) {
          cache.set(src, null);
        }

        forceRender((value) => value + 1);
      };

      image.onerror = () => {
        if (isCancelled) return;
        cache.set(src, null);
        forceRender((value) => value + 1);
      };

      image.src = src;
    });

    return () => {
      isCancelled = true;
    };
  }, [musclesForView]);

  const resolvePointMuscle = useCallback(
    (event) => {
      if (!baseImageRef.current || status !== 'success') {
        return null;
      }

      const rect = baseImageRef.current.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;

      if (Number.isNaN(x) || Number.isNaN(y) || x < 0 || x > 1 || y < 0 || y > 1) {
        return null;
      }

      for (let index = musclesForView.length - 1; index >= 0; index -= 1) {
        const muscle = musclesForView[index];
        const src = muscle.highlightUrl || muscle.secondaryUrl;
        if (!src) continue;

        const cacheEntry = highlightCacheRef.current.get(src);
        if (!cacheEntry || !cacheEntry.data) continue;

        const { width, height, data } = cacheEntry;
        if (!width || !height || !data) continue;

        const pixelX = Math.min(width - 1, Math.max(0, Math.round(x * width)));
        const pixelY = Math.min(height - 1, Math.max(0, Math.round(y * height)));
        const offset = (pixelY * width + pixelX) * 4 + 3;

        if (data[offset] > ALPHA_THRESHOLD) {
          return muscle;
        }
      }

      return null;
    },
    [musclesForView, status]
  );

  const handlePointerMove = useCallback(
    (event) => {
      const muscle = resolvePointMuscle(event);
      setHoveredId(muscle ? muscle.id : null);
    },
    [resolvePointMuscle]
  );

  const handlePointerLeave = useCallback(() => {
    setHoveredId(null);
  }, []);

  const handlePointerDown = useCallback(
    (event) => {
      const muscle = resolvePointMuscle(event);
      if (muscle) {
        setHoveredId(muscle.id);
      }
    },
    [resolvePointMuscle]
  );

  const handleClick = useCallback(
    (event) => {
      const muscle = resolvePointMuscle(event);
      if (muscle) {
        onToggle?.(muscle);
      }
    },
    [onToggle, resolvePointMuscle]
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
      <div
        className="relative mx-auto aspect-[3/5] w-full max-w-sm overflow-hidden rounded-[2.25rem] border border-emerald-100 bg-gradient-to-b from-emerald-50 via-white to-emerald-100 shadow-inner"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
        role="presentation"
        style={{ cursor: hoveredId != null ? 'pointer' : 'default' }}
      >
        {baseImage ? (
          <img
            src={baseImage}
            alt={`${view} anatomy silhouette`}
            ref={baseImageRef}
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

          const isSelected = selectedIds.includes(muscle.id);
          const isHovered = hoveredId === muscle.id;
          const opacity = isSelected ? 1 : isHovered ? 0.9 : 0;
          const overlayStyle = buildOverlayStyle(opacity);

          return (
            <div
              key={muscle.id}
              title={muscle.label}
              className="pointer-events-none absolute inset-0"
            >
              <img
                aria-hidden="true"
                src={highlight}
                alt=""
                className="absolute inset-0 h-full w-full object-contain transition-opacity duration-200"
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
