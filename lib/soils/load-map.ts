import type { SoilMap } from './ssurgo';

const cache = new Map<string, Promise<SoilMap>>();

/** Fetch one snapped-bbox soil map, sharing in-flight and completed requests by key. */
export function loadSoilMap(key: string): Promise<SoilMap> {
  let hit = cache.get(key);
  if (!hit) {
    hit = fetch(`/api/soil-map/${encodeURIComponent(key)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Soil map failed (${res.status})`);
        return res.json() as Promise<SoilMap>;
      })
      .catch((err) => {
        cache.delete(key);
        throw err;
      });
    cache.set(key, hit);
  }
  return hit;
}
