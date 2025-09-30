import { useEffect, useMemo, useState } from "react";
import { loadMeasurementHistory } from "@/utils/measurementHistory.js";
import { SAMPLE_MEASUREMENT_HISTORY } from "@/data/sampleMeasurementHistory.js";

const HEIGHT_RANGE_CM = { min: 120, max: 230 };
const WEIGHT_RANGE_KG = { min: 30, max: 250 };
const MEASUREMENT_RANGE_CM = { min: 20, max: 200 };

const SHAPE_TIPS = {
  Apple: [
    "Prioritise waist-friendly nutrition: higher fibre, lower refined sugars, and consistent hydration.",
    "Pair cardio intervals with core stability work (planks, Pallof presses) to trim central adiposity.",
    "Track stress and sleep—elevated cortisol often drives central fat storage.",
  ],
  Pear: [
    "Lean into lower-body strength training (squats, hip thrusts) to build glute support.",
    "Balance macros with slightly higher protein to maintain upper-body tone.",
    "Include circulation boosters (walking, cycling) to mobilise lower-body fat stores.",
  ],
  Rectangle: [
    "Use hypertrophy blocks for shoulders and glutes to create more curvature.",
    "Dial in nutrition with slight caloric surplus and progressive overload programming.",
    "Incorporate waist-shaping core work (vacuum breathing, anti-rotation exercises).",
  ],
  "Inverted Triangle": [
    "Emphasise lower-body hypertrophy and posterior-chain work to balance proportions.",
    "Keep upper-body training high-quality but moderate in volume to avoid over-dominance.",
    "Prioritise recovery and mobility for the shoulders to prevent overuse.",
  ],
  Hourglass: [
    "Maintain muscle balance with alternating upper/lower splits and core stability work.",
    "Stay consistent with protein timing to preserve lean curves during fat-loss phases.",
    "Use waist-friendly conditioning (rowing, pilates, loaded carries) to reinforce symmetry.",
  ],
};

const SOMATOTYPE_TIPS = {
  Endomorph: [
    "Adopt moderate calorie deficits with high protein and plenty of non-starchy vegetables.",
    "Combine resistance training with interval cardio three times per week.",
    "Monitor carbohydrate timing—cluster carbs around training for better utilisation.",
  ],
  Mesomorph: [
    "Leverage structured strength programs (push/pull/legs or upper/lower splits).",
    "Maintain a performance-focused diet with balanced macros and peri-workout nutrition.",
    "Schedule deload weeks—mesomorphs can overtrain when progress feels easy.",
  ],
  Ectomorph: [
    "Increase calorie density with healthy fats and frequent meals/snacks.",
    "Focus on compound lifts in lower rep ranges to stimulate muscle gain.",
    "Prioritise sleep and reduce long-duration cardio to conserve energy for growth.",
  ],
  Balanced: [
    "Use periodised training blocks to explore different goals across the year.",
    "Keep nutrition flexible but anchored by adequate protein at each meal.",
    "Regularly reassess metrics to stay aligned with evolving goals.",
  ],
};

function buildMeasurementHistory() {
  const saved = loadMeasurementHistory();
  const combined = [...SAMPLE_MEASUREMENT_HISTORY, ...saved];
  return combined
    .map((entry) => normaliseEntry(entry))
    .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
}

function normaliseEntry(entry) {
  const measurements = Object.entries(entry.measurements || {}).reduce((acc, [key, value]) => {
    if (value == null || value === "") {
      return acc;
    }

    const normalisedKey = key.toLowerCase();
    const numericValue = Number.parseFloat(value);
    if (!Number.isFinite(numericValue)) {
      return acc;
    }

    acc[normalisedKey.replace(/\s+/g, "")] = numericValue;
    if (normalisedKey === "hips" && acc.hip == null) {
      acc.hip = numericValue;
    }

    return acc;
  }, {});

  return {
    id: entry.id ?? `entry-${Math.random().toString(36).slice(2, 10)}`,
    label: entry.label || (entry.source === "User" ? "User Measurement" : "Measurement"),
    source: entry.source ?? "Unknown",
    recordedAt: entry.recordedAt ?? new Date().toISOString(),
    profile: {
      gender: entry.profile?.gender ?? "unspecified",
      age: entry.profile?.age ?? null,
    },
    bodyStats: {
      heightCm: entry.bodyStats?.heightCm ?? null,
      weightKg: entry.bodyStats?.weightKg ?? null,
    },
    measurements,
    survey: entry.survey || null,
    advanced: entry.advanced || null,
    notes: entry.notes || null,
  };
}

