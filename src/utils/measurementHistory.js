import { get, post, del } from '@/api/client.js';

export async function loadMeasurementHistory() {
  try {
    const { history = [] } = await get('/measurement-history');
    return history;
  } catch (error) {
    console.warn('Failed to load measurement history', error);
    throw error;
  }
}

export async function saveMeasurementEntry(entry) {
  try {
    const { entry: saved } = await post('/measurement-history', entry);
    return saved;
  } catch (error) {
    console.warn('Failed to save measurement entry', error);
    throw error;
  }
}

export async function clearMeasurementHistory() {
  try {
    await del('/measurement-history');
  } catch (error) {
    console.warn('Failed to clear measurement history', error);
    throw error;
  }
}

export const MEASUREMENT_HISTORY_STORAGE_KEY = 'measurementHistoryEntries';
