import { useRef, useEffect, useCallback, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import { useStore } from '../../stores';
import {
  PMTILES_URL,
  BASEMAPS,
  FOOTPRINT_MIN_ZOOM,
  TMS_LARGE_MIN_ZOOM,
  TMS_ALL_MIN_ZOOM,
  TMS_SELECTED_MIN_ZOOM,
  LARGE_IMAGE_THRESHOLD_SQ_KM,
  MAX_TMS_LAYERS,
  HOT_RED,
} from '../../utils/constants';
import { getTmsUrl, bboxAreaKm2, getCogBoundsUrl } from '../../utils/tiles';
import { buildMaplibreFilter, matchesFilters } from '../../utils/filters';
import { readUrlState } from '../../utils/url';
import { bboxFromGeometry, validateCoord } from '../../utils/geo';
import type { MapGeoJSONFeature } from 'maplibre-gl';

// #8: COG bounds cache with failure retry and LRU eviction
const COG_CACHE_MAX = 500;
const COG_FAILURE_TTL = 30_000; // retry failures after 30s
const cogBoundsCache = new Map<
  string,
  { bounds: [number, number, number, number]; area: number } | { failedAt: number } | 'pending'
>();

function evictOldest() {
  if (cogBoundsCache.size <= COG_CACHE_MAX) return;
  const firstKey = cogBoundsCache.keys().next().value;
  if (firstKey) cogBoundsCache.delete(firstKey);
}

async function fetchCogBounds(
  cogUrl: string
): Promise<{ bounds: [number, number, number, number]; area: number } | null> {
  const cached = cogBoundsCache.get(cogUrl);
  if (cached && cached !== 'pending') {
    if ('failedAt' in cached) {
      if (Date.now() - cached.failedAt < COG_FAILURE_TTL) return null;
      // TTL expired, retry
    } else {
      return cached;
    }
  }
  if (cached === 'pending') return null; // dedupe in-flight

  cogBoundsCache.set(cogUrl, 'pending');
  try {
    const resp = await fetch(getCogBoundsUrl(cogUrl));
    if (!resp.ok) {
      cogBoundsCache.set(cogUrl, { failedAt: Date.now() });
      return null;
    }
    const data = await resp.json();
    const b = data.bounds as [number, number, number, number];
    const result = { bounds: b, area: bboxAreaKm2(b) };
    evictOldest();
    cogBoundsCache.set(cogUrl, result);
    return result;
  } catch {
    cogBoundsCache.set(cogUrl, { failedAt: Date.now() });
    return null;
  }
}

export default function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  // #9: track unmount to ignore async completions
  const unmountedRef = useRef(false);

  const setView = useStore((s) => s.setView);
  const setFeatures = useStore((s) => s.setFeatures);
  const setSelectedFeature = useStore((s) => s.setSelectedFeature);
  const setHoveredFeatureId = useStore((s) => s.setHoveredFeatureId);
  const basemap = useStore((s) => s.basemap);

  // Refs for latest values (avoid stale closures)
  const filtersRef = useRef(useStore.getState().filters);
  const selectedRef = useRef(useStore.getState().selectedFeature);
  useEffect(() => {
    const unsub = useStore.subscribe((state) => {
      filtersRef.current = state.filters;
      selectedRef.current = state.selectedFeature;
    });
    return unsub;
  }, []);

  // Active TMS layer tracking
  const activeTmsLayers = useRef<Set<string>>(new Set());
  // Suppress TMS updates during fly animations to prevent flash
  const flyingRef = useRef(false);
  // #9: track timers for cleanup
  const timersRef = useRef<Set<number>>(new Set());

  const safeTimeout = useCallback((fn: () => void, ms: number): number => {
    const id = window.setTimeout(() => {
      timersRef.current.delete(id);
      if (!unmountedRef.current) fn();
    }, ms);
    timersRef.current.add(id);
    return id;
  }, []);

  // #2: manage selected feature state on map
  const prevSelectedIdRef = useRef<string | number | null>(null);
  const syncSelectedState = useCallback(() => {
    const m = map.current;
    if (!m || !m.getSource('oam-pmtiles')) return;
    const selected = selectedRef.current;
    const prevId = prevSelectedIdRef.current;
    const newId = selected?.id ?? null;
    if (prevId === newId) return;
    if (prevId != null) {
      try {
        m.setFeatureState(
          { source: 'oam-pmtiles', sourceLayer: 'images', id: prevId },
          { selected: false }
        );
      } catch { /* feature may no longer be loaded */ }
    }
    if (newId != null) {
      try {
        m.setFeatureState(
          { source: 'oam-pmtiles', sourceLayer: 'images', id: newId },
          { selected: true }
        );
      } catch { /* feature may not be loaded yet */ }
    }
    prevSelectedIdRef.current = newId;
  }, []);

  const removeTmsLayer = useCallback((id: string) => {
    const m = map.current;
    if (!m) return;
    const layerId = `tms-${id}`;
    const sourceId = `tms-src-${id}`;
    if (m.getLayer(layerId)) m.removeLayer(layerId);
    if (m.getSource(sourceId)) m.removeSource(sourceId);
    activeTmsLayers.current.delete(id);
  }, []);

  const addTmsLayer = useCallback(
    async (feature: MapGeoJSONFeature, isSelected: boolean) => {
      const m = map.current;
      if (!m || unmountedRef.current) return;
      const id = feature.properties._id as string;
      if (activeTmsLayers.current.has(id)) {
        const layerId = `tms-${id}`;
        if (m.getLayer(layerId)) {
          m.setPaintProperty(layerId, 'raster-opacity', isSelected ? 1.0 : 0.6);
        }
        return;
      }
      if (!isSelected && activeTmsLayers.current.size >= MAX_TMS_LAYERS) return;

      const tmsUrl = getTmsUrl(feature.properties as Record<string, unknown>);
      if (!tmsUrl) return;

      // Get COG bounds for constraining tile requests
      const cogUrl = feature.properties.uuid as string;
      let bounds: [number, number, number, number] | undefined;
      if (cogUrl) {
        const info = await fetchCogBounds(cogUrl);
        if (unmountedRef.current) return; // #9: check after async
        if (info) bounds = info.bounds;
      }

      // #10: use geometry-agnostic bbox as fallback
      if (!bounds && feature.geometry) {
        const geoBbox = bboxFromGeometry(feature.geometry);
        if (geoBbox) bounds = geoBbox;
      }

      const sourceId = `tms-src-${id}`;
      const layerId = `tms-${id}`;

      if (!m || m.getSource(sourceId)) return;

      m.addSource(sourceId, {
        type: 'raster',
        tiles: [tmsUrl],
        tileSize: 256,
        minzoom: isSelected ? TMS_SELECTED_MIN_ZOOM : TMS_LARGE_MIN_ZOOM,
        maxzoom: 22,
        ...(bounds ? { bounds } : {}),
      });

      m.addLayer(
        {
          id: layerId,
          type: 'raster',
          source: sourceId,
          paint: { 'raster-opacity': isSelected ? 1.0 : 0.6 },
        },
        'footprint-fill'
      );

      activeTmsLayers.current.add(id);
    },
    []
  );

  // #1: use queryRenderedFeatures instead of querySourceFeatures
  const emitVisibleFeatures = useCallback(() => {
    const m = map.current;
    if (!m || !m.getLayer('footprint-fill')) return;

    const features = m.queryRenderedFeatures(undefined, {
      layers: ['footprint-fill'],
    });

    // Deduplicate by _id
    const seen = new Set<string>();
    const unique: MapGeoJSONFeature[] = [];
    for (const f of features) {
      const id = f.properties?._id as string;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      if (matchesFilters(f.properties as Record<string, unknown>, filtersRef.current)) {
        unique.push(f);
      }
    }

    // Sort by date descending
    unique.sort((a, b) => {
      const da = (a.properties.acquisition_end as string) || (a.properties.datetime as string) || '';
      const db = (b.properties.acquisition_end as string) || (b.properties.datetime as string) || '';
      return db.localeCompare(da);
    });

    setFeatures(unique);
  }, [setFeatures]);

  // Manage TMS layers based on zoom and visible features
  const updateTmsLayers = useCallback(() => {
    const m = map.current;
    if (!m || flyingRef.current) return;
    const zoom = m.getZoom();
    const features = useStore.getState().features;
    const selected = selectedRef.current;

    const visibleIds = new Set(features.map((f) => f.properties._id as string));
    for (const id of activeTmsLayers.current) {
      if (!visibleIds.has(id) && id !== selected?.properties?._id) {
        removeTmsLayer(id);
      }
    }

    if (selected && zoom >= TMS_SELECTED_MIN_ZOOM) {
      addTmsLayer(selected, true);
    }

    if (zoom >= TMS_LARGE_MIN_ZOOM) {
      for (const f of features) {
        if (activeTmsLayers.current.size >= MAX_TMS_LAYERS) break;
        const fId = f.properties._id as string;
        if (fId === selected?.properties?._id) continue;

        const bbox = f.properties.bbox as number[] | undefined;
        if (bbox) {
          const area = bboxAreaKm2(bbox);
          if (zoom >= TMS_ALL_MIN_ZOOM || area > LARGE_IMAGE_THRESHOLD_SQ_KM) {
            addTmsLayer(f, false);
          }
        }
      }
    }

    if (zoom < TMS_LARGE_MIN_ZOOM) {
      for (const id of activeTmsLayers.current) {
        if (id !== selected?.properties?._id) {
          removeTmsLayer(id);
        }
      }
    }
  }, [addTmsLayer, removeTmsLayer]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;
    unmountedRef.current = false;

    const protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);

    // #7: validate URL params
    const urlState = readUrlState();
    const validated = validateCoord(urlState.lat, urlState.lon, urlState.zoom);
    const center: [number, number] = validated ? [validated.lon, validated.lat] : [0, 20];
    const zoom = validated?.zoom ?? 2;

    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: BASEMAPS[basemap],
      center,
      zoom,
      minZoom: 1,
      maxZoom: 22,
      attributionControl: {},
    });

    m.addControl(new maplibregl.NavigationControl(), 'bottom-right');

    m.on('load', () => {
      if (unmountedRef.current) return;

      m.addSource('oam-pmtiles', {
        type: 'vector',
        url: PMTILES_URL,
      });

      m.addLayer({
        id: 'footprint-fill',
        type: 'fill',
        source: 'oam-pmtiles',
        'source-layer': 'images',
        minzoom: FOOTPRINT_MIN_ZOOM,
        paint: {
          'fill-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            HOT_RED,
            ['boolean', ['feature-state', 'hover'], false],
            '#ff6b6b',
            'rgba(65, 105, 225, 0.15)',
          ],
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.4, 14, 0.1],
        },
      });

      m.addLayer({
        id: 'footprint-line',
        type: 'line',
        source: 'oam-pmtiles',
        'source-layer': 'images',
        minzoom: FOOTPRINT_MIN_ZOOM,
        paint: {
          'line-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            HOT_RED,
            ['boolean', ['feature-state', 'hover'], false],
            '#ff6b6b',
            'rgba(65, 105, 225, 0.6)',
          ],
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            3,
            ['boolean', ['feature-state', 'hover'], false],
            2,
            1,
          ],
        },
      });

      setMapLoaded(true);

      m.on('idle', () => {
        if (flyingRef.current || unmountedRef.current) return;
        emitVisibleFeatures();
        updateTmsLayers();
        syncSelectedState();
      });

      m.on('moveend', () => {
        safeTimeout(() => {
          if (flyingRef.current) return;
          const c = m.getCenter();
          setView([c.lng, c.lat], m.getZoom());
          emitVisibleFeatures();
          updateTmsLayers();
        }, 300);
      });

      // Click handler
      m.on('click', 'footprint-fill', (e) => {
        if (e.features && e.features.length > 0) {
          setSelectedFeature(e.features[0] as MapGeoJSONFeature);
        }
      });

      m.on('click', (e) => {
        const features = m.queryRenderedFeatures(e.point, {
          layers: ['footprint-fill'],
        });
        if (features.length === 0) {
          setSelectedFeature(null);
        }
      });

      // Hover
      let hoveredId: string | number | null = null;
      m.on('mousemove', 'footprint-fill', (e) => {
        if (e.features && e.features.length > 0) {
          if (hoveredId != null) {
            m.setFeatureState(
              { source: 'oam-pmtiles', sourceLayer: 'images', id: hoveredId },
              { hover: false }
            );
          }
          hoveredId = e.features[0].id ?? null;
          if (hoveredId != null) {
            m.setFeatureState(
              { source: 'oam-pmtiles', sourceLayer: 'images', id: hoveredId },
              { hover: true }
            );
          }
          setHoveredFeatureId(e.features[0].properties._id as string);
          m.getCanvas().style.cursor = 'pointer';
        }
      });

      m.on('mouseleave', 'footprint-fill', () => {
        if (hoveredId != null) {
          m.setFeatureState(
            { source: 'oam-pmtiles', sourceLayer: 'images', id: hoveredId },
            { hover: false }
          );
          hoveredId = null;
        }
        setHoveredFeatureId(null);
        m.getCanvas().style.cursor = '';
      });

      // #2: restore selected_id from URL after features first load
      const urlSelectedId = urlState.selectedId;
      if (urlSelectedId) {
        const restoreSelection = () => {
          const features = useStore.getState().features;
          const match = features.find((f) => f.properties._id === urlSelectedId);
          if (match) {
            setSelectedFeature(match);
            m.off('idle', restoreSelection);
          }
        };
        m.on('idle', restoreSelection);
        // Give up after 10s
        safeTimeout(() => m.off('idle', restoreSelection), 10_000);
      }
    });

    map.current = m;
    (window as unknown as Record<string, unknown>).__map = m;

    // #9: cleanup all timers and mark unmounted
    return () => {
      unmountedRef.current = true;
      for (const id of timersRef.current) clearTimeout(id);
      timersRef.current.clear();
      maplibregl.removeProtocol('pmtiles');
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply filter expression when filters change
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const sub = useStore.subscribe((state, prev) => {
      if (state.filters !== prev.filters) {
        const expr = buildMaplibreFilter(state.filters);
        const m = map.current!;
        if (m.getLayer('footprint-fill')) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          m.setFilter('footprint-fill', expr as any);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          m.setFilter('footprint-line', expr as any);
        }
        safeTimeout(() => {
          emitVisibleFeatures();
          updateTmsLayers();
        }, 100);
      }
    });
    return sub;
  }, [mapLoaded, emitVisibleFeatures, updateTmsLayers, safeTimeout]);

  // #2: sync selected feature state + fly to it
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const sub = useStore.subscribe((state, prev) => {
      if (state.selectedFeature !== prev.selectedFeature) {
        syncSelectedState();
        const f = state.selectedFeature;
        if (f?.geometry) {
          // #10: geometry-agnostic bbox
          const bbox = bboxFromGeometry(f.geometry);
          if (bbox) {
            flyingRef.current = true;
            const m = map.current!;
            m.once('moveend', () => {
              safeTimeout(() => {
                flyingRef.current = false;
                emitVisibleFeatures();
                updateTmsLayers();
              }, 200);
            });
            m.fitBounds(
              [[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
              { padding: 100, maxZoom: 16 }
            );
          }
        }
      }
    });
    return sub;
  }, [mapLoaded, updateTmsLayers, emitVisibleFeatures, syncSelectedState, safeTimeout]);

  return (
    <div ref={mapContainer} style={{ position: 'absolute', inset: 0 }} />
  );
}
