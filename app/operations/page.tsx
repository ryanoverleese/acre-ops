import { getOperations, getContacts, getBillingEntities, getFields, getProbes } from '@/lib/data';
import { buildOperationMap, buildBillingEntityMap, buildBillingToOperationMaps, buildOperationToBillingEntityMap } from '@/lib/data-mappings';
import { listGrowerActivityForOffice } from '@/lib/supabase/grower-activity';
import type { GrowerActivityFarm } from '@/lib/grower-activity-display';
import OperationsClient, { ProcessedOperation, ContactOption, LinkedContact } from './OperationsClient';
import GrowerActivityStrip from './GrowerActivityStrip';

import { staffMetadata } from '@/lib/site-metadata';

export const metadata = staffMetadata('operations');

async function getOperationsData(): Promise<{
  operations: ProcessedOperation[];
  allContacts: ContactOption[];
}> {
  try {
    const [operations, contacts, billingEntities, fields, probes] = await Promise.all([
      getOperations(),
      getContacts(),
      getBillingEntities(),
      getFields(),
      getProbes(),
    ]);

    const operationMap = buildOperationMap(operations);
    const billingEntityMap = buildBillingEntityMap(billingEntities);
    const operationToBillingEntityIds = buildOperationToBillingEntityMap(contacts);
    const { billingToOperationIds } = buildBillingToOperationMaps(contacts, operationMap);

    // Build linked contacts for each operation
    const linkedContactsMap = new Map<number, LinkedContact[]>();
    contacts.forEach((contact) => {
      const contactOpIds = contact.operations?.map((op) => op.id) || [];
      contactOpIds.forEach((opId) => {
        const existing = linkedContactsMap.get(opId) || [];
        existing.push({
          contactId: contact.id,
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          isMainContact: contact.is_main_contact?.value === 'Yes',
        });
        linkedContactsMap.set(opId, existing);
      });
    });

    // Count fields per operation (field -> billing_entity -> operation)
    const operationFieldCount = new Map<number, number>();
    fields.forEach((field) => {
      const opIds = new Set((field.billing_entity || []).flatMap(be => [...(billingToOperationIds.get(be.id) || [])]));
      for(const opId of opIds) operationFieldCount.set(opId, (operationFieldCount.get(opId) || 0) + 1);
    });;

    // Count probes per operation (probe -> billing_entity -> operation)
    const operationProbeCount = new Map<number, number>();
    probes.forEach((probe) => {
      const beLink = probe.billing_entity?.[0];
      if (beLink) {
        const opIds = billingToOperationIds.get(beLink.id);
        if (opIds) {
          opIds.forEach((opId) => {
            operationProbeCount.set(opId, (operationProbeCount.get(opId) || 0) + 1);
          });
        }
      }
    });

    const allContacts: ContactOption[] = contacts.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
    }));

    const processedOperations: ProcessedOperation[] = operations.map((op) => {
      const beIds = operationToBillingEntityIds.get(op.id) || [];
      const billingEntitiesForOp = beIds.map((beId) => ({
        id: beId,
        name: billingEntityMap.get(beId) || 'Unknown',
      }));

      return {
        id: op.id,
        name: op.name,
        linkedContacts: linkedContactsMap.get(op.id) || [],
        billingEntities: billingEntitiesForOp,
        fieldCount: operationFieldCount.get(op.id) || 0,
        probeCount: operationProbeCount.get(op.id) || 0,
        notes: op.notes,
      };
    });

    return { operations: processedOperations, allContacts };
  } catch (error) {
    console.error('Error fetching operations data:', error);
    return { operations: [], allContacts: [] };
  }
}

function highlightedFarms(farms: GrowerActivityFarm[]): GrowerActivityFarm[] {
  return farms
    .filter((farm) => farm.pilot || farm.pinSet || farm.loginCount > 0 || farm.viewCount > 0)
    .slice(0, 6);
}

export default async function OperationsPage() {
  const [{ operations, allContacts }, activity] = await Promise.all([
    getOperationsData(),
    listGrowerActivityForOffice(),
  ]);
  return (
    <OperationsClient operations={operations} allContacts={allContacts}>
      <GrowerActivityStrip
        farms={activity ? highlightedFarms(activity) : []}
        unavailable={activity == null}
      />
    </OperationsClient>
  );
}
