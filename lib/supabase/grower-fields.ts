import 'server-only';
import { growerQuery, withGrowerOperation } from './grower';
import { positiveId } from './registry';

export type GrowerFieldRow = {
  id: number;
  name: string;
  acres: number | null;
  lat: number | null;
  lng: number | null;
  fieldSeasonId: number;
  season: number;
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
      lat: unknown;
      lng: unknown;
      field_season_id: unknown;
      season: unknown;
    }>(
      `SELECT f.id,
              f.name,
              f.acres,
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
    return rows.map((row) => ({
      id: positiveId(row.id),
      name: row.name,
      acres: row.acres == null ? null : Number(row.acres),
      lat: row.lat == null ? null : Number(row.lat),
      lng: row.lng == null ? null : Number(row.lng),
      fieldSeasonId: positiveId(row.field_season_id),
      season: Number(row.season),
    }));
  });
}

export function growerCurrentSeasonYear(now = new Date()): number {
  return now.getFullYear();
}
