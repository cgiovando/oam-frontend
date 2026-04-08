import { TITILER_URL } from './constants';

/**
 * Construct a TiTiler TMS URL for a COG.
 * Handles CORS rewrite for legacy OAM tile URLs.
 */
export function getTmsUrl(properties: Record<string, unknown>): string | null {
  let tmsUrl = (properties.tms as string) || null;

  // Fallback: construct from uuid if tms field missing
  if (!tmsUrl && properties.uuid) {
    const parts = (properties.uuid as string).split('/');
    const uploadId = parts[parts.length - 3];
    const filename = (parts[parts.length - 1] || '')
      .replace('.tif', '')
      .replace('.tiff', '');
    tmsUrl = `https://tiles.openaerialmap.org/${uploadId}/0/${filename}/{z}/{x}/{y}`;
  }

  if (!tmsUrl) return null;

  // CORS rewrite: tiles.openaerialmap.org 302-redirects lack CORS headers.
  // Rewrite to direct TiTiler + S3 path.
  const oamMatch = tmsUrl.match(
    /^https:\/\/tiles\.openaerialmap\.org\/(.+)\/{z}\/{x}\/{y}$/
  );
  if (oamMatch) {
    const s3Path = `https://oin-hotosm-temp.s3.us-east-1.amazonaws.com/${oamMatch[1]}.tif`;
    return `${TITILER_URL}/cog/tiles/WebMercatorQuad/{z}/{x}/{y}@1x?url=${encodeURIComponent(s3Path)}&nodata=0`;
  }

  return tmsUrl;
}

/**
 * Get a preview/thumbnail URL for a COG via TiTiler.
 */
export function getPreviewUrl(
  cogUrl: string,
  maxSize: number = 256
): string {
  return `${TITILER_URL}/cog/preview?url=${encodeURIComponent(cogUrl)}&max_size=${maxSize}&return_mask=true`;
}

/**
 * Get the COG bounds endpoint URL.
 */
export function getCogBoundsUrl(cogUrl: string): string {
  return `${TITILER_URL}/cog/bounds?url=${encodeURIComponent(cogUrl)}`;
}

/**
 * Calculate bounding box area in sq km (simplified).
 */
export function bboxAreaKm2(bbox: number[]): number {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const avgLat = (minLat + maxLat) / 2;
  const widthKm = (maxLon - minLon) * 111.32 * Math.cos((avgLat * Math.PI) / 180);
  const heightKm = (maxLat - minLat) * 111.32;
  return Math.abs(widthKm * heightKm);
}

/**
 * Extract a usable COG URL from feature properties.
 * Tries multiple known property patterns.
 */
export function getCogUrl(properties: Record<string, unknown>): string | null {
  // Try direct uuid (OAM convention)
  if (properties.uuid && typeof properties.uuid === 'string') {
    return properties.uuid;
  }
  // Try assets.visual.href or assets.data.href patterns
  if (properties.asset_url && typeof properties.asset_url === 'string') {
    return properties.asset_url;
  }
  return null;
}
