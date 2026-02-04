import { getBillingEntities, getInvoices, getOperations, getContacts, getInvoiceLines, getFieldSeasons, getFields } from '@/lib/baserow';
import BillingClient, { ProcessedBillingEntity } from './BillingClient';

interface BillingData {
  billingEntities: ProcessedBillingEntity[];
  availableSeasons: number[];
}

async function getBillingData(): Promise<BillingData> {
  try {
    const [billingEntities, invoices, operations, contacts, invoiceLines, fieldSeasons, fields] = await Promise.all([
      getBillingEntities(),
      getInvoices(),
      getOperations(),
      getContacts(),
      getInvoiceLines(),
      getFieldSeasons(),
      getFields(),
    ]);

    const operationMap = new Map(operations.map((op) => [op.id, op.name]));

    // Build maps from contacts: billing entity -> operations and billing entity -> contacts
    const beToOperations = new Map<number, string[]>();
    const beToContacts = new Map<number, { name: string; email?: string }[]>();

    contacts.forEach((contact) => {
      const contactOpIds = contact.operations?.map((op) => op.id) || [];
      const contactOpNames = contactOpIds.map((id) => operationMap.get(id) || 'Unknown');
      const contactBeIds = contact.billing_entity?.map((be) => be.id) || [];

      contactBeIds.forEach((beId) => {
        const existingOps = beToOperations.get(beId) || [];
        contactOpNames.forEach((name) => {
          if (!existingOps.includes(name)) existingOps.push(name);
        });
        beToOperations.set(beId, existingOps);

        const existingContacts = beToContacts.get(beId) || [];
        if (!existingContacts.some((c) => c.name === contact.name)) {
          existingContacts.push({ name: contact.name, email: contact.email });
        }
        beToContacts.set(beId, existingContacts);
      });
    });

    // Build map of field ID to field details (including billing entity)
    const fieldMap = new Map(fields.map((f) => [f.id, { name: f.name, billingEntityId: f.billing_entity?.[0]?.id }]));

    // Build map of field season to details (field name, service type, billing entity, season)
    const fieldSeasonMap = new Map<number, { fieldName: string; serviceType: string; billingEntityId?: number; season: number }>();

    // Track which billing entities have field seasons for each year
    const beSeasonMap = new Map<number, Set<number>>(); // beId -> Set of seasons
    const allSeasons = new Set<number>();

    fieldSeasons.forEach((fs) => {
      const fieldId = fs.field?.[0]?.id;
      const fieldInfo = fieldId ? fieldMap.get(fieldId) : null;
      const fieldName = fieldInfo?.name || fs.field?.[0]?.value || 'Unknown';
      const serviceType = fs.service_type?.value || '';
      const billingEntityId = fieldInfo?.billingEntityId;
      const season = fs.season || new Date().getFullYear();

      fieldSeasonMap.set(fs.id, { fieldName, serviceType, billingEntityId, season });

      if (season) {
        allSeasons.add(season);
      }

      // Track billing entities with field seasons
      if (billingEntityId && season) {
        if (!beSeasonMap.has(billingEntityId)) {
          beSeasonMap.set(billingEntityId, new Set());
        }
        beSeasonMap.get(billingEntityId)!.add(season);
      }
    });

    // Group invoice lines by invoice ID
    const linesByInvoice = new Map<number, typeof invoiceLines>();
    invoiceLines.forEach((line) => {
      const invoiceId = line.invoice?.[0]?.id;
      if (invoiceId) {
        const existing = linesByInvoice.get(invoiceId) || [];
        existing.push(line);
        linesByInvoice.set(invoiceId, existing);
      }
    });

    // Group invoices by billing entity and season
    const invoicesByBEAndSeason = new Map<string, typeof invoices>();
    invoices.forEach((inv) => {
      const beLink = inv.billing_entity?.[0];
      const season = inv.season || new Date().getFullYear();
      if (beLink) {
        const key = `${beLink.id}-${season}`;
        const existing = invoicesByBEAndSeason.get(key) || [];
        existing.push(inv);
        invoicesByBEAndSeason.set(key, existing);

        // Also track this season
        allSeasons.add(season);
      }
    });

    // Process all billing entities with their invoices for each season they have data
    const processedEntities: ProcessedBillingEntity[] = [];

    billingEntities.forEach((be) => {
      const opNames = beToOperations.get(be.id) || [];
      const linkedContacts = beToContacts.get(be.id) || [];
      const beSeasonsSet = beSeasonMap.get(be.id) || new Set();

      // Also check for invoices without field seasons
      invoices.forEach((inv) => {
        if (inv.billing_entity?.[0]?.id === be.id && inv.season) {
          beSeasonsSet.add(inv.season);
        }
      });

      // Create an entry for each season this billing entity has data
      beSeasonsSet.forEach((season) => {
        const beInvoices = invoicesByBEAndSeason.get(`${be.id}-${season}`) || [];

        const processedInvoices = beInvoices.map((inv) => {
          const lines = linesByInvoice.get(inv.id) || [];
          const processedLines = lines.map((line) => {
            const fieldSeasonId = line.field_season?.[0]?.id;
            const fsInfo = fieldSeasonId ? fieldSeasonMap.get(fieldSeasonId) : null;
            return {
              id: line.id,
              fieldName: fsInfo?.fieldName || 'Unknown',
              serviceType: line.service_type || fsInfo?.serviceType || '',
              rate: line.rate || 0,
            };
          });

          return {
            id: inv.id,
            season: inv.season || season,
            amount: inv.amount || 0,
            status: inv.status?.value || 'Draft',
            sentAt: inv.sent_at,
            paidAt: inv.paid_at,
            notes: inv.notes || '',
            lines: processedLines,
          };
        });

        const totalBilled = processedInvoices.reduce((sum, inv) => sum + inv.amount, 0);
        const totalPaid = processedInvoices
          .filter((inv) => inv.status.toLowerCase() === 'paid')
          .reduce((sum, inv) => sum + inv.amount, 0);

        processedEntities.push({
          id: be.id,
          name: be.name,
          operation: opNames.length > 0 ? opNames.join(', ') : '—',
          invoiceContact: linkedContacts.length > 0 ? linkedContacts.map((c) => c.name).join(', ') : '—',
          invoiceContactEmail: linkedContacts[0]?.email,
          invoices: processedInvoices,
          totalBilled,
          totalPaid,
          season, // Add season to each entity entry
        });
      });
    });

    // Sort seasons descending (newest first)
    const sortedSeasons = Array.from(allSeasons).sort((a, b) => b - a);

    return {
      billingEntities: processedEntities,
      availableSeasons: sortedSeasons,
    };
  } catch (error) {
    console.error('Error fetching billing data:', error);
    return { billingEntities: [], availableSeasons: [new Date().getFullYear()] };
  }
}

export default async function BillingPage() {
  const { billingEntities, availableSeasons } = await getBillingData();
  return <BillingClient billingEntities={billingEntities} availableSeasons={availableSeasons} />;
}
