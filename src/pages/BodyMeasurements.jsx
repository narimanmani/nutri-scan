import { useEffect, useMemo, useState } from "react";
import { getSilhouetteAsset } from "@/utils/wgerAssets.js";
import {
  DEFAULT_MEASUREMENT_FIELDS,
  loadMeasurementPositions,
  mergeFieldsWithPositions,
} from "@/utils/bodyMeasurementLayout.js";

function createInitialValues(fields) {
  return fields.reduce((acc, field) => {
    acc[field.id] = "";
    return acc;
  }, {});
}

export default function BodyMeasurements() {
  const [activeField, setActiveField] = useState(null);
  const [values, setValues] = useState(() => createInitialValues(DEFAULT_MEASUREMENT_FIELDS));
  const [unit, setUnit] = useState("cm");
  const [positions, setPositions] = useState(null);

  const baseImage = useMemo(() => getSilhouetteAsset("front"), []);

  useEffect(() => {
    const storedPositions = loadMeasurementPositions();
    if (storedPositions) {
      setPositions(storedPositions);
    }
  }, []);

  const measurementFields = useMemo(
    () => mergeFieldsWithPositions(DEFAULT_MEASUREMENT_FIELDS, positions),
    [positions]
  );

  const handleChange = (id) => (event) => {
    setValues((prev) => ({
      ...prev,
      [id]: event.target.value,
    }));
  };

  const handleFocus = (id) => () => setActiveField(id);
  const handleBlur = () => setActiveField(null);

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-10">
      <header className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-500">Measurements</p>
        <h1 className="text-3xl font-bold text-emerald-950 sm:text-4xl">Body Measurement Tracker</h1>
        <p className="max-w-3xl text-base text-emerald-900/80 sm:text-lg">
          Capture precise body measurements to visualize progress and tailor your nutrition or training plan. Focus on one
          area at a time—the anatomy explorer will guide you with a live highlight for the selected field.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(22rem,1fr)_minmax(0,1fr)] lg:items-start">
        <section className="space-y-6 rounded-3xl border border-emerald-100 bg-white/70 p-6 shadow-lg shadow-emerald-100/60">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-emerald-900">Anatomy Explorer</h2>
              <p className="mt-1 text-sm text-emerald-800/80">
                Click into a measurement field to see exactly where to place your tape.
              </p>
            </div>
          </div>

          <div className="relative mx-auto aspect-[3/5] w-full max-w-sm overflow-hidden rounded-[2.25rem] border border-emerald-100 bg-gradient-to-b from-emerald-50 via-white to-emerald-100 shadow-inner lg:mx-0 lg:max-w-none">
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

            <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet">
              {measurementFields.map(({ id, point, anchor }) => {
                const isActive = id === activeField;
                return (
                  <g
                    key={id}
                    className={`transition-all duration-300 ${
                      isActive ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    <line
                      x1={point.x}
                      y1={point.y}
                      x2={anchor.x}
                      y2={anchor.y}
                      stroke="#ef4444"
                      strokeWidth={1.4}
                      strokeLinecap="round"
                    />
                    <circle cx={point.x} cy={point.y} r={2.8} fill="#ef4444" stroke="#ffffff" strokeWidth={0.9} />
                    <circle cx={anchor.x} cy={anchor.y} r={1.8} fill="#fca5a5" />
                  </g>
                );
              })}
            </svg>
          </div>
        </section>

        <section className="space-y-6 rounded-3xl border border-emerald-100 bg-white/80 p-6 shadow-lg shadow-emerald-100/60">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-emerald-900">Enter measurements</h2>
              <p className="text-sm text-emerald-800/75">
                Record measurements in your preferred unit. Focus fields will highlight the body location.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-600 shadow-sm">
              <span>Unit</span>
              <select
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                className="rounded-full border border-emerald-200 bg-white px-2 py-1 text-xs font-semibold uppercase tracking-widest text-emerald-700 focus:outline-none"
              >
                <option value="cm">cm</option>
                <option value="in">in</option>
              </select>
            </label>
          </div>

          <div className="grid gap-4">
            {measurementFields.map(({ id, label, description }) => (
              <div
                key={id}
                className={`rounded-2xl border px-4 py-4 transition-shadow ${
                  activeField === id ? "border-emerald-300 shadow-lg shadow-emerald-100" : "border-emerald-100 bg-white"
                }`}
              >
                <label htmlFor={id} className="block text-sm font-semibold text-emerald-900">
                  {label}
                </label>
                <p className="mt-1 text-xs text-emerald-800/70">{description}</p>
                <div className="mt-3 flex items-center gap-3">
                  <input
                    id={id}
                    name={id}
                    type="number"
                    min={0}
                    step="any"
                    value={values[id]}
                    onChange={handleChange(id)}
                    onFocus={handleFocus(id)}
                    onBlur={handleBlur}
                    className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-900 shadow-inner focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                    placeholder="0.0"
                  />
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-600">
                    {unit}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
