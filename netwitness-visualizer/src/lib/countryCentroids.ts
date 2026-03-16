import * as d3 from 'd3';

/**
 * Shared country centroid data and calculation utility.
 * Pre-calculates centroids from GeoJSON features and provides hardcoded overrides for accuracy.
 */

export interface Centroid {
  lat: number;
  lng: number;
}

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

/**
 * Generates a map of country centroids from GeoJSON features.
 * @param geoJson The GeoJSON data containing country features.
 * @returns A Map where keys are lowercase country names and ISO codes, and values are {lat, lng}.
 */
export function getCountryCentroids(geoJson: any): Map<string, Centroid> {
  const map = new Map<string, Centroid>();
  
  if (geoJson?.features) {
    geoJson.features.forEach((f: any) => {
      try {
        const centroid = d3.geoCentroid(f);
        const name = f.properties?.NAME;
        const isoA2 = f.properties?.ISO_A2;
        const isoA3 = f.properties?.ISO_A3;
        
        const pos = { lat: centroid[1], lng: centroid[0] };
        
        if (name) map.set(name.toLowerCase(), pos);
        if (isoA2) map.set(isoA2.toLowerCase(), pos);
        if (isoA3) map.set(isoA3.toLowerCase(), pos);
      } catch (e) {
        // Skip features that fail centroid calculation
      }
    });
  }
  
  // Apply overrides
  Object.entries(COUNTRY_OVERRIDES).forEach(([key, value]) => {
    map.set(key, value);
  });
  
  return map;
}
