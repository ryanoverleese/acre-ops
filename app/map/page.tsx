import {
  getFields,
  getOperations,
  getContacts,
  getProbeAssignments,
  getRepairs,
  getFieldSeasons,
} from '@/lib/baserow';
import type { Field, Operation, Contact, ProbeAssignment, Repair, FieldSeason } from '@/lib/baserow';
import MapClient from './MapClient';

export const dynamic = 'force-dynamic';

export default async function MapPage() {
  const currentYear = new Date().getFullYear();

  const [fields, operations, contacts, fieldSeasons, probeAssignments, repairs] =
    await Promise.all([
      getFields(),
      getOperations(),
      getContacts(),
      getFieldSeasons({ baserowFilters: [{ field: 'season', type: 'equal', value: String(currentYear) }] }),
      getProbeAssignments(),
      getRepairs(),
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
