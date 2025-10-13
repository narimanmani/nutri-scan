import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getSilhouetteAsset } from "@/utils/wgerAssets.js";
import {
  DEFAULT_MEASUREMENT_FIELDS,
  getDefaultMeasurementPositions,
  loadMeasurementPositions,
  mergeFieldsWithPositions,
} from "@/utils/bodyMeasurementLayout.js";
import { saveMeasurementEntry } from "@/utils/measurementHistory.js";
import { createPageUrl } from "@/utils";

function createInitialValues(fields) {
  return fields.reduce((acc, field) => {
    acc[field.id] = "";
    return acc;
  }, {});
}

const measurementKeyMap = {
  hips: "hip",
};

function convertLength(value, unit) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return unit === "in" ? value * 2.54 : value;
}

function convertWeight(value, unit) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return unit === "lb" ? value * 0.45359237 : value;
}

function formatNumber(value, digits = 1) {
  return Number.parseFloat(value).toFixed(digits);
}

export default function BodyMeasurements() {
  const [activeField, setActiveField] = useState(null);
  const [values, setValues] = useState(() => createInitialValues(DEFAULT_MEASUREMENT_FIELDS));
  const [unit, setUnit] = useState("cm");
  const [weightUnit, setWeightUnit] = useState("kg");
  const [profile, setProfile] = useState({ gender: "", age: "", height: "", weight: "" });
  const [status, setStatus] = useState(null);
  const [positions, setPositions] = useState(null);

  const baseImage = useMemo(() => getSilhouetteAsset("front"), []);

  useEffect(() => {
    let isMounted = true;

    loadMeasurementPositions()
      .then((stored) => {
        if (!isMounted) return;
        if (stored) {
          setPositions(stored);
          return;
        }
        setPositions(getDefaultMeasurementPositions());
      })
      .catch(() => {
        if (isMounted) {
          setPositions(getDefaultMeasurementPositions());
        }
      });

    return () => {
      isMounted = false;
    };
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

  const handleProfileChange = (field) => (event) => {
    const { value } = event.target;
    setProfile((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const handleSaveMeasurements = async () => {
    const errors = [];

    const gender = profile.gender;
    if (!gender) {
      errors.push("Select a gender to personalise the analytics.");
    }

    const ageValue = Number.parseInt(profile.age, 10);
    if (!Number.isFinite(ageValue) || ageValue <= 0) {
      errors.push("Enter a valid age.");
    }

    const heightValue = Number.parseFloat(profile.height);
    const convertedHeight = convertLength(heightValue, unit);
    if (!Number.isFinite(convertedHeight) || convertedHeight <= 0) {
      errors.push("Enter a valid height measurement.");
    }

    const weightValue = Number.parseFloat(profile.weight);
    const convertedWeight = convertWeight(weightValue, weightUnit);
    if (!Number.isFinite(convertedWeight) || convertedWeight <= 0) {
      errors.push("Enter a valid weight measurement.");
    }

    const normalizedMeasurements = {};
    DEFAULT_MEASUREMENT_FIELDS.forEach((field) => {
      const rawValue = Number.parseFloat(values[field.id]);
      if (!Number.isFinite(rawValue) || rawValue <= 0) {
        return;
      }

      const key = measurementKeyMap[field.id] ?? field.id;
      const converted = convertLength(rawValue, unit);
      if (!Number.isFinite(converted) || converted <= 0) {
        return;
      }

      normalizedMeasurements[key] = Number.parseFloat(converted.toFixed(2));
    });

    ["waist", "hip", "chest"].forEach((essential) => {
      if (!normalizedMeasurements[essential]) {
        errors.push(`Provide a ${essential} measurement to run the body-shape analysis.`);
      }
    });

    if (errors.length > 0) {
      setStatus({ type: "error", message: errors.join(" ") });
      return;
    }

    const entry = {
      id: `user-${Date.now()}`,
      label: "User Measurement",
      source: "User",
      recordedAt: new Date().toISOString(),
      profile: {
        gender,
        age: ageValue,
      },
      bodyStats: {
        heightCm: Number.parseFloat(convertedHeight.toFixed(2)),
        weightKg: Number.parseFloat(convertedWeight.toFixed(2)),
      },
      measurements: normalizedMeasurements,
      unit: "cm",
      weightUnit: "kg",
    };

    try {
      await saveMeasurementEntry(entry);
      setStatus({
        type: "success",
        message: `Measurements saved! Height ${formatNumber(convertedHeight)} cm, weight ${formatNumber(
          convertedWeight
        )} kg. View analytics in the Measurement Intelligence section.`,
      });

      setValues(createInitialValues(DEFAULT_MEASUREMENT_FIELDS));
      setProfile({ gender: "", age: "", height: "", weight: "" });
    } catch (error) {
      console.error("Failed to save measurement entry", error);
      setStatus({ type: "error", message: "We could not save your measurements. Please try again." });
    }
  };

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
                    <circle cx={anchor.x} cy={anchor.y} r={2.8} fill="#ef4444" stroke="#ffffff" strokeWidth={0.9} />
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

          <div className="grid gap-6">
            <div className="grid gap-4 rounded-2xl border border-emerald-100 bg-white p-4">
              <div>
                <h3 className="text-lg font-semibold text-emerald-900">Profile</h3>
                <p className="mt-1 text-xs text-emerald-800/70">
                  Add context for smarter insights—gender, age, height, and weight feed the body-shape and somatotype analytics.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="block text-sm font-semibold text-emerald-900">Gender</span>
                  <select
                    value={profile.gender}
                    onChange={handleProfileChange("gender")}
                    className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-900 shadow-inner focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  >
                    <option value="">Select</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="non-binary">Non-binary</option>
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="block text-sm font-semibold text-emerald-900">Age</span>
                  <input
                    type="number"
                    min={1}
                    value={profile.age}
                    onChange={handleProfileChange("age")}
                    className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-900 shadow-inner focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                    placeholder="30"
                  />
                </label>

                <label className="space-y-2">
                  <span className="block text-sm font-semibold text-emerald-900">Height</span>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={profile.height}
                      onChange={handleProfileChange("height")}
                      className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-900 shadow-inner focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                      placeholder="175"
                    />
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-600">
                      {unit}
                    </span>
                  </div>
                </label>

                <label className="space-y-2">
                  <span className="block text-sm font-semibold text-emerald-900">Weight</span>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={profile.weight}
                      onChange={handleProfileChange("weight")}
                      className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-900 shadow-inner focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                      placeholder="70"
                    />
                    <select
                      value={weightUnit}
                      onChange={(event) => setWeightUnit(event.target.value)}
                      className="rounded-full border border-emerald-200 bg-white px-2 py-1 text-xs font-semibold uppercase tracking-widest text-emerald-700 focus:outline-none"
                    >
                      <option value="kg">kg</option>
                      <option value="lb">lb</option>
                    </select>
                  </div>
                </label>
              </div>
            </div>

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

          {status ? (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm ${
                status.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {status.message}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={handleSaveMeasurements}
              className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            >
              Save measurements
            </button>

            <Link
              to={createPageUrl("Measurement Intelligence")}
              className="text-sm font-semibold text-emerald-700 underline-offset-4 hover:underline"
            >
              View measurement intelligence
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
