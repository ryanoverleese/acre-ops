import { getRepairs, getFieldSeasons, getFields, getBillingEntities, getOperations, getProbes, getProbeAssignments, getContacts } from '@/lib/baserow';
import RepairsClient, { ProcessedRepair, FieldSeasonOption, ProbeAssignmentOption } from './RepairsClient';

async function getRepairsData(): Promise<{
  repairs: ProcessedRepair[];
  fieldSeasons: FieldSeasonOption[];
  probeAssignmentOptions: ProbeAssignmentOption[];
}> {
  try {
    const [repairs, fieldSeasons, fields, billingEntities, operations, probes, probeAssignments, contacts] = await Promise.all([
      getRepairs(),
      getFieldSeasons(),
      getFields(),
      getBillingEntities(),
      getOperations(),
      getProbes(),
      getProbeAssignments(),
      getContacts(),
    ]);

    const probeMap = new Map(probes.map((p) => [p.id, p.serial_number || 'Unknown']));

    const operationMap = new Map(operations.map((op) => [op.id, op.name]));
    const fieldSeasonMap = new Map(fieldSeasons.map((fs) => [fs.id, fs]));
    const fieldMap = new Map(fields.map((f) => [f.id, f]));

    // Map billing entity to operation through contacts
    const billingToOperationMap = new Map<number, number>();
    contacts.forEach((contact) => {
      const contactOpIds = contact.operations?.map((op) => op.id) || [];
      const contactBeIds = contact.billing_entity?.map((be) => be.id) || [];

      contactBeIds.forEach((beId) => {
        contactOpIds.forEach((opId) => {
          if (!billingToOperationMap.has(beId)) {
            billingToOperationMap.set(beId, opId);
          }
        });
      });
    });

    const getOperationName = (field: typeof fields[0] | null | undefined): string => {
      if (field?.billing_entity?.[0]) {
        const opId = billingToOperationMap.get(field.billing_entity[0].id);
        if (opId) {
          return operationMap.get(opId) || 'Unknown';
        }
      }
      return 'Unknown';
    };

    // Create probe assignment map
    const probeAssignmentMap = new Map(probeAssignments.map((pa) => [pa.id, pa]));

    const processedRepairs: ProcessedRepair[] = repairs.map((repair) => {
      const fsLink = repair.field_season?.[0];
      const fieldSeason = fsLink ? fieldSeasonMap.get(fsLink.id) : null;
      const fieldLink = fieldSeason?.field?.[0];
      const field = fieldLink ? fieldMap.get(fieldLink.id) : null;

      // Get probe assignment info
      const paLink = repair.probe_assignment?.[0];
      const probeAssignment = paLink ? probeAssignmentMap.get(paLink.id) : null;
      const probeSerial = probeAssignment?.probe?.[0]?.id
        ? probeMap.get(probeAssignment.probe[0].id)
        : null;

      return {
        id: repair.id,
        fieldSeasonId: fsLink?.id || 0,
        fieldName: field?.name || fsLink?.value || 'Unknown Field',
        operation: getOperationName(field),
        reportedAt: repair.reported_at || '',
        problem: repair.problem || 'No description',
        fix: repair.fix,
        repairedAt: repair.repaired_at,
        notifiedCustomer: repair.notified_customer || false,
        status: repair.repaired_at ? 'resolved' as const : 'open' as const,
        probeAssignmentId: paLink?.id,
        probeNumber: probeAssignment?.probe_number,
        label: probeAssignment?.label || '',
        probeSerial,
        probeReplaced: repair.probe_replaced || false,
        newProbeSerial: repair.new_probe_serial,
      };
    }).sort((a, b) => {
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
      return new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime();
    });

    // Build field season options for the dropdown
    const fieldSeasonOptions: FieldSeasonOption[] = fieldSeasons.map((fs) => {
      const fieldLink = fs.field?.[0];
      const field = fieldLink ? fieldMap.get(fieldLink.id) : null;
      // Find probe 1 from probe_assignments
      const probe1Assignment = probeAssignments.find(
        pa => pa.field_season?.[0]?.id === fs.id && pa.probe_number == 1
      );
      const probe1Id = probe1Assignment?.probe?.[0]?.id;
      return {
        id: fs.id,
        fieldName: field?.name || fieldLink?.value || 'Unknown Field',
        operation: getOperationName(field),
        probe1Serial: probe1Id ? probeMap.get(probe1Id) : undefined,
        probe2Serial: undefined,
      };
    }).sort((a, b) => a.fieldName.localeCompare(b.fieldName));

    // Build probe assignment options for the dropdown
    const probeAssignmentOptions: ProbeAssignmentOption[] = probeAssignments.map((pa) => {
      const fieldSeason = pa.field_season?.[0]?.id ? fieldSeasonMap.get(pa.field_season[0].id) : null;
      const fieldLink = fieldSeason?.field?.[0];
      const field = fieldLink ? fieldMap.get(fieldLink.id) : null;
      const probeSerial = pa.probe?.[0]?.id ? probeMap.get(pa.probe[0].id) : undefined;

      return {
        id: pa.id,
        fieldSeasonId: pa.field_season?.[0]?.id || 0,
        fieldName: field?.name || 'Unknown Field',
        probeNumber: pa.probe_number || 1,
        label: pa.label || '',
        probeSerial,
      };
    }).sort((a, b) => {
      const nameCompare = a.fieldName.localeCompare(b.fieldName);
      if (nameCompare !== 0) return nameCompare;
      return a.probeNumber - b.probeNumber;
    });

    return { repairs: processedRepairs, fieldSeasons: fieldSeasonOptions, probeAssignmentOptions };
  } catch (error) {
    console.error('Error fetching repairs data:', error);
    return { repairs: [], fieldSeasons: [], probeAssignmentOptions: [] };
  }
}

export default async function RepairsPage() {
  const { repairs, fieldSeasons, probeAssignmentOptions } = await getRepairsData();
  return <RepairsClient repairs={repairs} fieldSeasons={fieldSeasons} probeAssignmentOptions={probeAssignmentOptions} />;
}