function preprocessEntry(entry) {
  const sanitizedMeasurements = {};
  const warnings = [];
  const errors = [];

  const height = Number.isFinite(entry.bodyStats.heightCm) ? entry.bodyStats.heightCm : null;
  const weight = Number.isFinite(entry.bodyStats.weightKg) ? entry.bodyStats.weightKg : null;

  if (!height) {
    errors.push("Height missing or invalid.");
  } else if (height < HEIGHT_RANGE_CM.min || height > HEIGHT_RANGE_CM.max) {
    errors.push("Height outside plausible range after conversion.");
  }

  if (!weight) {
    errors.push("Weight missing or invalid.");
  } else if (weight < WEIGHT_RANGE_KG.min || weight > WEIGHT_RANGE_KG.max) {
    errors.push("Weight outside plausible range after conversion.");
  }

  Object.entries(entry.measurements).forEach(([key, value]) => {
    if (!Number.isFinite(value)) {
      return;
    }

    const rounded = Number.parseFloat(value.toFixed(2));
    if (rounded < MEASUREMENT_RANGE_CM.min || rounded > MEASUREMENT_RANGE_CM.max) {
      warnings.push(`Discarded ${key} measurement (${rounded} cm) as an outlier.`);
      return;
    }

    sanitizedMeasurements[key] = rounded;
  });

  ["waist", "hip", "chest"].forEach((key) => {
    if (!sanitizedMeasurements[key]) {
      errors.push(`${key.charAt(0).toUpperCase() + key.slice(1)} measurement unavailable after preprocessing.`);
    }
  });

  const heightMeters = height ? height / 100 : null;
  const bmi = heightMeters && weight ? Number.parseFloat((weight / (heightMeters ** 2)).toFixed(1)) : null;

  return {
    sanitized: {
      ...entry,
      bodyStats: {
        heightCm: height,
        weightKg: weight,
        bmi,
      },
      measurements: sanitizedMeasurements,
    },
    warnings,
    errors,
  };
}

function computeRatios(entry) {
  const { measurements, bodyStats } = entry;
  const waist = measurements.waist ?? null;
  const hip = measurements.hip ?? null;
  const shoulder = measurements.shoulder ?? measurements.shoulders ?? null;
  const chest = measurements.chest ?? measurements.bust ?? null;
  const height = bodyStats.heightCm ?? null;

  const ratios = {
    WHR: waist && hip ? waist / hip : null,
    WHtR: waist && height ? waist / height : null,
    SHR: shoulder && hip ? shoulder / hip : null,
    BHR: chest && hip ? chest / hip : null,
    SWR: shoulder && waist ? shoulder / waist : null,
  };

  return Object.entries(ratios).reduce((acc, [key, value]) => {
    acc[key] = Number.isFinite(value) ? Number.parseFloat(value.toFixed(3)) : null;
    return acc;
  }, {});
}

function nearEqual(value, target, tolerance) {
  if (value == null) {
    return false;
  }
  return Math.abs(value - target) <= tolerance;
}

function zScore(value, threshold) {
  if (value == null || threshold == null || threshold === 0) {
    return 0;
  }
  return (value - threshold) / threshold;
}

function indicator(condition, weight = 1) {
  return condition ? weight : 0;
}

function normAbs(values) {
  const valid = values.filter((value) => value != null);
  if (!valid.length) {
    return 1;
  }
  const total = valid.reduce((sum, value) => sum + Math.abs(value), 0);
  return Math.min(1, total / valid.length);
}

function softmax(scores) {
  const values = Object.values(scores);
  const maxScore = Math.max(...values);
  const exponentials = Object.fromEntries(
    Object.entries(scores).map(([key, score]) => [key, Math.exp(score - maxScore)])
  );
  const sum = Object.values(exponentials).reduce((acc, value) => acc + value, 0);
  return Object.fromEntries(
    Object.entries(exponentials).map(([key, value]) => [key, value / sum])
  );
}

