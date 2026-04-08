/**
 * Extract a bounding box from any GeoJSON geometry.
 * Handles Polygon, MultiPolygon, and falls back to iterating all coordinates.
 */
export function bboxFromGeometry(
  geometry: GeoJSON.Geometry
): [number, number, number, number] | null {
  const coords = extractCoords(geometry);
  if (coords.length === 0) return null;

  let minLon = Infinity,
    minLat = Infinity,
    maxLon = -Infinity,
    maxLat = -Infinity;
  for (const [lon, lat] of coords) {
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLon, minLat, maxLon, maxLat];
}

function extractCoords(geometry: GeoJSON.Geometry): number[][] {
  switch (geometry.type) {
    case 'Point':
      return [geometry.coordinates];
    case 'MultiPoint':
    case 'LineString':
      return geometry.coordinates;
    case 'MultiLineString':
    case 'Polygon':
      return geometry.coordinates.flat();
    case 'MultiPolygon':
      return geometry.coordinates.flat(2);
    case 'GeometryCollection':
      return geometry.geometries.flatMap(extractCoords);
    default:
      return [];
  }
}

/**
 * Validate and sanitize URL-parsed coordinates.
 * Returns null if invalid.
 */
export function validateCoord(
  lat: number | null,
  lon: number | null,
  zoom: number | null
): { lat: number; lon: number; zoom: number } | null {
  if (lat == null || lon == null || zoom == null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(zoom))
    return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  if (zoom < 0 || zoom > 22) return null;
  return { lat, lon, zoom };
}

/**
 * Allowlisted asset URL domains for security.
 */
const ALLOWED_ASSET_DOMAINS = [
  'oin-hotosm-temp.s3.us-east-1.amazonaws.com',
  'oin-hotosm-temp.s3.amazonaws.com',
  'tiles.openaerialmap.org',
  'titiler.hotosm.org',
  'api.imagery.hotosm.org',
];

export function isAllowedAssetUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_ASSET_DOMAINS.some(
      (d) => parsed.hostname === d || parsed.hostname.endsWith('.' + d)
    );
  } catch {
    return false;
  }
}
