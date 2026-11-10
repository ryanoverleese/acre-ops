import 'server-only';
import { probeAgeSeasons } from '../grower-display';
import { removalInstantIso } from '@/lib/removal-time';
import { growerQuery, withGrowerOperation } from './grower';
import { positiveId } from './registry';

export type GrowerFieldRow = {
  id: number;
  name: string;
  acres: number | null;
  /** True when acres were computed from the boundary polygon. */
  acresFromBoundary: boolean;
  lat: number | null;
  lng: number | null;
  fieldSeasonId: number;
  season: number;
  /** Probe assignment statuses for this field/season (Installed, Removed, …). */
  probeStatuses: string[];
};

/** Fields for one farm that have a field_season in the given year. */
export async function listGrowerFieldsForSeason(
  operationId: unknown,
  season: number,
): Promise<GrowerFieldRow[]> {
  const op = positiveId(operationId);
  if (!Number.isSafeInteger(season)) return [];
  return withGrowerOperation(op, async () => {
    const rows = await growerQuery<{
      id: unknown;
      name: string;
      acres: unknown;
      acres_from_boundary: unknown;
      lat: unknown;
      lng: unknown;
      field_season_id: unknown;
      season: unknown;
    }>(
      `SELECT f.id,
              f.name,
              f.acres,
              f.acres_from_boundary,
              f.lat,
              f.lng,
              fs.id AS field_season_id,
              fs.season
         FROM public.grower_fields AS f
         JOIN public.grower_field_seasons AS fs ON fs.field_id = f.id
        WHERE fs.season = $1
        ORDER BY f.name, f.id`,
      [season],
    );
    const statusRows = await growerQuery<{
      field_id: unknown;
      probe_status: string | null;
    }>(
      `SELECT field_id, probe_status
         FROM public.grower_probe_assignments
        WHERE season = $1
        ORDER BY field_id, probe_number NULLS LAST, id`,
      [season],
    );
    const byField = new Map<number, string[]>();
    for (const row of statusRows) {
      const fieldId = positiveId(row.field_id);
      const list = byField.get(fieldId) || [];
      if (row.probe_status?.trim()) list.push(row.probe_status.trim());
      byField.set(fieldId, list);
    }
    return rows.map((row) => {
      const id = positiveId(row.id);
      return {
        id,
        name: row.name,
        acres: row.acres == null ? null : Number(row.acres),
        acresFromBoundary: Boolean(row.acres_from_boundary),
        lat: row.lat == null ? null : Number(row.lat),
        lng: row.lng == null ? null : Number(row.lng),
        fieldSeasonId: positiveId(row.field_season_id),
        season: Number(row.season),
        probeStatuses: byField.get(id) || [],
      };
    });
  });
}

export function growerCurrentSeasonYear(now = new Date()): number {
  return now.getFullYear();
}

/** Calendar day for grower UI. pg timestamptz arrives as Date; date columns as strings. */
export function growerDayString(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const day = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

export type GrowerBoundaryCollection = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id: number;
    geometry: { type: string; coordinates: unknown };
    properties: { fieldId: number; source?: string; crs?: string };
  }>;
};

export type GrowerProbePin = {
  id: number;
  serial: string | null;
  label: string | null;
  probeNumber: number | null;
  status: string | null;
  installDate: string | null;
  /** Calendar date of a pull. Null when the probe is still out. */
  removalDate: string | null;
  /** ISO instant when the pull time is known. Null for date-only history. */
  removalAt: string | null;
  yearNew: number | null;
  ageSeasons: number | null;
  elevation: number | null;
  soilType: string | null;
  /** Null when neither install nor placement coordinates exist — still list the probe. */
  lat: number | null;
  lng: number | null;
};

export type GrowerWaterRec = {
  id: number;
  date: string;
  recommendation: string | null;
  suggestedWaterDay: string | null;
  reportType: string;
};

export type GrowerFieldDetail = {
  id: number;
  name: string;
  acres: number | null;
  acresFromBoundary: boolean;
  lat: number | null;
  lng: number | null;
  fieldSeasonId: number;
  season: number;
  boundaries: GrowerBoundaryCollection;
  probes: GrowerProbePin[];
  waterRecs: GrowerWaterRec[];
};

function probePinLatLng(row: {
  install_lat: unknown;
  install_lng: unknown;
  placement_lat: unknown;
  placement_lng: unknown;
}): { lat: number; lng: number } | null {
  const installLat = row.install_lat == null ? null : Number(row.install_lat);
  const installLng = row.install_lng == null ? null : Number(row.install_lng);
  if (installLat != null && installLng != null && Number.isFinite(installLat) && Number.isFinite(installLng)) {
    return { lat: installLat, lng: installLng };
  }
  const placeLat = row.placement_lat == null ? null : Number(row.placement_lat);
  const placeLng = row.placement_lng == null ? null : Number(row.placement_lng);
  if (placeLat != null && placeLng != null && Number.isFinite(placeLat) && Number.isFinite(placeLng)) {
    return { lat: placeLat, lng: placeLng };
  }
  return null;
}

