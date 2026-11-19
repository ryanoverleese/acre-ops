import 'server-only';
import {
  bboxWkt,
  buildSoilMap,
  clipPolygonToBox,
  parseWktPolygons,
  roundPolygons,
  type SoilBbox,
  type SoilMap,
  type SoilPolygon,
} from './ssurgo';
import { WIDE_SIMPLIFY_DEG } from './wide';

const SDA_URL = 'https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest';
/** USDA FPAC-hosted SSURGO map unit polygons; used only when Soil Data Access is down. */
const FPAC_URL = 'https://apps.geo.fpac.usda.gov/nrcs-geodata/rest/services/soils/cg_soils/FeatureServer/0/query';
const TIMEOUT_MS = 20000;

/** Current SSURGO from Soil Data Access, clipped to the box on the USDA side. */
export async function fetchSdaSoils(box: SoilBbox): Promise<SoilMap> {
  const geom = `geometry::STGeomFromText('${bboxWkt(box)}', 4326)`;
  const query = `SELECT mu.mukey, mu.musym, mu.muname, P.mupolygongeo.STIntersection(${geom}).STAsText() AS wkt
FROM mupolygon AS P INNER JOIN mapunit AS mu ON mu.mukey = P.mukey
WHERE P.mupolygongeo.STIntersects(${geom}) = 1`;
  const res = await fetch(SDA_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, format: 'JSON+COLUMNNAME' }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Soil Data Access returned ${res.status}`);
  const body = (await res.json()) as { Table?: unknown[][] };
  const table = Array.isArray(body?.Table) ? body.Table : [];
  const rows = table.slice(1).map((row) => ({
    mukey: String(row[0] ?? ''),
    musym: String(row[1] ?? ''),
    muname: String(row[2] ?? ''),
    polygons: roundPolygons(parseWktPolygons(String(row[3] ?? ''))),
  }));
  // An empty answer for a US farm box means SDA misbehaved; let the caller try the backup.
  if (!rows.length && !('Table' in (body ?? {}))) throw new Error('Soil Data Access returned no table');
  return buildSoilMap('sda', box, rows);
}

/** Backup: USDA FPAC feature service (an older SSURGO vintage), clipped here. */
export async function fetchFpacSoils(box: SoilBbox): Promise<SoilMap> {
  return buildSoilMap('fpac', box, await fetchFpacRows(box, { maxAllowableOffset: 0, maxPages: 1 }));
}

/**
 * Wide view: simplified FPAC map unit polygons for one 0.1° tile, paged past the
 * 2000-record limit. One request per page; a farm-country tile is usually 300 to 600 polygons.
 */
export async function fetchWideSoils(box: SoilBbox): Promise<SoilMap> {
  return buildSoilMap('fpac', box, await fetchFpacRows(box, { maxAllowableOffset: WIDE_SIMPLIFY_DEG, maxPages: 4 }));
}

async function fetchFpacRows(
  box: SoilBbox,
  opts: { maxAllowableOffset: number; maxPages: number },
): Promise<{ mukey: string; musym: string; muname: string; polygons: SoilPolygon[] }[]> {
  const out: { mukey: string; musym: string; muname: string; polygons: SoilPolygon[] }[] = [];
  const pageSize = 2000;
  for (let page = 0; page < opts.maxPages; page++) {
    const { rows, more } = await fetchFpacPage(box, opts.maxAllowableOffset, opts.maxPages > 1 ? page * pageSize : -1, pageSize);
    out.push(...rows);
    if (!more) break;
  }
  return out;
}

async function fetchFpacPage(box: SoilBbox, maxAllowableOffset: number, offset: number, pageSize: number) {
  const params = new URLSearchParams({
    geometry: `${box.w},${box.s},${box.e},${box.n}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'mukey,musym,muname',
    returnGeometry: 'true',
    outSR: '4326',
    geometryPrecision: maxAllowableOffset ? '5' : '6',
    f: 'geojson',
  });
  if (maxAllowableOffset) params.set('maxAllowableOffset', String(maxAllowableOffset));
  if (offset >= 0) {
    params.set('resultOffset', String(offset));
    params.set('resultRecordCount', String(pageSize));
    params.set('orderByFields', 'objectid');
  }
  const res = await fetch(`${FPAC_URL}?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
  if (!res.ok) throw new Error(`USDA FPAC soils returned ${res.status}`);
  const body = (await res.json()) as GeoJSON.FeatureCollection & { exceededTransferLimit?: boolean; properties?: { exceededTransferLimit?: boolean } };
  if (!Array.isArray(body?.features)) throw new Error('USDA FPAC soils returned no features');
  const rows = body.features.map((f) => {
    const props = (f.properties ?? {}) as { mukey?: unknown; musym?: unknown; muname?: unknown };
    const g = f.geometry;
    const polys: SoilPolygon[] = g?.type === 'Polygon'
      ? [g.coordinates as SoilPolygon]
      : g?.type === 'MultiPolygon' ? (g.coordinates as SoilPolygon[]) : [];
    const clipped = polys.map((p) => clipPolygonToBox(p, box)).filter((p): p is SoilPolygon => !!p);
    return { mukey: String(props.mukey ?? ''), musym: String(props.musym ?? ''), muname: String(props.muname ?? ''), polygons: roundPolygons(clipped) };
  });
  const more = offset >= 0 && !!(body.exceededTransferLimit || body.properties?.exceededTransferLimit);
  return { rows, more };
}

export async function fetchSoilMap(box: SoilBbox): Promise<SoilMap> {
  try {
    return await fetchSdaSoils(box);
  } catch (sdaError) {
    console.warn('Soil Data Access failed; using USDA FPAC backup', sdaError instanceof Error ? sdaError.message : sdaError);
    return fetchFpacSoils(box);
  }
}
