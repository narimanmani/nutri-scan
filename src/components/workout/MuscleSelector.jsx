import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveWgerAssetUrl } from '@/utils/wgerAssets.js';

const BASE_SILHOUETTES = {
  front: resolveWgerAssetUrl('/static/images/muscles/muscular_system_front.svg'),
  back: resolveWgerAssetUrl('/static/images/muscles/muscular_system_back.svg'),
};

const overlaySvgCache = new Map();

function buildOverlayStyle(opacity = 0) {
  return {
    opacity,
    visibility: opacity > 0 ? 'visible' : 'hidden',
  };
}

function useInlineSvg(url) {
  const [markup, setMarkup] = useState(() => (url ? overlaySvgCache.get(url) || '' : ''));

  useEffect(() => {
    if (!url || !/\.svg(?:\?|#|$)/i.test(url)) {
      setMarkup('');
      return;
    }

    if (overlaySvgCache.has(url)) {
      setMarkup(overlaySvgCache.get(url) || '');
      return;
    }

    let isActive = true;

    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch overlay: ${response.status}`);
        }
        return response.text();
      })
      .then((text) => {
        if (!isActive) return;
        overlaySvgCache.set(url, text);
        setMarkup(text);
      })
      .catch(() => {
        if (!isActive) return;
        setMarkup('');
      });

    return () => {
      isActive = false;
    };
  }, [url]);

  return markup;
}

function useSvgInteraction({
  containerRef,
  markup,
  label,
  isSelected,
  onPointerEnter,
  onPointerLeave,
  onToggle,
}) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const svg = container.querySelector('svg');
    if (!svg) return;

    svg.setAttribute('focusable', 'true');
    svg.setAttribute('tabindex', '0');
    svg.setAttribute('role', 'button');
    svg.setAttribute('aria-label', `${isSelected ? 'Deselect' : 'Select'} ${label}`);
    svg.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.cursor = 'pointer';
    svg.style.pointerEvents = 'visiblePainted';
    svg.style.outline = 'none';

    const normalizePaintAttributes = (node) => {
      if (!node) return;

      const shouldReplace = (value) => {
        if (!value) return false;
        const normalized = value.trim().toLowerCase();
        if (!normalized || normalized === 'none' || normalized === 'transparent') {
          return false;
        }

        // Patterns like url(#gradient) should retain their original paint.
        if (normalized.startsWith('url(')) {
          return false;
        }

        return true;
      };

      node.querySelectorAll('[fill]').forEach((el) => {
        const fillValue = el.getAttribute('fill');
        if (!shouldReplace(fillValue)) {
          return;
        }
        el.setAttribute('fill', 'currentColor');
      });

      node.querySelectorAll('[stroke]').forEach((el) => {
        const strokeValue = el.getAttribute('stroke');
        if (!shouldReplace(strokeValue)) {
          return;
        }
        el.setAttribute('stroke', 'currentColor');
      });
    };

    normalizePaintAttributes(svg);

    const handlePointerEnter = (event) => {
      event.stopPropagation();
      onPointerEnter?.();
    };

    const handlePointerLeave = (event) => {
      event.stopPropagation();
      onPointerLeave?.();
    };

    const handleClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      onToggle?.();
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onToggle?.();
      }
    };

    const handleFocus = () => {
      onPointerEnter?.();
    };

    const handleBlur = () => {
      onPointerLeave?.();
    };

    svg.addEventListener('pointerenter', handlePointerEnter);
    svg.addEventListener('pointerleave', handlePointerLeave);
    svg.addEventListener('click', handleClick);
    svg.addEventListener('keydown', handleKeyDown);
    svg.addEventListener('focus', handleFocus);
    svg.addEventListener('blur', handleBlur);

    return () => {
      svg.removeEventListener('pointerenter', handlePointerEnter);
      svg.removeEventListener('pointerleave', handlePointerLeave);
      svg.removeEventListener('click', handleClick);
      svg.removeEventListener('keydown', handleKeyDown);
      svg.removeEventListener('focus', handleFocus);
      svg.removeEventListener('blur', handleBlur);
    };
  }, [containerRef, markup, label, isSelected, onPointerEnter, onPointerLeave, onToggle]);
}

function MuscleHitRegion({
  highlight,
  label,
  isSelected,
  onPointerEnter,
  onPointerLeave,
  onToggle,
}) {
  const containerRef = useRef(null);
  const markup = useInlineSvg(highlight);

  useSvgInteraction({
    containerRef,
    markup,
    label,
    isSelected,
    onPointerEnter,
    onPointerLeave,
    onToggle,
  });

  if (!markup) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 opacity-0"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
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

  const baseImage = BASE_SILHOUETTES[view];
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
              <MuscleHitRegion
                highlight={highlight}
                label={muscle.label}
                isSelected={isSelected}
                onPointerEnter={() => setHoveredId(muscle.id)}
                onPointerLeave={() => setHoveredId(null)}
                onToggle={() => onToggle?.(muscle)}
              />
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
