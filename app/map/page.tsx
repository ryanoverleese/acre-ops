import { effectiveFieldAcres, loadBoundaryAcresByFieldId } from '@/lib/field-acres';
import { getCachedRows } from '@/lib/supabase/adapter';
import type { Field, Operation, Contact, ProbeAssignment, Repair, FieldSeason } from '@/lib/types';
import MapClient from './MapClient';

import { staffMetadata } from '@/lib/site-metadata';

export const metadata = staffMetadata('map');

export const dynamic = 'force-dynamic';

export default async function MapPage() {
  const currentYear = new Date().getFullYear();

  const [fields, operations, contacts, fieldSeasons, probeAssignments, repairs, boundaryAcres] =
    await Promise.all([
      getCachedRows<Field>('fields', {}, 120),
      getCachedRows<Operation>('operations', {}, 120),
      getCachedRows<Contact>('contacts', {}, 120),
      getCachedRows<FieldSeason>('field_seasons', { where: [{ field: 'season', type: 'equal', value: String(currentYear) }] }, 120),
      getCachedRows<ProbeAssignment>('probe_assignments', {}, 120),
      getCachedRows<Repair>('repairs', {}, 120),
      loadBoundaryAcresByFieldId(),
    ]);

  const fieldsWithBoundaryAcres = fields.map((field) => {
    const acres = effectiveFieldAcres(field.acres, boundaryAcres.get(field.id));
    return acres == null ? field : { ...field, acres };
  });

  return (
    <MapClient
      fields={fieldsWithBoundaryAcres}
      operations={operations}
      contacts={contacts}
      fieldSeasons={fieldSeasons}
      probeAssignments={probeAssignments}
      repairs={repairs}
    />
  );
}
