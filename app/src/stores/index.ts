import { create } from 'zustand';
import type { MapGeoJSONFeature } from 'maplibre-gl';
import type { Filters } from '../utils/filters';
import { DEFAULT_CENTER, DEFAULT_ZOOM } from '../utils/constants';
import { readUrlState, updateUrlParams } from '../utils/url';

// Read initial state from URL
const urlState = readUrlState();

interface AppState {
  // Viewport
  center: [number, number];
  zoom: number;
  setView: (center: [number, number], zoom: number) => void;

  // Features (from PMTiles query)
  features: MapGeoJSONFeature[];
  setFeatures: (features: MapGeoJSONFeature[]) => void;

  // Selection
  selectedFeature: MapGeoJSONFeature | null;
  setSelectedFeature: (feature: MapGeoJSONFeature | null) => void;
  hoveredFeatureId: string | null;
  setHoveredFeatureId: (id: string | null) => void;

  // Filters
  filters: Filters;
  setFilters: (filters: Filters) => void;

  // UI
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  basemap: 'light' | 'dark';
  setBasemap: (basemap: 'light' | 'dark') => void;
}

export const useStore = create<AppState>((set) => ({
  // Viewport
  center: urlState.lat != null && urlState.lon != null
    ? [urlState.lon, urlState.lat]
    : DEFAULT_CENTER,
  zoom: urlState.zoom ?? DEFAULT_ZOOM,
  setView: (center, zoom) => {
    set({ center, zoom });
    updateUrlParams({
      lat: center[1].toFixed(4),
      lon: center[0].toFixed(4),
      zoom: zoom.toFixed(1),
    });
  },

  // Features
  features: [],
  setFeatures: (features) => set({ features }),

  // Selection
  selectedFeature: null,
  setSelectedFeature: (feature) => {
    set({ selectedFeature: feature });
    updateUrlParams({
      selected_id: feature?.properties?._id ?? null,
    });
  },
  hoveredFeatureId: null,
  setHoveredFeatureId: (id) => set({ hoveredFeatureId: id }),

  // Filters
  filters: {
    dateStart: urlState.dateStart,
    dateEnd: urlState.dateEnd,
    platform: urlState.platform,
    resolution: urlState.resolution,
    license: urlState.license,
  },
  setFilters: (filters) => {
    set({ filters });
    updateUrlParams({
      dateStart: filters.dateStart || null,
      dateEnd: filters.dateEnd || null,
      platform: filters.platform || null,
      resolution: filters.resolution || null,
      license: filters.license || null,
    });
  },

  // UI
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  basemap: 'light',
  setBasemap: (basemap) => set({ basemap }),
}));
