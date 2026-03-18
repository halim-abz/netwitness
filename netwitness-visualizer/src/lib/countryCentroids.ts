/**
 * countryCentroids.ts
 * 
 * This utility file handles the calculation and mapping of geographical centroids
 * for countries based on GeoJSON data. It includes hardcoded overrides for
 * specific countries to ensure accurate visualization on the globe.
 */

import { geoCentroid, ExtendedFeature } from 'd3';

// --- Types & Interfaces ---

export interface Centroid {
  lat: number;
  lng: number;
}

export interface GeoJsonProperties {
  NAME?: string;
  ISO_A2?: string;
  ISO_A3?: string;
  [key: string]: unknown;
}

export interface GeoJsonFeature extends ExtendedFeature<any, any> {
  properties: GeoJsonProperties;
}

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

// --- Pre-defined Data ---

export const COUNTRY_OVERRIDES: Record<string, Centroid> = {
  'us': { lat: 37.0902, lng: -95.7129 },
  'united states': { lat: 37.0902, lng: -95.7129 },
  'gb': { lat: 55.3781, lng: -3.4360 },
  'uk': { lat: 55.3781, lng: -3.4360 },
  'united kingdom': { lat: 55.3781, lng: -3.4360 },
  'ru': { lat: 61.5240, lng: 105.3188 },
  'russia': { lat: 61.5240, lng: 105.3188 },
  'cn': { lat: 35.8617, lng: 104.1954 },
  'china': { lat: 35.8617, lng: 104.1954 },
  'kp': { lat: 40.3399, lng: 127.5101 },
  'north korea': { lat: 40.3399, lng: 127.5101 },
  'ir': { lat: 32.4279, lng: 53.6880 },
  'iran': { lat: 32.4279, lng: 53.6880 },
  'fr': { lat: 46.2276, lng: 2.2137 },
  'france': { lat: 46.2276, lng: 2.2137 },
  'no': { lat: 60.4720, lng: 8.4689 },
  'norway': { lat: 60.4720, lng: 8.4689 },
  'to': { lat: -21.1789, lng: -175.1982 },
  'tonga': { lat: -21.1789, lng: -175.1982 },
  'so': { lat: 9.5, lng: 46.2 },
  'somaliland': { lat: 9.5, lng: 46.2 },
  'xk': { lat: 42.6, lng: 20.9 },
  'kosovo': { lat: 42.6, lng: 20.9 },
  'cy': { lat: 35.2, lng: 33.6 },
  'n. cyprus': { lat: 35.2, lng: 33.6 },
  'northern cyprus': { lat: 35.2, lng: 33.6 },
};

// --- Main Utility ---

/**
 * Generates a map of country centroids from GeoJSON features.
 * @param geoJson The GeoJSON data containing country features.
 * @returns A Map where keys are lowercase country names/ISO codes, and values are {lat, lng}.
 */
export function getCountryCentroids(geoJson?: GeoJsonFeatureCollection | null): Map<string, Centroid> {
  const centroidMap = new Map<string, Centroid>();
  
  // Safely iterate only if valid features array exists
  if (geoJson?.features && Array.isArray(geoJson.features)) {
    for (const feature of geoJson.features) {
      try {
        // d3.geoCentroid returns [longitude, latitude]
        const [lng, lat] = geoCentroid(feature as any);
        
        // Guard against invalid/empty geometries returning NaN
        if (isNaN(lat) || isNaN(lng)) {
          continue; 
        }
        
        const position: Centroid = { lat, lng };
        const { NAME, ISO_A2, ISO_A3 } = feature.properties || {};
        
        if (NAME) centroidMap.set(NAME.toLowerCase(), position);
        if (ISO_A2) centroidMap.set(ISO_A2.toLowerCase(), position);
        if (ISO_A3) centroidMap.set(ISO_A3.toLowerCase(), position);
      } catch (error) {
        // Feature geometries that are structurally malformed can cause geoCentroid to throw.
        // We safely ignore these specific features and move to the next one.
      }
    }
  }
  
  // Apply overrides (these will intentionally overwrite any calculated values)
  for (const [key, centroid] of Object.entries(COUNTRY_OVERRIDES)) {
    centroidMap.set(key, centroid);
  }
  
  return centroidMap;
}