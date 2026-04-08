/**
 * Read all relevant state from URL query params.
 */
export function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  return {
    lat: params.has('lat') ? parseFloat(params.get('lat')!) : null,
    lon: params.has('lon') ? parseFloat(params.get('lon')!) : null,
    zoom: params.has('zoom') ? parseFloat(params.get('zoom')!) : null,
    selectedId: params.get('selected_id') || null,
    dateStart: params.get('dateStart') || '',
    dateEnd: params.get('dateEnd') || '',
    platform: params.get('platform') || '',
    resolution: params.get('resolution') || '',
    license: params.get('license') || '',
  };
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
