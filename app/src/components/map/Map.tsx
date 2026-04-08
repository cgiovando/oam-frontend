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
import type { MapGeoJSONFeature } from 'maplibre-gl';

// Cache COG bounds to avoid repeated fetches
const cogBoundsCache: Record<string, { bounds: [number, number, number, number]; area: number } | null> = {};

async function fetchCogBounds(cogUrl: string): Promise<{ bounds: [number, number, number, number]; area: number } | null> {
  const cacheKey = cogUrl;
  if (cacheKey in cogBoundsCache) return cogBoundsCache[cacheKey];
  try {
    const resp = await fetch(getCogBoundsUrl(cogUrl));
    if (!resp.ok) { cogBoundsCache[cacheKey] = null; return null; }
    const data = await resp.json();
    const b = data.bounds as [number, number, number, number];
    const result = { bounds: b, area: bboxAreaKm2(b) };
    cogBoundsCache[cacheKey] = result;
    return result;
  } catch {
    cogBoundsCache[cacheKey] = null;
    return null;
  }
}

export default function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const setView = useStore((s) => s.setView);
  const setFeatures = useStore((s) => s.setFeatures);
  const setSelectedFeature = useStore((s) => s.setSelectedFeature);
  const setHoveredFeatureId = useStore((s) => s.setHoveredFeatureId);
  const basemap = useStore((s) => s.basemap);

  // Refs for latest values (avoid stale closures)
  const filtersRef = useRef(useStore.getState().filters);
  const selectedRef = useRef(useStore.getState().selectedFeature);
  useEffect(() => {
    return useStore.subscribe((state) => {
      filtersRef.current = state.filters;
      selectedRef.current = state.selectedFeature;
    });
  }, []);

  // Active TMS layer tracking
  const activeTmsLayers = useRef<Set<string>>(new Set());
  // Suppress TMS updates during fly animations to prevent flash
  const flyingRef = useRef(false);

  const removeTmsLayer = useCallback((id: string) => {
    const m = map.current;
    if (!m) return;
    const layerId = `tms-${id}`;
    const sourceId = `tms-src-${id}`;
    if (m.getLayer(layerId)) m.removeLayer(layerId);
    if (m.getSource(sourceId)) m.removeSource(sourceId);
    activeTmsLayers.current.delete(id);
  }, []);

  const addTmsLayer = useCallback(async (
    feature: MapGeoJSONFeature,
    isSelected: boolean
  ) => {
    const m = map.current;
    if (!m) return;
    const id = feature.properties._id as string;
    if (activeTmsLayers.current.has(id)) {
      // Update opacity if needed
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
      if (info) bounds = info.bounds;
    }

    // Feature's bbox from geometry as fallback
    if (!bounds && feature.geometry.type === 'Polygon') {
      const coords = (feature.geometry as GeoJSON.Polygon).coordinates[0];
      const lons = coords.map(c => c[0]);
      const lats = coords.map(c => c[1]);
      bounds = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
    }

    const sourceId = `tms-src-${id}`;
    const layerId = `tms-${id}`;

    if (m.getSource(sourceId)) return;

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
        paint: {
          'raster-opacity': isSelected ? 1.0 : 0.6,
        },
      },
      'footprint-fill' // insert below footprint layers
    );

    activeTmsLayers.current.add(id);
  }, []);

  // Emit visible features from PMTiles
  const emitVisibleFeatures = useCallback(() => {
    const m = map.current;
    if (!m || !m.getSource('oam-pmtiles')) return;

    const features = m.querySourceFeatures('oam-pmtiles', {
      sourceLayer: 'images',
    });

    // Deduplicate by id
    const seen = new Set<string>();
    const unique: MapGeoJSONFeature[] = [];
    for (const f of features) {
      const id = f.properties?._id as string;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      if (matchesFilters(f.properties as Record<string, unknown>, filtersRef.current)) {
        unique.push(f as MapGeoJSONFeature);
      }
    }

    // Sort by date descending
    unique.sort((a, b) => {
      const da = (a.properties.acquisition_end as string) || '';
      const db = (b.properties.acquisition_end as string) || '';
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

    // Remove layers for features no longer visible
    const visibleIds = new Set(features.map(f => f.properties._id as string));
    for (const id of activeTmsLayers.current) {
      if (!visibleIds.has(id) && id !== selected?.properties?._id) {
        removeTmsLayer(id);
      }
    }

    // Add selected image TMS
    if (selected && zoom >= TMS_SELECTED_MIN_ZOOM) {
      addTmsLayer(selected, true);
    }

    // Add large images at mid zoom
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

    // At low zoom, remove all non-selected TMS layers
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

    const protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);

    const urlState = readUrlState();
    const center: [number, number] =
      urlState.lon != null && urlState.lat != null
        ? [urlState.lon, urlState.lat]
        : [0, 20];
    const zoom = urlState.zoom ?? 2;

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
      // PMTiles vector source
      m.addSource('oam-pmtiles', {
        type: 'vector',
        url: PMTILES_URL,
      });

      // Grid layer (low zoom - aggregated counts)
      // For now, just use footprints at all zooms; grid aggregation is Phase 2

      // Footprint fill layer
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
          'fill-opacity': [
            'interpolate', ['linear'], ['zoom'],
            8, 0.4,
            14, 0.1,
          ],
        },
      });

      // Footprint outline layer
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

      // Emit features on idle (skip during fly animations)
      m.on('idle', () => {
        if (flyingRef.current) return;
        emitVisibleFeatures();
        updateTmsLayers();
      });

      // Update view state on moveend
      let moveTimer: number;
      m.on('moveend', () => {
        clearTimeout(moveTimer);
        moveTimer = window.setTimeout(() => {
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
          const feature = e.features[0] as MapGeoJSONFeature;
          setSelectedFeature(feature);
        }
      });

      // Click on empty space deselects
      m.on('click', (e) => {
        const features = m.queryRenderedFeatures(e.point, {
          layers: ['footprint-fill'],
        });
        if (features.length === 0) {
          setSelectedFeature(null);
        }
      });

      // Hover
      let hoveredId: string | null = null;
      m.on('mousemove', 'footprint-fill', (e) => {
        if (e.features && e.features.length > 0) {
          if (hoveredId) {
            m.setFeatureState(
              { source: 'oam-pmtiles', sourceLayer: 'images', id: hoveredId },
              { hover: false }
            );
          }
          hoveredId = e.features[0].id as string;
          m.setFeatureState(
            { source: 'oam-pmtiles', sourceLayer: 'images', id: hoveredId },
            { hover: true }
          );
          setHoveredFeatureId(e.features[0].properties._id as string);
          m.getCanvas().style.cursor = 'pointer';
        }
      });

      m.on('mouseleave', 'footprint-fill', () => {
        if (hoveredId) {
          m.setFeatureState(
            { source: 'oam-pmtiles', sourceLayer: 'images', id: hoveredId },
            { hover: false }
          );
          hoveredId = null;
        }
        setHoveredFeatureId(null);
        m.getCanvas().style.cursor = '';
      });
    });

    map.current = m;
    // Expose for debugging
    (window as unknown as Record<string, unknown>).__map = m;

    return () => {
      maplibregl.removeProtocol('pmtiles');
      m.remove();
      map.current = null;
    };
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
        // Re-emit visible features after filter change
        setTimeout(() => {
          emitVisibleFeatures();
          updateTmsLayers();
        }, 100);
      }
    });
    return sub;
  }, [mapLoaded, emitVisibleFeatures, updateTmsLayers]);

  // Fly to selected feature
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const sub = useStore.subscribe((state, prev) => {
      if (state.selectedFeature !== prev.selectedFeature && state.selectedFeature) {
        const f = state.selectedFeature;
        if (f.geometry.type === 'Polygon') {
          const coords = (f.geometry as GeoJSON.Polygon).coordinates[0];
          const lons = coords.map(c => c[0]);
          const lats = coords.map(c => c[1]);
          const bounds: [[number, number], [number, number]] = [
            [Math.min(...lons), Math.min(...lats)],
            [Math.max(...lons), Math.max(...lats)],
          ];
          // Suppress TMS updates during the fly animation
          flyingRef.current = true;
          const m = map.current!;
          m.once('moveend', () => {
            // Small delay to let the final render settle
            setTimeout(() => {
              flyingRef.current = false;
              emitVisibleFeatures();
              updateTmsLayers();
            }, 200);
          });
          m.fitBounds(bounds, { padding: 100, maxZoom: 16 });
        }
      }
    });
    return sub;
  }, [mapLoaded, updateTmsLayers, emitVisibleFeatures]);

  return (
    <div
      ref={mapContainer}
      style={{ position: 'absolute', inset: 0 }}
    />
  );
}
