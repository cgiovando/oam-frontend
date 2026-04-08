// #4: Single normalization layer for both client-side and MapLibre filters.
// All boundary conditions must match between matchesFilters and buildMaplibreFilter.

export interface Filters {
  dateStart: string;
  dateEnd: string;
  platform: string;
  resolution: string;
  license: string;
}

export const EMPTY_FILTERS: Filters = {
  dateStart: '',
  dateEnd: '',
  platform: '',
  resolution: '',
  license: '',
};

// Helper: get the date string from properties, with fallback
function getDateValue(props: Record<string, unknown>): string {
  return (props.acquisition_end as string) || (props.datetime as string) || '';
}

// Helper: normalize platform for comparison
function normalizePlatform(plat: string): string {
  const lower = plat.toLowerCase();
  if (lower === 'drone') return 'uav';
  return lower;
}

// Helper: check platform match
function platformMatches(propPlatform: string, filterPlatform: string): boolean {
  const plat = normalizePlatform(propPlatform);
  if (filterPlatform === 'uav') return plat === 'uav';
  if (filterPlatform === 'aircraft') return plat !== 'satellite' && plat !== 'uav';
  return plat === filterPlatform.toLowerCase();
}

// Resolution boundaries: <0.5, [0.5, 2], (2, 10], >10
// Using consistent inclusive/exclusive: <0.5 | >=0.5 && <=2 | >2 && <=10 | >10
function resolutionMatches(gsd: number | null | undefined, filter: string): boolean {
  if (gsd == null) return true; // no GSD data, don't filter out
  if (filter === '<0.5') return gsd < 0.5;
  if (filter === '0.5-2') return gsd >= 0.5 && gsd <= 2;
  if (filter === '2-10') return gsd > 2 && gsd <= 10;
  if (filter === '>10') return gsd > 10;
  return true;
}

function licenseMatches(propLicense: string, filterLicense: string): boolean {
  const target = filterLicense.replace(/[\s-]/g, '').toLowerCase();
  const actual = propLicense.replace(/[\s-]/g, '').toLowerCase();
  return actual.includes(target);
}

/**
 * Check if a feature's properties match the current filters (client-side).
 */
export function matchesFilters(
  props: Record<string, unknown>,
  filters: Filters
): boolean {
  if (filters.platform) {
    if (!platformMatches((props.platform as string) || '', filters.platform)) return false;
  }

  const dateField = getDateValue(props);
  if (filters.dateStart && dateField && dateField < filters.dateStart) return false;
  if (filters.dateEnd && dateField && dateField > filters.dateEnd + 'T23:59:59.999Z') return false;

  if (filters.resolution) {
    if (!resolutionMatches(props.gsd as number, filters.resolution)) return false;
  }

  if (filters.license) {
    if (!licenseMatches((props.license as string) || '', filters.license)) return false;
  }

  return true;
}

/**
 * Build a MapLibre filter expression from the current filters.
 * Must produce identical results to matchesFilters for any given feature.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildMaplibreFilter(filters: Filters): any | null {
  const conditions: unknown[] = ['all'];

  // Platform
  if (filters.platform) {
    if (filters.platform === 'uav') {
      conditions.push([
        'any',
        ['==', ['downcase', ['get', 'platform']], 'uav'],
        ['==', ['downcase', ['get', 'platform']], 'drone'],
      ]);
    } else if (filters.platform === 'aircraft') {
      conditions.push([
        'all',
        ['!=', ['downcase', ['get', 'platform']], 'satellite'],
        ['!=', ['downcase', ['get', 'platform']], 'uav'],
        ['!=', ['downcase', ['get', 'platform']], 'drone'],
      ]);
    } else {
      conditions.push([
        '==',
        ['downcase', ['get', 'platform']],
        filters.platform.toLowerCase(),
      ]);
    }
  }

  // Date - use coalesce to try acquisition_end then datetime
  const dateExpr = ['coalesce', ['get', 'acquisition_end'], ['get', 'datetime']];
  if (filters.dateStart) {
    conditions.push(['>=', dateExpr, filters.dateStart]);
  }
  if (filters.dateEnd) {
    conditions.push(['<=', dateExpr, filters.dateEnd + 'T23:59:59.999Z']);
  }

  // Resolution - matching exact same boundaries as resolutionMatches
  if (filters.resolution) {
    if (filters.resolution === '<0.5') {
      conditions.push(['<', ['get', 'gsd'], 0.5]);
    } else if (filters.resolution === '0.5-2') {
      conditions.push(['>=', ['get', 'gsd'], 0.5]);
      conditions.push(['<=', ['get', 'gsd'], 2]);
    } else if (filters.resolution === '2-10') {
      conditions.push(['>', ['get', 'gsd'], 2]);
      conditions.push(['<=', ['get', 'gsd'], 10]);
    } else if (filters.resolution === '>10') {
      conditions.push(['>', ['get', 'gsd'], 10]);
    }
  }

  // License
  if (filters.license) {
    const lic = filters.license.replace(/[\s-]/g, '').toLowerCase();
    // MapLibre has limited string operations; use 'in' substring check
    conditions.push([
      'in',
      lic,
      ['downcase', ['to-string', ['get', 'license']]],
    ]);
  }

  return conditions.length > 1 ? conditions : null;
}
