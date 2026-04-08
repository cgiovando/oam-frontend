// API endpoints
export const STAC_API = 'https://api.imagery.hotosm.org/stac';
export const TITILER_URL = 'https://titiler.hotosm.org';

// PMTiles source (generated from OAM catalog)
export const PMTILES_URL =
  'pmtiles://https://cgiovando-oam-api.s3.us-east-1.amazonaws.com/images.pmtiles';

// Zoom thresholds (proven in oam-vibe)
export const GRID_MAX_ZOOM = 9;
export const FOOTPRINT_MIN_ZOOM = 8;
export const TMS_LARGE_MIN_ZOOM = 12;
export const TMS_ALL_MIN_ZOOM = 16;
export const TMS_SELECTED_MIN_ZOOM = 10;
export const LARGE_IMAGE_THRESHOLD_SQ_KM = 50;

// Performance caps
export const MAX_TMS_LAYERS = 8;
export const MAX_PREVIEW_LAYERS = 25;
export const SIDEBAR_PAGE_SIZE = 50;

// HOT branding
export const HOT_RED = '#d73f3f';

// Basemaps
export const BASEMAPS = {
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
} as const;

// Default map view
export const DEFAULT_CENTER: [number, number] = [0, 20];
export const DEFAULT_ZOOM = 2;
