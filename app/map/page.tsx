import { getCachedRows } from '@/lib/baserow';
import type { Field, Operation, Contact, ProbeAssignment, Repair, FieldSeason } from '@/lib/baserow';
import MapClient from './MapClient';

export const dynamic = 'force-dynamic';

export default async function MapPage() {
  const currentYear = new Date().getFullYear();

  const [fields, operations, contacts, fieldSeasons, probeAssignments, repairs] =
    await Promise.all([
      getCachedRows<Field>('fields', {}, 120),
      getCachedRows<Operation>('operations', {}, 120),
      getCachedRows<Contact>('contacts', {}, 120),
      getCachedRows<FieldSeason>('field_seasons', { baserowFilters: [{ field: 'season', type: 'equal', value: String(currentYear) }] }, 120),
      getCachedRows<ProbeAssignment>('probe_assignments', {}, 120),
      getCachedRows<Repair>('repairs', {}, 120),
    ]);

  return (
    <MapClient
      fields={fields}
      operations={operations}
      contacts={contacts}
      fieldSeasons={fieldSeasons}
      probeAssignments={probeAssignments}
      repairs={repairs}
    />
  );
}