function classifyBodyShape(entry, ratios) {
  const waist = entry.measurements.waist;
  const hip = entry.measurements.hip;
  const chest = entry.measurements.chest ?? entry.measurements.bust ?? null;
  const height = entry.bodyStats.heightCm;
  const gender = entry.profile.gender?.toLowerCase() ?? "unspecified";

  if (waist == null || hip == null || chest == null || height == null) {
    return {
      available: false,
      reason: "Insufficient data to compute body-shape ratios.",
      ratios,
    };
  }

  const WHR = ratios.WHR;
  const WHtR = ratios.WHtR;
  const SHR = ratios.SHR;
  const BHR = ratios.BHR;

  const WHRThreshold = gender === "female" ? 0.85 : 0.95;
  let primary = null;
  let ruleReason = null;

  if ((WHtR != null && WHtR >= 0.5) || (WHR != null && WHR >= WHRThreshold)) {
    const upperDominant = (BHR != null && BHR >= 0.95) || (SHR != null && SHR >= 1.0);
    if (upperDominant) {
      primary = "Apple";
      ruleReason = `Elevated central ratios (WHtR ${formatRatio(WHtR)} / WHR ${formatRatio(WHR)}) with upper-body dominance.`;
    }
  }

  if (!primary) {
    const inverted = (SHR != null && SHR >= 1.05) || (BHR != null && BHR >= 1.05);
    if (inverted) {
      primary = "Inverted Triangle";
      ruleReason = `Shoulder or chest exceed hips (SHR ${formatRatio(SHR)} / BHR ${formatRatio(BHR)}).`;
    }
  }

  if (!primary) {
    const pear = WHR != null && WHR < 0.8 && ((BHR != null && BHR <= 0.85) || (SHR != null && SHR < 0.9));
    if (pear) {
      primary = "Pear";
      ruleReason = `Lower WHR (${formatRatio(WHR)}) with hips dominating shoulders.`;
    }
  }

  if (!primary) {
    const rectangle =
      nearEqual(WHR, 0.825, 0.025) &&
      nearEqual(BHR, 1, 0.05) &&
      (SHR == null || nearEqual(SHR, 1, 0.05));
    if (rectangle) {
      primary = "Rectangle";
      ruleReason = "Measurements closely aligned, suggesting even proportions.";
    }
  }

  if (!primary) {
    const hourglass = nearEqual(BHR, 1, 0.05) && WHR != null && WHR <= 0.8;
    if (hourglass) {
      primary = "Hourglass";
      ruleReason = `Balanced hips/shoulders with clearly smaller waist (WHR ${formatRatio(WHR)}).`;
    }
  }

  const scores = {
    Apple:
      Math.max(zScore(WHtR, 0.5), zScore(WHR, WHRThreshold)) +
      indicator((BHR != null && BHR >= 0.95) || (SHR != null && SHR >= 1.0), 0.3),
    Pear:
      indicator(WHR != null && WHR < 0.8, 1) +
      indicator((BHR != null && BHR <= 0.85) || (SHR != null && SHR < 0.9), 0.3),
    Rectangle:
      1 -
      normAbs([
        BHR != null ? BHR - 1 : null,
        SHR != null ? SHR - 1 : null,
        WHR != null ? WHR - 0.825 : null,
      ]),
    "Inverted Triangle": Math.max(zScore(SHR ?? 1, 1.05), zScore(BHR, 1.05)),
    Hourglass:
      (BHR != null ? 1 - Math.abs(BHR - 1) : 0) +
      indicator(WHR != null && WHR <= 0.8, 0.5),
  };

  const probabilities = softmax(scores);
  const sorted = Object.entries(probabilities)
    .map(([shape, probability]) => ({ shape, probability }))
    .sort((a, b) => b.probability - a.probability);

  if (!primary && sorted.length) {
    primary = sorted[0].shape;
    ruleReason = "Selected via probability tie-break.";
  }

  return {
    available: true,
    primary,
    confidence: sorted.length ? sorted[0].probability : null,
    reason: ruleReason,
    ratios,
    probabilities: sorted,
  };
}

