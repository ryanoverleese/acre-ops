import { createRow, type Row } from '../supabase/adapter';
import { transaction } from '../supabase/database';
import { DataError, positiveId } from '../supabase/registry';

// Shared field-create path used by POST /api/fields and by John Deere
// boundary import when a JD-only field has no Acre Ops row yet.
export async function createFieldRecord(body: Row): Promise<{ field: { id: number } & Row; fieldSeason: { id: number } & Row }> {
  if (typeof body.name !== 'string' || !body.name.trim() || body.billing_entity == null || body.billing_entity === '') {
    throw new DataError('Field name and billing entity are required');
  }
  const fieldData: Row = { name: body.name, billing_entity: body.billing_entity };
  for (const key of ['acres', 'pivot_acres', 'lat', 'lng', 'plss_township', 'plss_range', 'plss_section', 'plss_description', 'notes', 'irrigation_type', 'row_direction']) {
    if (body[key] !== undefined) fieldData[key] = body[key];
  }
  return transaction(async () => {
    const field = await createRow<{ id: number } & Row>('fields', fieldData);
    const seasonData: Row = { field: [field.id], season: Number(body.season) || new Date().getFullYear() };
    for (const key of ['crop', 'side_dress', 'logger_id', 'early_removal', 'hybrid_variety', 'ready_to_remove', 'planting_date']) {
      if (body[key] !== undefined) seasonData[key] = body[key];
    }
    if (body.service_type) seasonData.service_type = [positiveId(body.service_type)];
    const fieldSeason = await createRow<{ id: number } & Row>('field_seasons', seasonData);
    if (body.antenna_type || body.battery_type) {
      await createRow('probe_assignments', {
        field_season: [fieldSeason.id],
        probe_number: 1,
        ...(body.antenna_type ? { antenna_type: body.antenna_type } : {}),
        ...(body.battery_type ? { battery_type: body.battery_type } : {}),
      });
    }
    return { field, fieldSeason };
  });
}
