import {
  getOperations,
  getContacts,
  getBillingEntities,
  getFields,
  getFieldSeasons,
} from '@/lib/baserow';
import RelationshipsClient from './RelationshipsClient';

export const dynamic = 'force-dynamic';

export interface ProcessedRelationship {
  operationId: number;
  operationName: string;
  contacts: {
    id: number;
    name: string;
    email: string;
    phone: string;
    isMainContact: boolean;
    billingEntities: {
      id: number;
      name: string;
      fieldCount: number;
      totalAcres: number;
    }[];
  }[];
  totalBillingEntities: number;
  totalFields: number;
  totalAcres: number;
}

async function getRelationshipsData(): Promise<ProcessedRelationship[]> {
  try {
    const [operations, contacts, billingEntities, fields, fieldSeasons] = await Promise.all([
      getOperations(),
      getContacts(),
      getBillingEntities(),
      getFields(),
      getFieldSeasons(),
    ]);

    const billingEntityMap = new Map(billingEntities.map((be) => [be.id, be]));

    // Build field counts per billing entity for current year
    const currentYear = new Date().getFullYear().toString();
    const fieldCountPerBillingEntity = new Map<number, number>();
    const acresPerBillingEntity = new Map<number, number>();

    // Get current season field seasons
    const currentSeasonFieldSeasons = fieldSeasons.filter(
      (fs) => String(fs.season) === currentYear
    );
    const currentSeasonFieldIds = new Set(
      currentSeasonFieldSeasons.map((fs) => fs.field?.[0]?.id).filter(Boolean)
    );

    fields.forEach((field) => {
      if (!currentSeasonFieldIds.has(field.id)) return;

      const beId = field.billing_entity?.[0]?.id;
      if (beId) {
        fieldCountPerBillingEntity.set(
          beId,
          (fieldCountPerBillingEntity.get(beId) || 0) + 1
        );
        acresPerBillingEntity.set(
          beId,
          (acresPerBillingEntity.get(beId) || 0) + (field.acres || 0)
        );
      }
    });

    // Build relationships per operation
    const relationships: ProcessedRelationship[] = operations.map((op) => {
      // Find contacts linked to this operation
      const opContacts = contacts.filter((c) =>
        c.operations?.some((o) => o.id === op.id)
      );

      // Track billing entities for this operation
      const opBillingEntityIds = new Set<number>();
      let opTotalFields = 0;
      let opTotalAcres = 0;

      const processedContacts = opContacts.map((contact) => {
        const contactBeIds = contact.billing_entity?.map((be) => be.id) || [];

        const contactBillingEntities = contactBeIds.map((beId) => {
          opBillingEntityIds.add(beId);
          const be = billingEntityMap.get(beId);
          const fieldCount = fieldCountPerBillingEntity.get(beId) || 0;
          const acres = acresPerBillingEntity.get(beId) || 0;
          opTotalFields += fieldCount;
          opTotalAcres += acres;

          return {
            id: beId,
            name: be?.name || 'Unknown',
            fieldCount,
            totalAcres: acres,
          };
        });

        return {
          id: contact.id,
          name: contact.name || '',
          email: contact.email || '',
          phone: contact.phone || '',
          isMainContact: contact.is_main_contact?.value === 'Yes',
          billingEntities: contactBillingEntities,
        };
      });

      // Sort: main contacts first, then by name
      processedContacts.sort((a, b) => {
        if (a.isMainContact !== b.isMainContact) {
          return a.isMainContact ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      return {
        operationId: op.id,
        operationName: op.name,
        contacts: processedContacts,
        totalBillingEntities: opBillingEntityIds.size,
        totalFields: opTotalFields,
        totalAcres: opTotalAcres,
      };
    });

    // Sort by operation name
    relationships.sort((a, b) => a.operationName.localeCompare(b.operationName));

    return relationships;
  } catch (error) {
    console.error('Error fetching relationships data:', error);
    return [];
  }
}

export default async function RelationshipsPage() {
  const relationships = await getRelationshipsData();

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Relationships</h2>
        </div>
      </header>

      <div className="content">
        <RelationshipsClient relationships={relationships} />
      </div>
    </>
  );
}
