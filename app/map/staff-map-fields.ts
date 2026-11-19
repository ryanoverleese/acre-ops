import { fieldBilling } from '@/lib/data-mappings';

/** One staff-map field. lat/lng are omitted when the field row has no coordinates. */
export type StaffMapField = {
  id: number;
  name: string;
  operation: string;
  lat?: number;
  lng?: number;
  acres?: number;
  crop?: string;
  /** Default probe-placement pin. Only current-season fields with coordinates. */
  showPlacementPin: boolean;
};

export type StaffMapFieldRow = {
  id: number;
  name: string;
  lat?: number | string | null;
  lng?: number | string | null;
  acres?: number | null;
  billing_entity?: { id: number; value: string }[];
};

export type StaffMapSeasonRow = {
  field?: { id: number; value: string }[];
  crop?: { id: number; value: string };
};

export function hasMapCoords(lat: unknown, lng: unknown): boolean {
  const x = Number(lat);
  const y = Number(lng);
  return Boolean(x) && Boolean(y) && !Number.isNaN(x) && !Number.isNaN(y);
}

/**
 * Current-season fields (with coordinates) plus every field that has a
 * field_boundaries row, even if it has no season or no lat/lng.
 * Current-season crop, operation label, and placement pins stay as they are.
 */
export function buildStaffMapFields({
  fields,
  fieldSeasons,
  boundedFieldIds,
}: {
  fields: StaffMapFieldRow[];
  fieldSeasons: StaffMapSeasonRow[];
  boundedFieldIds: Iterable<number>;
}): StaffMapField[] {
  const fieldMap = new Map(fields.map((field) => [field.id, field]));
  const seasonByFieldId = new Map<number, StaffMapSeasonRow>();
  for (const season of fieldSeasons) {
    const fieldId = season.field?.[0]?.id;
    if (!fieldId || seasonByFieldId.has(fieldId)) continue;
    seasonByFieldId.set(fieldId, season);
  }

  const bounded = new Set<number>();
  for (const raw of boundedFieldIds) {
    const id = Number(raw);
    if (Number.isSafeInteger(id) && id > 0) bounded.add(id);
  }

  const out: StaffMapField[] = [];
  const seen = new Set<number>();

  const add = (id: number) => {
    if (seen.has(id)) return;
    const field = fieldMap.get(id);
    if (!field) return;
    const season = seasonByFieldId.get(id);
    const coords = hasMapCoords(field.lat, field.lng);
    const hasBoundary = bounded.has(id);
    // Same as before: a current-season field with no boundary still needs coordinates.
    if (!hasBoundary && !season) return;
    if (!hasBoundary && !coords) return;

    seen.add(id);
    const row: StaffMapField = {
      id: field.id,
      name: field.name,
      operation: fieldBilling(field).label,
      acres: field.acres ?? undefined,
      crop: season?.crop?.value,
      showPlacementPin: Boolean(season && coords),
    };
    if (coords) {
      row.lat = Number(field.lat);
      row.lng = Number(field.lng);
    }
    out.push(row);
  };

  // Keep current-season fields in the existing field_seasons order.
  for (const season of fieldSeasons) {
    const fieldId = season.field?.[0]?.id;
    if (fieldId) add(fieldId);
  }
  for (const id of [...bounded].sort((a, b) => a - b)) add(id);
  return out;
}
