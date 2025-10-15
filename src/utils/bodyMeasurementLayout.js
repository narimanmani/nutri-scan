import { get, put } from '@/api/client.js';

export const BODY_MEASUREMENT_STORAGE_KEY = 'bodyMeasurementPositions';
export const BODY_MEASUREMENT_DEFAULT_KEY = 'bodyMeasurementDefaultPositions';

export const DEFAULT_MEASUREMENT_FIELDS = [
  {
    id: 'chest',
    label: 'Chest',
    description: 'Measure around the fullest part of your chest, keeping the tape level.',
    point: { x: 50, y: 30 },
    anchor: { x: 82, y: 30 },
  },
  {
    id: 'shoulder',
    label: 'Shoulders',
    description: 'Measure across the broadest part of your shoulders, keeping the tape horizontal.',
    point: { x: 50, y: 24 },
    anchor: { x: 82, y: 24 },
  },
  {
    id: 'waist',
    label: 'Waist',
    description: 'Measure around your natural waistline, just above the belly button.',
    point: { x: 50, y: 47 },
    anchor: { x: 82, y: 47 },
  },
  {
    id: 'abdomen',
    label: 'Abdomen',
    description: 'Measure the widest part of your abdomen while standing relaxed.',
    point: { x: 50, y: 54 },
    anchor: { x: 82, y: 54 },
  },
  {
    id: 'hips',
    label: 'Hips',
    description: 'Measure around the fullest part of your hips and glutes.',
    point: { x: 50, y: 63 },
    anchor: { x: 82, y: 63 },
  },
  {
    id: 'leftArm',
    label: 'Left Arm',
    description: 'Measure around the midpoint of your upper arm while relaxed.',
    point: { x: 35, y: 38 },
    anchor: { x: 18, y: 38 },
  },
  {
    id: 'rightArm',
    label: 'Right Arm',
    description: 'Measure around the midpoint of your upper arm while relaxed.',
    point: { x: 65, y: 38 },
    anchor: { x: 82, y: 38 },
  },
  {
    id: 'leftThigh',
    label: 'Left Thigh',
    description: 'Measure around the thickest part of your upper thigh.',
    point: { x: 40, y: 72 },
    anchor: { x: 22, y: 72 },
  },
  {
    id: 'rightThigh',
    label: 'Right Thigh',
    description: 'Measure around the thickest part of your upper thigh.',
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

export async function loadMeasurementPositions() {
  try {
    const { positions } = await get('/measurement-positions/custom');
    if (!positions) {
      return null;
    }
    return normalizeMeasurementPositions(positions);
  } catch (error) {
    console.warn('Failed to load measurement positions', error);
    return null;
  }
}

export async function saveMeasurementPositions(positions) {
  const normalized = normalizeMeasurementPositions(positions);
  await put('/measurement-positions/custom', normalized);
}

export async function clearMeasurementPositions() {
  await put('/measurement-positions/custom', {});
}

export async function loadDefaultMeasurementOverride() {
  try {
    const { positions } = await get('/measurement-positions/default');
    if (!positions) {
      return null;
    }
    return normalizeMeasurementPositions(positions);
  } catch (error) {
    console.warn('Failed to load default measurement override', error);
    return null;
  }
}

export async function saveDefaultMeasurementPositions(positions) {
  const normalized = normalizeMeasurementPositions(positions);
  await put('/measurement-positions/default', normalized);
}

export function getDefaultMeasurementPositions() {
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
