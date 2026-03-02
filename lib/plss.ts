/**
 * PLSS (Public Land Survey System) forward and reverse lookup functions.
 * Queries BLM National PLSS Cadastral NSDI MapServer.
 */

const BLM_PLSS_URL = 'https://gis.blm.gov/arcgis/rest/services/Cadastral/BLM_Natl_PLSS_CadNSDI/MapServer';

export interface PlssForwardResult {
  lat: number;
  lng: number;
  bounds: [[number, number], [number, number]]; // [[south, west], [north, east]]
}

export interface PlssReverseResult {
  township: number;
  range: number;
  section: number;
}

/**
 * Forward lookup: Township/Range/Section → section center + bounds.
 * Queries BLM section layer (2) by PLSSID + section number.
 * PLSSID format: NE06{TTT}0N0{RRR}0W0 (Nebraska, 6th PM, North, West)
 */
export async function plssForwardLookup(
  township: number,
  range: number,
  section: number,
): Promise<PlssForwardResult | null> {
  const twp = String(township).padStart(3, '0');
  const rng = String(range).padStart(3, '0');
  const plssId = `NE06${twp}0N0${rng}0W0`;

  const params = new URLSearchParams({
    where: `PLSSID='${plssId}' AND FRSTDIVNO='${section}'`,
    outFields: '*',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'json',
  });

  try {
    const res = await fetch(`${BLM_PLSS_URL}/2/query?${params}`);
    const data = await res.json();

    if (!data.features?.length) return null;

    const rings = data.features[0].geometry.rings[0];
    const lats = rings.map((c: number[]) => c[1]);
    const lngs = rings.map((c: number[]) => c[0]);
    const south = Math.min(...lats);
    const north = Math.max(...lats);
    const west = Math.min(...lngs);
    const east = Math.max(...lngs);

    return {
      lat: (south + north) / 2,
      lng: (west + east) / 2,
      bounds: [[south, west], [north, east]],
    };
  } catch (error) {
    console.error('Error in PLSS forward lookup:', error);
    return null;
  }
}

/**
 * Reverse lookup: lat/lng → Township/Range/Section.
 * Uses BLM identify endpoint on both layers.
 */
export async function plssReverseLookup(
  lat: number,
  lng: number,
): Promise<PlssReverseResult | null> {
  const params = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    sr: '4326',
    layers: 'all:1,2',
    tolerance: '0',
    mapExtent: `${lng - 0.5},${lat - 0.5},${lng + 0.5},${lat + 0.5}`,
    imageDisplay: '800,600,96',
    returnGeometry: 'false',
    f: 'json',
  });

  try {
    const res = await fetch(`${BLM_PLSS_URL}/identify?${params}`);
    const data = await res.json();

    if (!data.results?.length) return null;

    let township: number | null = null;
    let range: number | null = null;
    let section: number | null = null;

    for (const result of data.results) {
      const attrs = result.attributes;
      if (result.layerId === 1) {
        const twpStr = attrs.TWNSHPNO || attrs['Township Number'];
        const rngStr = attrs.RANGENO || attrs['Range Number'];
        if (twpStr) township = parseInt(twpStr, 10);
        if (rngStr) range = parseInt(rngStr, 10);
      } else if (result.layerId === 2) {
        const secStr = attrs.FRSTDIVNO || attrs['First Division Number'];
        if (secStr) section = parseInt(secStr, 10);
      }
    }

    if (township && range && section) {
      return { township, range, section };
    }
    return null;
  } catch (error) {
    console.error('Error in PLSS reverse lookup:', error);
    return null;
  }
}
