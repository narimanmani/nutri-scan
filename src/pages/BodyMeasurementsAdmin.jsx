import { useEffect, useMemo, useRef, useState } from "react";
import { getSilhouetteAsset } from "@/utils/wgerAssets.js";
import {
  DEFAULT_MEASUREMENT_FIELDS,
  clearMeasurementPositions,
  getDefaultMeasurementPositions,
  loadDefaultMeasurementOverride,
  loadMeasurementPositions,
  mergeFieldsWithPositions,
  normalizeMeasurementPositions,
  saveDefaultMeasurementPositions,
  saveMeasurementPositions,
} from "@/utils/bodyMeasurementLayout.js";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export default function BodyMeasurementsAdmin() {
  const initialPositions = useMemo(() => {
    const stored = loadMeasurementPositions();
    return stored || getDefaultMeasurementPositions();
  }, []);

  const [positions, setPositions] = useState(initialPositions);
  const [selectedFieldId, setSelectedFieldId] = useState(DEFAULT_MEASUREMENT_FIELDS[0].id);
  const [isDirty, setIsDirty] = useState(false);
  const [status, setStatus] = useState(null);
  const [dragState, setDragState] = useState(null);
  const svgRef = useRef(null);
  const baseImage = useMemo(() => getSilhouetteAsset("front"), []);
  const [hasCustomDefault, setHasCustomDefault] = useState(() => Boolean(loadDefaultMeasurementOverride()));
  const [layoutJson, setLayoutJson] = useState(() =>
    JSON.stringify(normalizeMeasurementPositions(initialPositions), null, 2)
  );

  const measurementFields = useMemo(
    () => mergeFieldsWithPositions(DEFAULT_MEASUREMENT_FIELDS, positions),
    [positions]
  );

  const selectedField = measurementFields.find((field) => field.id === selectedFieldId) || measurementFields[0];

  useEffect(() => {
    if (!dragState) {
      return undefined;
    }

    const fieldBlueprint =
      measurementFields.find((field) => field.id === dragState.fieldId) ||
      DEFAULT_MEASUREMENT_FIELDS.find((field) => field.id === dragState.fieldId) ||
      DEFAULT_MEASUREMENT_FIELDS[0];

    const handlePointerMove = (event) => {
      if (!svgRef.current) return;
      const bounds = svgRef.current.getBoundingClientRect();
      const x = clamp(((event.clientX - bounds.left) / bounds.width) * 100, 0, 100);
      const y = clamp(((event.clientY - bounds.top) / bounds.height) * 100, 0, 100);

      setPositions((prev) => {
        const previousField = prev[dragState.fieldId] || {
          point: { ...fieldBlueprint.point },
          anchor: { ...fieldBlueprint.anchor },
        };

        const nextField = {
          ...previousField,
          [dragState.target]: { x, y },
        };

        return {
          ...prev,
          [dragState.fieldId]: nextField,
        };
      });
      setIsDirty(true);
      setStatus(null);
    };

    const handlePointerUp = () => {
      setDragState(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragState, measurementFields]);

  const handleManualChange = (fieldId, target, axis) => (event) => {
    const value = Number(event.target.value);
    if (Number.isNaN(value)) {
      return;
    }

    setPositions((prev) => {
      const blueprint =
        measurementFields.find((field) => field.id === fieldId) ||
        DEFAULT_MEASUREMENT_FIELDS.find((field) => field.id === fieldId) ||
        DEFAULT_MEASUREMENT_FIELDS[0];

      const previousField = prev[fieldId] || {
        point: { ...blueprint.point },
        anchor: { ...blueprint.anchor },
      };
      const nextField = {
        ...previousField,
        [target]: {
          ...previousField[target],
          [axis]: clamp(value, 0, 100),
        },
      };

      return {
        ...prev,
        [fieldId]: nextField,
      };
    });
    setIsDirty(true);
    setStatus(null);
  };

  const handleDragStart = (fieldId, target) => (event) => {
    event.preventDefault();
    setDragState({ fieldId, target });
  };

  const formatPositions = (nextPositions) =>
    JSON.stringify(normalizeMeasurementPositions(nextPositions), null, 2);

  useEffect(() => {
    if (!isDirty) {
      setLayoutJson(formatPositions(positions));
    }
  }, [isDirty, positions]);

  const handleSave = () => {
    saveMeasurementPositions(positions);
    setIsDirty(false);
    setStatus({ tone: "success", message: "Measurement guides saved successfully." });
    setLayoutJson(formatPositions(positions));
  };

  const handleReset = () => {
    const defaults = getDefaultMeasurementPositions();
    clearMeasurementPositions();
    setPositions(defaults);
    setIsDirty(false);
    setStatus({
      tone: "success",
      message: hasCustomDefault
        ? "Guides reset to your saved default layout."
        : "Guides reset to default positions.",
    });
  };

  const handleSaveAsDefault = () => {
    saveDefaultMeasurementPositions(positions);
    saveMeasurementPositions(positions);
    setHasCustomDefault(true);
    setIsDirty(false);
    setStatus({ tone: "success", message: "Current layout saved as the new default for this device." });
    setLayoutJson(formatPositions(positions));
  };

  const handleImportLayout = () => {
    try {
      const parsed = JSON.parse(layoutJson);
      const normalized = normalizeMeasurementPositions(parsed);
      setPositions(normalized);
      setIsDirty(true);
      setStatus({ tone: "success", message: "Layout imported. Save to apply the changes." });
      setLayoutJson(formatPositions(normalized));
    } catch (error) {
      console.warn("Failed to import measurement layout from JSON", error);
      setStatus({
        tone: "error",
        message: "Unable to import layout. Please ensure the JSON structure is valid.",
      });
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <header className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-500">Admin</p>
        <h1 className="text-3xl font-bold text-emerald-950 sm:text-4xl">Body Measurement Guide Editor</h1>
        <p className="max-w-3xl text-base text-emerald-900/80 sm:text-lg">
          Drag the guide handles to align the anatomy explorer with your preferred measuring locations. Save your changes to
          update what members see in the measurement tracker.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
        <aside className="space-y-6 rounded-3xl border border-emerald-100 bg-white/80 p-6 shadow-lg shadow-emerald-100/60">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-emerald-900">Measurement areas</h2>
              <p className="mt-1 text-sm text-emerald-800/75">Select an area to adjust its guide points.</p>
            </div>
          </div>

          <div className="space-y-3">
            {measurementFields.map((field) => {
              const isActive = field.id === selectedFieldId;
              return (
                <button
                  key={field.id}
                  type="button"
                  onClick={() => setSelectedFieldId(field.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${
                    isActive
                      ? "border-emerald-300 bg-emerald-50 text-emerald-900 shadow-lg shadow-emerald-100"
                      : "border-emerald-100 bg-white text-emerald-800 hover:border-emerald-200 hover:bg-emerald-50/60"
                  }`}
                >
                  <p className="text-sm font-semibold">{field.label}</p>
                  <p className="mt-1 text-xs text-emerald-800/70">{field.description}</p>
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-white/90 p-4 text-sm text-emerald-800/80">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-emerald-500">Tip</h3>
            <p className="mt-2">
              Use the numeric inputs below the explorer for fine-grained adjustments. Coordinates are percentages relative to the
              image boundaries.
            </p>
          </div>

          <div className="space-y-3 rounded-2xl border border-emerald-100 bg-white/90 p-4 text-sm text-emerald-800/80">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-emerald-900">Layout configuration JSON</h3>
              <p className="text-xs text-emerald-800/70">
                Copy this configuration after saving to back up the current layout. Paste a saved JSON and import it to restore a
                layout without using the visual editor.
              </p>
            </div>
            <textarea
              value={layoutJson}
              onChange={(event) => {
                setLayoutJson(event.target.value);
                setStatus(null);
              }}
              rows={12}
              className="w-full rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2 font-mono text-xs text-emerald-900 shadow-inner focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={handleImportLayout}
              className="w-full rounded-full border border-emerald-300 bg-emerald-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-800 transition-colors hover:border-emerald-400 hover:bg-emerald-200/80 hover:text-emerald-900"
            >
              Import layout from JSON
            </button>
          </div>
        </aside>

        <section className="space-y-6 rounded-3xl border border-emerald-100 bg-white/70 p-6 shadow-lg shadow-emerald-100/60">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-emerald-900">Adjust explorer guides</h2>
              <p className="mt-1 text-sm text-emerald-800/75">
                Drag the origin dot (solid) or the label anchor (hollow) to reposition.
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-600 hover:border-emerald-300 hover:text-emerald-700"
                >
                  Reset to defaults
                </button>
                <button
                  type="button"
                  onClick={handleSaveAsDefault}
                  className="rounded-full border border-emerald-300 bg-emerald-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-800 transition-colors hover:border-emerald-400 hover:bg-emerald-200/80 hover:text-emerald-900"
                >
                  Save as new default
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!isDirty}
                  className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide shadow-sm transition-colors ${
                    isDirty
                      ? "bg-emerald-500 text-white hover:bg-emerald-600"
                      : "bg-emerald-200 text-emerald-700 cursor-not-allowed"
                  }`}
                >
                  Save changes
                </button>
              </div>
              <p className="text-xs text-emerald-800/70 sm:text-right">
                Saved defaults live in this device&apos;s browser storage, so they persist across app updates and redeployments
                unless the local data is cleared.
              </p>
            </div>
          </div>

          {status ? (
            <div
              className={`rounded-2xl px-4 py-3 text-sm ${
                status.tone === "error"
                  ? "border border-red-200 bg-red-50 text-red-700"
                  : "border border-emerald-200 bg-emerald-50 text-emerald-800"
              }`}
            >
              {status.message}
            </div>
          ) : null}

          <div className="relative mx-auto aspect-[3/5] w-full max-w-xl overflow-hidden rounded-[2.25rem] border border-emerald-100 bg-gradient-to-b from-emerald-50 via-white to-emerald-100 shadow-inner">
            {baseImage ? (
              <img
                src={baseImage}
                alt="Front anatomy silhouette"
                className="h-full w-full select-none object-contain"
                style={{ filter: "grayscale(1) saturate(0.7) brightness(1.05)" }}
                draggable={false}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-emerald-500">
                Anatomy illustration unavailable
              </div>
            )}

            <svg
              ref={svgRef}
              viewBox="0 0 100 100"
              className="absolute inset-0 h-full w-full"
              preserveAspectRatio="xMidYMid meet"
            >
              {measurementFields.map(({ id, point, anchor }) => {
                const isActive = id === selectedFieldId;
                return (
                  <g key={id} className={isActive ? "opacity-100" : "opacity-40"}>
                    <line
                      x1={point.x}
                      y1={point.y}
                      x2={anchor.x}
                      y2={anchor.y}
                      stroke="#ef4444"
                      strokeWidth={isActive ? 1.8 : 1.2}
                      strokeLinecap="round"
                    />
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={isActive ? 3.2 : 2.6}
                      fill="#ef4444"
                      stroke="#ffffff"
                      strokeWidth={1}
                      style={{ cursor: isActive ? "grab" : "default" }}
                      onPointerDown={isActive ? handleDragStart(id, "point") : undefined}
                    />
                    <circle
                      cx={anchor.x}
                      cy={anchor.y}
                      r={isActive ? 2.6 : 2}
                      fill="#fca5a5"
                      stroke="#ffffff"
                      strokeWidth={0.8}
                      style={{ cursor: isActive ? "grab" : "default" }}
                      onPointerDown={isActive ? handleDragStart(id, "anchor") : undefined}
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="grid gap-4 rounded-2xl border border-emerald-100 bg-white/90 p-4">
            <div className="grid grid-cols-2 items-center gap-3 text-sm text-emerald-800/80">
              <span className="font-semibold text-emerald-900">Active area</span>
              <span>{selectedField?.label}</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {["point", "anchor"].map((target) => (
                <div key={target} className="space-y-2 rounded-xl border border-emerald-100 bg-white/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-500">
                    {target === "point" ? "Origin point" : "Label anchor"}
                  </p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {["x", "y"].map((axis) => (
                      <label key={axis} className="space-y-1">
                        <span className="text-xs font-medium uppercase tracking-widest text-emerald-700">{axis.toUpperCase()}</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          value={Number.parseFloat(
                            positions[selectedField.id]?.[target]?.[axis] ?? selectedField[target][axis]
                          ).toFixed(1)}
                          onChange={handleManualChange(selectedField.id, target, axis)}
                          className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-900 shadow-inner focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