export type GrowerHardwareRow = {
  id: number;
  fieldId: number;
  fieldName: string;
  serial: string | null;
  label: string | null;
  probeNumber: number | null;
  status: string | null;
  installDate: string | null;
  /** Calendar date of a pull. Null when the probe is still out. */
  removalDate: string | null;
  /** ISO instant when the pull time is known. Null for date-only history. */
  removalAt: string | null;
  yearNew: number | null;
  ageSeasons: number | null;
  elevation: number | null;
  soilType: string | null;
  lat: number | null;
  lng: number | null;
};

/** All probe assignments for the farm in the given season (grower-scoped). */
export async function listGrowerHardwareForSeason(
  operationId: unknown,
  season: number,
): Promise<GrowerHardwareRow[]> {
  const op = positiveId(operationId);
  if (!Number.isSafeInteger(season)) return [];
  return withGrowerOperation(op, async () => {
    const rows = await growerQuery<{
      id: unknown;
      field_id: unknown;
      field_name: string;
      probe_serial_number: string | null;
      label: string | null;
      probe_number: unknown;
      probe_status: string | null;
      install_date: Date | string | null;
      removal_date: Date | string | null;
      removal_at: Date | string | null;
      probe_year_new: unknown;
      elevation: unknown;
      soil_type: string | null;
      install_lat: unknown;
      install_lng: unknown;
      placement_lat: unknown;
      placement_lng: unknown;
    }>(
      `SELECT p.id,
              p.field_id,
              f.name AS field_name,
              p.probe_serial_number,
              p.label,
              p.probe_number,
              p.probe_status,
              p.install_date,
              p.removal_date,
              p.removal_at,
              p.probe_year_new,
              p.elevation,
              p.soil_type,
              p.install_lat,
              p.install_lng,
              p.placement_lat,
              p.placement_lng
         FROM public.grower_probe_assignments AS p
         JOIN public.grower_fields AS f ON f.id = p.field_id
        WHERE p.season = $1
        ORDER BY f.name, p.probe_number NULLS LAST, p.id`,
      [season],
    );
    return rows.map((p) => {
      const pin = probePinLatLng(p);
      const yearNew = p.probe_year_new == null ? null : Number(p.probe_year_new);
      return {
        id: positiveId(p.id),
        fieldId: positiveId(p.field_id),
        fieldName: p.field_name,
        serial: p.probe_serial_number,
        label: p.label,
        probeNumber: p.probe_number == null ? null : Number(p.probe_number),
        status: p.probe_status,
        installDate: growerDayString(p.install_date),
        removalDate: growerDayString(p.removal_date),
        removalAt: removalInstantIso(p.removal_at),
        yearNew: yearNew != null && Number.isFinite(yearNew) ? yearNew : null,
        ageSeasons: probeAgeSeasons(
          yearNew != null && Number.isFinite(yearNew) ? yearNew : null,
          season,
        ),
        elevation: p.elevation == null ? null : Number(p.elevation),
        soilType: p.soil_type,
        lat: pin?.lat ?? null,
        lng: pin?.lng ?? null,
      };
    });
  });
}

export type GrowerFarmWaterRec = GrowerWaterRec & {
  fieldId: number;
  fieldName: string;
};

/** Current-year full/update water recommendations across the farm. */
export async function listGrowerWaterRecsForSeason(
  operationId: unknown,
  season: number,
): Promise<GrowerFarmWaterRec[]> {
  const op = positiveId(operationId);
  if (!Number.isSafeInteger(season)) return [];
  return withGrowerOperation(op, async () => {
    const rows = await growerQuery<{
      id: unknown;
      field_id: unknown;
      field_name: string;
      date: Date | string;
      recommendation: string | null;
      suggested_water_day: string | null;
      report_type: string | null;
    }>(
      `SELECT r.id,
              r.field_id,
              f.name AS field_name,
              r.date,
              r.recommendation,
              r.suggested_water_day,
              r.report_type
         FROM public.grower_water_recs AS r
         JOIN public.grower_fields AS f ON f.id = r.field_id
        WHERE r.season = $1
          AND r.report_type IN ('full', 'update')
        ORDER BY r.date DESC, f.name, r.id DESC`,
      [season],
    );
    return rows.flatMap((rec) => {
      const date = growerDayString(rec.date);
      if (!date) return [];
      return [{
        id: positiveId(rec.id),
        fieldId: positiveId(rec.field_id),
        fieldName: rec.field_name,
        date,
        recommendation: rec.recommendation,
        suggestedWaterDay: rec.suggested_water_day,
        reportType: rec.report_type || 'full',
      }];
    });
  });
}

