// Using 'any' for MapLibre filter expressions because the strict types
// don't align well with the expression DSL used in practice.

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

/**
 * Check if a feature's properties match the current filters (client-side).
 */
export function matchesFilters(
  props: Record<string, unknown>,
  filters: Filters
): boolean {
  if (filters.platform) {
    const plat = ((props.platform as string) || '').toLowerCase();
    if (filters.platform === 'uav') {
      if (plat !== 'uav' && plat !== 'drone') return false;
    } else if (filters.platform === 'aircraft') {
      if (plat === 'satellite' || plat === 'uav' || plat === 'drone')
        return false;
    } else {
      if (plat !== filters.platform.toLowerCase()) return false;
    }
  }

  const dateField = (props.acquisition_end as string) || (props.datetime as string) || '';
  if (filters.dateStart && dateField && dateField < filters.dateStart) return false;
  if (filters.dateEnd && dateField && dateField > filters.dateEnd + 'T23:59:59.999Z') return false;

  if (filters.resolution) {
    const gsd = props.gsd as number;
    if (gsd != null) {
      if (filters.resolution === '<0.5' && gsd >= 0.5) return false;
      if (filters.resolution === '0.5-2' && (gsd < 0.5 || gsd > 2)) return false;
      if (filters.resolution === '2-10' && (gsd < 2 || gsd > 10)) return false;
      if (filters.resolution === '>10' && gsd <= 10) return false;
    }
  }

  if (filters.license) {
    const target = filters.license.replace(/[\s-]/g, '').toLowerCase();
    const actual = ((props.license as string) || '').replace(/[\s-]/g, '').toLowerCase();
    if (!actual.includes(target)) return false;
  }

  return true;
}

/**
 * Build a MapLibre filter expression from the current filters.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildMaplibreFilter(filters: Filters): any | null {
  const conditions: unknown[] = ['all'];

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

  if (filters.dateStart) {
    conditions.push(['>=', ['get', 'acquisition_end'], filters.dateStart]);
  }
  if (filters.dateEnd) {
    conditions.push([
      '<=',
      ['get', 'acquisition_end'],
      filters.dateEnd + 'T23:59:59.999Z',
    ]);
  }

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

  return conditions.length > 1 ? conditions : null;
}
