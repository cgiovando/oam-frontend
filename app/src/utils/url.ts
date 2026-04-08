/**
 * Read all relevant state from URL query params.
 * #7: Returns validated values; invalid/NaN values become null.
 */
export function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  return {
    lat: safeParseFloat(params.get('lat')),
    lon: safeParseFloat(params.get('lon')),
    zoom: safeParseFloat(params.get('zoom')),
    selectedId: params.get('selected_id') || null,
    dateStart: params.get('dateStart') || '',
    dateEnd: params.get('dateEnd') || '',
    platform: params.get('platform') || '',
    resolution: params.get('resolution') || '',
    license: params.get('license') || '',
  };
}

function safeParseFloat(value: string | null): number | null {
  if (value == null) return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Update URL query params without creating history entries.
 */
export function updateUrlParams(updates: Record<string, string | null>) {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(updates)) {
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
  }
  const qs = params.toString();
  const url = qs
    ? `${window.location.pathname}?${qs}`
    : window.location.pathname;
  window.history.replaceState({}, '', url);
}