/** One field for the signed-in farm: outline, probes, and season row. Null if not visible. */
export async function getGrowerFieldDetail(
  operationId: unknown,
  fieldId: unknown,
  season: number,
): Promise<GrowerFieldDetail | null> {
  const op = positiveId(operationId);
  const field = positiveId(fieldId);
  if (!Number.isSafeInteger(season)) return null;

  return withGrowerOperation(op, async () => {
    const fields = await growerQuery<{
      id: unknown;
      name: string;
      acres: unknown;
      acres_from_boundary: unknown;
      lat: unknown;
      lng: unknown;
      field_season_id: unknown;
      season: unknown;
    }>(
      `SELECT f.id, f.name, f.acres, f.acres_from_boundary, f.lat, f.lng,
              fs.id AS field_season_id, fs.season
         FROM public.grower_fields AS f
         JOIN public.grower_field_seasons AS fs ON fs.field_id = f.id
        WHERE f.id = $1 AND fs.season = $2
        LIMIT 1`,
      [field, season],
    );
    if (!fields.length) return null;
    const row = fields[0];

    const bounds = await growerQuery<{
      field_id: unknown;
      geometry: { type: string; coordinates: unknown };
      source: string;
      crs: string;
    }>(
      `SELECT field_id, geometry, source, crs
         FROM public.grower_field_boundaries
        WHERE field_id = $1`,
      [field],
    );

    const probes = await growerQuery<{
      id: unknown;
      probe_serial_number: string | null;
      label: string | null;
      probe_number: unknown;
      probe_status: string | null;
      install_date: Date | string | null;
      removal_date: Date | string | null;
      removal_at: Date | string | null;
      probe_year_new: unknown;
      elevation: unknown;
      soil_type: string | null;
      install_lat: unknown;
      install_lng: unknown;
      placement_lat: unknown;
      placement_lng: unknown;
    }>(
      `SELECT id, probe_serial_number, label, probe_number, probe_status, install_date,
              removal_date, removal_at,
              probe_year_new, elevation, soil_type,
              install_lat, install_lng, placement_lat, placement_lng
         FROM public.grower_probe_assignments
        WHERE field_id = $1 AND season = $2
        ORDER BY probe_number NULLS LAST, id`,
      [field, season],
    );

    const boundaries: GrowerBoundaryCollection = {
      type: 'FeatureCollection',
      features: bounds.map((b) => ({
        type: 'Feature' as const,
        id: positiveId(b.field_id),
        geometry: b.geometry,
        properties: {
          fieldId: positiveId(b.field_id),
          source: b.source,
          crs: b.crs,
        },
      })),
    };

    const probePins: GrowerProbePin[] = [];
    for (const p of probes) {
      const pin = probePinLatLng(p);
      const yearNew = p.probe_year_new == null ? null : Number(p.probe_year_new);
      probePins.push({
        id: positiveId(p.id),
        serial: p.probe_serial_number,
        label: p.label,
        probeNumber: p.probe_number == null ? null : Number(p.probe_number),
        status: p.probe_status,
        installDate: growerDayString(p.install_date),
        removalDate: growerDayString(p.removal_date),
        removalAt: removalInstantIso(p.removal_at),
        yearNew: yearNew != null && Number.isFinite(yearNew) ? yearNew : null,
        ageSeasons: probeAgeSeasons(
          yearNew != null && Number.isFinite(yearNew) ? yearNew : null,
          season,
        ),
        elevation: p.elevation == null ? null : Number(p.elevation),
        soilType: p.soil_type,
        lat: pin?.lat ?? null,
        lng: pin?.lng ?? null,
      });
    }

    const recs = await growerQuery<{
      id: unknown;
      date: Date | string;
      recommendation: string | null;
      suggested_water_day: string | null;
      report_type: string | null;
    }>(
      `SELECT id, date, recommendation, suggested_water_day, report_type
         FROM public.grower_water_recs
        WHERE field_season_id = $1
          AND report_type IN ('full', 'update')
        ORDER BY date DESC, id DESC`,
      [positiveId(row.field_season_id)],
    );

    return {
      id: positiveId(row.id),
      name: row.name,
      acres: row.acres == null ? null : Number(row.acres),
      acresFromBoundary: Boolean(row.acres_from_boundary),
      lat: row.lat == null ? null : Number(row.lat),
      lng: row.lng == null ? null : Number(row.lng),
      fieldSeasonId: positiveId(row.field_season_id),
      season: Number(row.season),
      boundaries,
      probes: probePins,
      waterRecs: recs.flatMap((rec) => {
        const date = growerDayString(rec.date);
        if (!date) return [];
        return [{
          id: positiveId(rec.id),
          date,
          recommendation: rec.recommendation,
          suggestedWaterDay: rec.suggested_water_day,
          reportType: rec.report_type || 'full',
        }];
      }),
    };
  });
}

