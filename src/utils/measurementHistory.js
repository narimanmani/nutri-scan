const MEASUREMENT_HISTORY_KEY = "measurementHistoryEntries";

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadMeasurementHistory() {
  if (!isBrowser()) {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(MEASUREMENT_HISTORY_KEY);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed;
  } catch (error) {
    console.warn("Failed to load measurement history", error);
    return [];
  }
}

export function saveMeasurementEntry(entry) {
  if (!isBrowser()) {
    return;
  }

  try {
    const history = loadMeasurementHistory();
    const nextHistory = [entry, ...history];
    window.localStorage.setItem(MEASUREMENT_HISTORY_KEY, JSON.stringify(nextHistory));
  } catch (error) {
    console.warn("Failed to save measurement entry", error);
  }
}

export function clearMeasurementHistory() {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(MEASUREMENT_HISTORY_KEY);
}

export const MEASUREMENT_HISTORY_STORAGE_KEY = MEASUREMENT_HISTORY_KEY;
