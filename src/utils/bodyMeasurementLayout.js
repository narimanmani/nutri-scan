export const BODY_MEASUREMENT_STORAGE_KEY = "bodyMeasurementPositions";
export const BODY_MEASUREMENT_DEFAULT_KEY = "bodyMeasurementDefaultPositions";

export const DEFAULT_MEASUREMENT_FIELDS = [
  {
    id: "chest",
    label: "Chest",
    description: "Measure around the fullest part of your chest, keeping the tape level.",
    point: { x: 50, y: 30 },
    anchor: { x: 82, y: 30 },
  },
  {
    id: "shoulder",
    label: "Shoulders",
    description: "Measure across the broadest part of your shoulders, keeping the tape horizontal.",
    point: { x: 50, y: 24 },
    anchor: { x: 82, y: 24 },
  },
  {
    id: "waist",
    label: "Waist",
    description: "Measure around your natural waistline, just above the belly button.",
    point: { x: 50, y: 47 },
    anchor: { x: 82, y: 47 },
  },
  {
    id: "abdomen",
    label: "Abdomen",
    description: "Measure the widest part of your abdomen while standing relaxed.",
    point: { x: 50, y: 54 },
    anchor: { x: 82, y: 54 },
  },
  {
    id: "hips",
    label: "Hips",
    description: "Measure around the fullest part of your hips and glutes.",
    point: { x: 50, y: 63 },
    anchor: { x: 82, y: 63 },
  },
  {
    id: "leftArm",
    label: "Left Arm",
    description: "Measure around the midpoint of your upper arm while relaxed.",
    point: { x: 35, y: 38 },
    anchor: { x: 18, y: 38 },
  },
  {
    id: "rightArm",
    label: "Right Arm",
    description: "Measure around the midpoint of your upper arm while relaxed.",
    point: { x: 65, y: 38 },
    anchor: { x: 82, y: 38 },
  },
  {
    id: "leftThigh",
    label: "Left Thigh",
    description: "Measure around the thickest part of your upper thigh.",
    point: { x: 40, y: 72 },
    anchor: { x: 22, y: 72 },
  },
  {
    id: "rightThigh",
    label: "Right Thigh",
    description: "Measure around the thickest part of your upper thigh.",
    point: { x: 60, y: 72 },
    anchor: { x: 78, y: 72 },
  },
];

export function createDefaultMeasurementPositions() {
  return DEFAULT_MEASUREMENT_FIELDS.reduce((accumulator, field) => {
    accumulator[field.id] = {
      point: { ...field.point },
      anchor: { ...field.anchor },
    };
    return accumulator;
  }, {});
}

function clampPercentage(value) {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.min(Math.max(numeric, 0), 100);
}

export function normalizeMeasurementPositions(positions) {
  const baseline = createDefaultMeasurementPositions();

  return DEFAULT_MEASUREMENT_FIELDS.reduce((accumulator, field) => {
    const override = positions?.[field.id];
    const baselineEntry = baseline[field.id];

    accumulator[field.id] = {
      point: {
        x: clampPercentage(override?.point?.x ?? baselineEntry.point.x),
        y: clampPercentage(override?.point?.y ?? baselineEntry.point.y),
      },
      anchor: {
        x: clampPercentage(override?.anchor?.x ?? baselineEntry.anchor.x),
        y: clampPercentage(override?.anchor?.y ?? baselineEntry.anchor.y),
      },
    };

    return accumulator;
  }, {});
}

export function loadMeasurementPositions() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(BODY_MEASUREMENT_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return normalizeMeasurementPositions(parsed);
  } catch (error) {
    console.warn("Failed to parse stored measurement positions", error);
    return null;
  }
}

export function saveMeasurementPositions(positions) {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = normalizeMeasurementPositions(positions);
  window.localStorage.setItem(
    BODY_MEASUREMENT_STORAGE_KEY,
    JSON.stringify(normalized)
  );
}

export function clearMeasurementPositions() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(BODY_MEASUREMENT_STORAGE_KEY);
}

export function loadDefaultMeasurementOverride() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(BODY_MEASUREMENT_DEFAULT_KEY);
    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return normalizeMeasurementPositions(parsed);
  } catch (error) {
    console.warn("Failed to parse stored default measurement positions", error);
    return null;
  }
}

export function saveDefaultMeasurementPositions(positions) {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = normalizeMeasurementPositions(positions);
  window.localStorage.setItem(
    BODY_MEASUREMENT_DEFAULT_KEY,
    JSON.stringify(normalized)
  );
}

export function getDefaultMeasurementPositions() {
  const override = loadDefaultMeasurementOverride();
  if (override) {
    return override;
  }

  return createDefaultMeasurementPositions();
}

export function mergeFieldsWithPositions(fields, positions) {
  if (!positions) {
    return fields;
  }

  return fields.map((field) => {
    const override = positions[field.id];
    if (!override) {
      return field;
    }

    return {
      ...field,
      point: override.point ? { ...field.point, ...override.point } : field.point,
      anchor: override.anchor ? { ...field.anchor, ...override.anchor } : field.anchor,
    };
  });
}