function computeHeathCarter(advancedData, heightCm, weightKg) {
  if (!advancedData || !advancedData.skinfolds || !advancedData.circumferences || !advancedData.boneBreadths) {
    return null;
  }

  const { skinfolds, circumferences, boneBreadths } = advancedData;
  const requiredSkinfolds = ["triceps", "subscapular", "supraspinale", "calf"];
  const requiredCircumferences = ["flexedArm", "calf", "thigh"];
  const requiredBreadths = ["humerus", "femur"];

  if (
    !requiredSkinfolds.every((key) => Number.isFinite(skinfolds[key])) ||
    !requiredCircumferences.every((key) => Number.isFinite(circumferences[key])) ||
    !requiredBreadths.every((key) => Number.isFinite(boneBreadths[key])) ||
    !Number.isFinite(heightCm) ||
    !Number.isFinite(weightKg)
  ) {
    return null;
  }

  const sumSkf = skinfolds.triceps + skinfolds.subscapular + skinfolds.supraspinale;
  const endomorphy =
    -0.7182 +
    0.1451 * sumSkf -
    0.00068 * sumSkf ** 2 +
    0.0000014 * sumSkf ** 3;

  const correctedArm = circumferences.flexedArm - skinfolds.triceps / 10;
  const correctedCalf = circumferences.calf - skinfolds.calf / 10;

  const mesomorphy =
    0.858 * boneBreadths.humerus +
    0.601 * boneBreadths.femur +
    0.188 * correctedArm +
    0.161 * correctedCalf -
    0.131 * heightCm +
    4.5;

  const HWR = heightCm / Math.cbrt(weightKg);
  let ectomorphy = 0;
  if (HWR > 40.75) {
    ectomorphy = 0.732 * HWR - 28.58;
  } else if (HWR > 38.25) {
    ectomorphy = 0.463 * HWR - 17.63;
  } else {
    ectomorphy = 0.1;
  }

  return {
    endomorphy: Number.parseFloat(Math.max(0, endomorphy).toFixed(1)),
    mesomorphy: Number.parseFloat(Math.max(0, mesomorphy).toFixed(1)),
    ectomorphy: Number.parseFloat(Math.max(0, ectomorphy).toFixed(1)),
  };
}

function normaliseToPercent(scores) {
  const total = Object.values(scores).reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return {
      Endomorph: 1 / 3,
      Mesomorph: 1 / 3,
      Ectomorph: 1 / 3,
    };
  }

  return Object.fromEntries(
    Object.entries(scores).map(([key, value]) => [key, value / total])
  );
}

function pickDominantLabel(percentages) {
  const sorted = Object.entries(percentages)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
  const [first, second] = sorted;

  if (!first) {
    return { label: "Balanced", ranking: sorted };
  }

  if (first.value >= 0.6) {
    return { label: `${first.label} dominant`, ranking: sorted };
  }

  if (second && second.value >= 0.4) {
    return { label: `${first.label}-${second.label} blend`, ranking: sorted };
  }

  return { label: "Balanced", ranking: sorted };
}

