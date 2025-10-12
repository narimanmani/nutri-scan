import { apiGet, apiPost, apiPut } from './httpClient';
import { createDefaultMeasurementPositions, normalizeMeasurementPositions } from '@/utils/bodyMeasurementLayout';

export async function fetchMeasurementLayout() {
  try {
    const response = await apiGet('/measurement/layout');
    if (response?.positions && typeof response.positions === 'object') {
      return normalizeMeasurementPositions(response.positions);
    }
  } catch (error) {
    console.warn('Failed to fetch measurement layout from API:', error);
  }

  return createDefaultMeasurementPositions();
}

export async function saveMeasurementLayout(positions) {
  const normalized = normalizeMeasurementPositions(positions);
  await apiPut('/measurement/layout', { positions: normalized });
  return normalized;
}

export async function fetchMeasurementHistory() {
  try {
    const response = await apiGet('/measurement/history');
    return Array.isArray(response?.data) ? response.data : [];
  } catch (error) {
    console.warn('Failed to fetch measurement history:', error);
    return [];
  }
}

export async function saveMeasurementEntry(entry) {
  const response = await apiPost('/measurement/history', entry);
  return response?.data || entry;
}
