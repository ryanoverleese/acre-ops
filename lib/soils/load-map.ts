import type { SoilMap } from './ssurgo';

const cache = new Map<string, Promise<SoilMap>>();

function load(url: string): Promise<SoilMap> {
  let hit = cache.get(url);
  if (!hit) {
    hit = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Soil map failed (${res.status})`);
        return res.json() as Promise<SoilMap>;
      })
      .catch((err) => {
        cache.delete(url);
        throw err;
      });
    cache.set(url, hit);
  }
  return hit;
}

/** Fetch one snapped-bbox soil map, sharing in-flight and completed requests by key. */
export function loadSoilMap(key: string): Promise<SoilMap> {
  return load(`/api/soil-map/${encodeURIComponent(key)}`);
}

/** Fetch one 0.1° wide-view tile (simplified polygons), shared the same way. */
export function loadWideSoilMap(key: string): Promise<SoilMap> {
  return load(`/api/soil-map-wide/${encodeURIComponent(key)}`);
}