function classifySomatotype(entry, ratios) {
  const heightCm = entry.bodyStats.heightCm;
  const weightKg = entry.bodyStats.weightKg;

  const heathCarter = computeHeathCarter(entry.advanced, heightCm, weightKg);
  if (heathCarter) {
    const percentages = normaliseToPercent({
      Endomorph: heathCarter.endomorphy,
      Mesomorph: heathCarter.mesomorphy,
      Ectomorph: heathCarter.ectomorphy,
    });
    const summary = pickDominantLabel(percentages);
    return {
      method: "Heath-Carter",
      label: summary.label,
      scores: percentages,
      triplet: heathCarter,
      ranking: summary.ranking,
      notes: "Exact Heath–Carter somatotype calculated from full anthropometric data.",
    };
  }

  const points = { Endomorph: 0, Mesomorph: 0, Ectomorph: 0 };

  if (ratios.WHtR != null && ratios.WHtR >= 0.5) {
    points.Endomorph += 2;
  }
  if (ratios.WHR != null && ratios.WHR >= 0.9) {
    points.Endomorph += 1;
  }
  if (entry.bodyStats.bmi && entry.bodyStats.bmi >= 28) {
    points.Endomorph += 1;
  }
  if (entry.survey?.gainFatEasily) {
    points.Endomorph += 2;
  }

  if (entry.survey?.gainMuscleEasily) {
    points.Mesomorph += 2;
  }
  if (entry.survey?.boneStructure === "broad") {
    points.Mesomorph += 1;
  }

  const muscularArm = entry.measurements.leftarm ?? entry.measurements.rightarm ?? entry.measurements.arm ?? null;
  if (muscularArm != null && muscularArm >= 35) {
    points.Mesomorph += 1;
  }
  const muscularThigh = entry.measurements.leftthigh ?? entry.measurements.rightthigh ?? entry.measurements.thigh ?? null;
  if (muscularThigh != null && muscularThigh >= 55) {
    points.Mesomorph += 1;
  }

  const wrist = entry.measurements.wrist ?? null;
  if (wrist != null) {
    if (wrist <= 16) {
      points.Ectomorph += 2;
    } else if (wrist >= 18) {
      points.Mesomorph += 1;
    }
  }

  if (entry.survey?.hardToGainWeight) {
    points.Ectomorph += 2;
  }

  const heightMeters = heightCm ? heightCm / 100 : null;
  if (heightMeters && weightKg) {
    const bmi = weightKg / (heightMeters ** 2);
    if (bmi < 20) {
      points.Ectomorph += 2;
    } else if (bmi >= 24 && bmi <= 27) {
      points.Mesomorph += 1;
    }
  }

  if (ratios.SHR != null && ratios.SHR >= 1.05) {
    points.Mesomorph += 1;
  }
  if (ratios.WHtR != null && ratios.WHtR <= 0.44) {
    points.Ectomorph += 1;
  }

  const percentages = normaliseToPercent(points);
  const summary = pickDominantLabel(percentages);

  return {
    method: "Simplified",
    label: summary.label,
    scores: percentages,
    ranking: summary.ranking,
    notes: "Simplified somatotype estimation using core ratios and survey cues.",
  };
}

function formatRatio(value) {
  if (value == null) {
    return "n/a";
  }
  return value.toFixed(2);
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function formatDate(value) {
  try {
    const date = new Date(value);
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  } catch {
    return value;
  }
}

function buildCombinedTips(shapeResult, somatotypeResult) {
  const tips = new Set();
  if (shapeResult?.primary && SHAPE_TIPS[shapeResult.primary]) {
    SHAPE_TIPS[shapeResult.primary].forEach((tip) => tips.add(tip));
  }

  if (somatotypeResult) {
    const ranking = somatotypeResult.ranking || [];
    ranking.slice(0, 2).forEach(({ label }) => {
      const cleanLabel = label.replace(/ dominant| blend/gi, "");
      if (SOMATOTYPE_TIPS[cleanLabel]) {
        SOMATOTYPE_TIPS[cleanLabel].forEach((tip) => tips.add(tip));
      }
    });
  }

  if (!tips.size) {
    SOMATOTYPE_TIPS.Balanced.forEach((tip) => tips.add(tip));
  }

  return Array.from(tips).slice(0, 6);
}

export default function MeasurementAnalytics() {
  const [history, setHistory] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    const data = buildMeasurementHistory();
    setHistory(data);
    if (data.length) {
      setSelectedId(data[0].id);
    }
  }, []);

  const selectedEntry = useMemo(
    () => history.find((item) => item.id === selectedId) ?? null,
    [history, selectedId]
  );

  const analysis = useMemo(() => {
    if (!selectedEntry) {
      return null;
    }

    const preprocessing = preprocessEntry(selectedEntry);
    if (preprocessing.errors.length) {
      return {
        preprocessing,
        ratios: null,
        shape: {
          available: false,
          reason: preprocessing.errors.join(" "),
          ratios: null,
        },
        somatotype: null,
        tips: [],
      };
    }

    const ratios = computeRatios(preprocessing.sanitized);
    const shape = classifyBodyShape(preprocessing.sanitized, ratios);
    const somatotype = classifySomatotype(preprocessing.sanitized, ratios);
    const tips = buildCombinedTips(shape.available ? shape : null, somatotype);

    return {
      preprocessing,
      ratios,
      shape,
      somatotype,
      tips,
    };
  }, [selectedEntry]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-500">Analytics</p>
        <h1 className="text-3xl font-bold text-emerald-950 sm:text-4xl">Measurement Intelligence</h1>
        <p className="max-w-3xl text-base text-emerald-900/80 sm:text-lg">
          Review captured measurements, validate the data quality, and explore automated body-shape and somatotype assessments.
          Select a record from the history to see the full analysis, probability scores, and tailored guidance.
        </p>
      </header>

      <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white/80 p-6 shadow-lg shadow-emerald-100/60">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-emerald-900">Measurement history</h2>
            <p className="text-sm text-emerald-800/75">Includes saved entries and annotated sample cases for rapid exploration.</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-emerald-100">
            <thead className="bg-emerald-50/60">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-emerald-700">Label</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-emerald-700">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-emerald-700">Gender</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-emerald-700">Age</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-emerald-700">Height (cm)</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-emerald-700">Weight (kg)</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-emerald-700">Key ratios</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-emerald-700">Select</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-100">
              {history.map((entry) => {
                const ratios = computeRatios(entry);
                return (
                  <tr
                    key={entry.id}
                    className={`transition hover:bg-emerald-50/50 ${selectedId === entry.id ? "bg-emerald-50/80" : ""}`}
                  >
                    <td className="px-4 py-3 text-sm font-semibold text-emerald-900">
                      <div>{entry.label}</div>
                      {entry.notes?.expectedShape ? (
                        <p className="text-xs text-emerald-700/70">{entry.notes.expectedShape}</p>
                      ) : null}
                      {entry.notes?.expectedSomatotype ? (
                        <p className="text-xs text-emerald-700/70">{entry.notes.expectedSomatotype}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-sm text-emerald-800/80">{formatDate(entry.recordedAt)}</td>
                    <td className="px-4 py-3 text-sm capitalize text-emerald-800/80">{entry.profile.gender}</td>
                    <td className="px-4 py-3 text-sm text-emerald-800/80">{entry.profile.age ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-emerald-800/80">
                      {entry.bodyStats.heightCm ? entry.bodyStats.heightCm.toFixed(1) : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-emerald-800/80">
                      {entry.bodyStats.weightKg ? entry.bodyStats.weightKg.toFixed(1) : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-emerald-700/80">
                      <div>WHR: {formatRatio(ratios.WHR)}</div>
                      <div>WHtR: {formatRatio(ratios.WHtR)}</div>
                      <div>SHR: {formatRatio(ratios.SHR)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelectedId(entry.id)}
                        className={`rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-wide transition ${
                          selectedId === entry.id
                            ? "bg-emerald-600 text-white shadow"
                            : "border border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                        }`}
                      >
                        {selectedId === entry.id ? "Active" : "Analyse"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {selectedEntry && analysis ? (
        <div className="space-y-8">
          <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white/80 p-6 shadow-lg shadow-emerald-100/60">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-emerald-900">Pre-processing summary</h2>
                <p className="text-sm text-emerald-800/75">
                  All inputs are converted to centimetres and kilograms, validated for plausible ranges, and normalised before
                  analysis.
                </p>
              </div>
            </div>

            <dl className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-emerald-50/80 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Height</dt>
                <dd className="mt-1 text-lg font-semibold text-emerald-900">
                  {analysis.preprocessing.sanitized.bodyStats.heightCm != null
                    ? `${analysis.preprocessing.sanitized.bodyStats.heightCm.toFixed(1)} cm`
                    : "—"}
                </dd>
              </div>
              <div className="rounded-2xl bg-emerald-50/80 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Weight</dt>
                <dd className="mt-1 text-lg font-semibold text-emerald-900">
                  {analysis.preprocessing.sanitized.bodyStats.weightKg != null
                    ? `${analysis.preprocessing.sanitized.bodyStats.weightKg.toFixed(1)} kg`
                    : "—"}
                </dd>
              </div>
              <div className="rounded-2xl bg-emerald-50/80 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-emerald-700">BMI</dt>
                <dd className="mt-1 text-lg font-semibold text-emerald-900">
                  {analysis.preprocessing.sanitized.bodyStats.bmi ?? "—"}
                </dd>
              </div>
            </dl>

            {analysis.preprocessing.warnings.length ? (
              <ul className="mt-4 list-disc space-y-1 pl-6 text-sm text-amber-700">
                {analysis.preprocessing.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-emerald-700/80">All measurements passed validation—no outliers removed.</p>
            )}
          </section>

          <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white/80 p-6 shadow-lg shadow-emerald-100/60">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-emerald-900">Body-shape analysis</h2>
                <p className="text-sm text-emerald-800/75">
                  Deterministic rules run first (Apple → Inverted Triangle → Pear → Rectangle → Hourglass) before applying
                  softmax tie-break scoring.
                </p>
              </div>
            </div>

            {analysis.shape.available ? (
              <div className="space-y-4">
                <div className="rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 p-5 text-white shadow-lg">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-white/80">Body Shape</h3>
                  <p className="mt-2 text-2xl font-bold">
                    {analysis.shape.primary} — {analysis.shape.confidence ? formatPercent(analysis.shape.confidence) : "n/a"}
                  </p>
                  {analysis.shape.reason ? (
                    <p className="mt-2 text-sm text-white/80">Reason: {analysis.shape.reason}</p>
                  ) : null}
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {analysis.shape.probabilities.slice(0, 3).map(({ shape, probability }) => (
                    <div key={shape} className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
                      <p className="text-sm font-semibold text-emerald-900">{shape}</p>
                      <p className="text-lg font-bold text-emerald-700">{formatPercent(probability)}</p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(analysis.ratios).map(([key, value]) => (
                    <div key={key} className="rounded-2xl bg-emerald-50/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{key}</p>
                      <p className="mt-1 text-lg font-semibold text-emerald-900">{formatRatio(value)}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-700">
                {analysis.shape.reason}
              </p>
            )}
          </section>

          {analysis.somatotype ? (
            <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white/80 p-6 shadow-lg shadow-emerald-100/60">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-emerald-900">Somatotype classification</h2>
                  <p className="text-sm text-emerald-800/75">
                    {analysis.somatotype.method === "Heath-Carter"
                      ? "Full Heath–Carter calculation available."
                      : "Simplified scoring applied (survey and circumference cues)."}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-500 p-5 text-white shadow-lg">
                <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-white/80">Somatotype</h3>
                <p className="mt-2 text-2xl font-bold">{analysis.somatotype.label}</p>
                <p className="mt-2 text-sm text-white/80">{analysis.somatotype.notes}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {analysis.somatotype.ranking.map(({ label, value }) => (
                  <div key={label} className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
                    <p className="text-sm font-semibold text-emerald-900">{label}</p>
                    <p className="text-lg font-bold text-emerald-700">{formatPercent(value)}</p>
                  </div>
                ))}
              </div>

              {analysis.somatotype.triplet ? (
                <div className="rounded-2xl bg-emerald-50/80 p-4 text-sm text-emerald-800">
                  Triplet (Endomorphy, Mesomorphy, Ectomorphy): {analysis.somatotype.triplet.endomorphy} / {analysis.somatotype.triplet.mesomorphy} /
                  {" "}
                  {analysis.somatotype.triplet.ectomorphy}
                </div>
              ) : null}
            </section>
          ) : null}

          {analysis.tips.length ? (
            <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white/80 p-6 shadow-lg shadow-emerald-100/60">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-emerald-900">Tailored coaching cues</h2>
                  <p className="text-sm text-emerald-800/75">
                    Quick-win strategies blending body-shape focus and somatotype tendencies.
                  </p>
                </div>
              </div>

              <ul className="grid gap-4 sm:grid-cols-2">
                {analysis.tips.map((tip) => (
                  <li key={tip} className="rounded-2xl bg-emerald-50/80 p-4 text-sm text-emerald-900">
                    {tip}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : (
        <p className="rounded-3xl border border-emerald-100 bg-white/60 p-6 text-sm text-emerald-800/80">
          Select a record from the measurement history to activate the analysis dashboard.
        </p>
      )}
    </div>
  );
}
