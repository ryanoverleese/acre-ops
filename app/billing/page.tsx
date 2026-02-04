import { getBillingEntities, getInvoices, getOperations, getContacts, getFieldSeasons, getFields, getServiceRates } from '@/lib/baserow';
import BillingClient, { ProcessedBillingEntity } from './BillingClient';

interface BillingData {
  billingEntities: ProcessedBillingEntity[];
  availableSeasons: number[];
}

async function getBillingData(): Promise<BillingData> {
  try {
    const [billingEntities, invoices, operations, contacts, fieldSeasons, fields, serviceRates] = await Promise.all([
      getBillingEntities(),
      getInvoices(),
      getOperations(),
      getContacts(),
      getFieldSeasons(),
      getFields(),
      getServiceRates(),
    ]);

    // Debug logging
    console.log('=== BILLING DEBUG ===');
    console.log('Billing entities count:', billingEntities.length);
    console.log('Field seasons count:', fieldSeasons.length);
    console.log('Fields count:', fields.length);
    console.log('Service rates count:', serviceRates.length);

    // Check how many fields have billing_entity set
    const fieldsWithBE = fields.filter(f => f.billing_entity?.[0]?.id);
    console.log('Fields with billing_entity:', fieldsWithBE.length);

    // Sample a field that has billing_entity
    if (fieldsWithBE.length > 0) {
      console.log('Sample field with BE:', { id: fieldsWithBE[0].id, name: fieldsWithBE[0].name, be: fieldsWithBE[0].billing_entity });
    }

    // Sample field seasons
    if (fieldSeasons.length > 0) {
      const fs = fieldSeasons[0];
      const fieldId = fs.field?.[0]?.id;
      const field = fieldId ? fields.find(f => f.id === fieldId) : null;
      console.log('Sample field season:', { id: fs.id, fieldLink: fs.field, season: fs.season, serviceType: fs.service_type?.value });
      console.log('Linked field:', field ? { id: field.id, name: field.name, be: field.billing_entity } : 'not found');
    }
    console.log('=== END DEBUG ===');

    const operationMap = new Map(operations.map((op) => [op.id, op.name]));

    // Build service rate lookup by service type name
    const rateMap = new Map(serviceRates.map((sr) => [sr.service_type?.toLowerCase(), sr.rate || 0]));

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

    // Track field seasons grouped by billing entity and season
    // Key: "beId-season", Value: array of line items (field name, service type, rate)
    const beSeasonLines = new Map<string, { fieldSeasonId: number; fieldName: string; serviceType: string; rate: number }[]>();
    const allSeasons = new Set<number>();

    fieldSeasons.forEach((fs) => {
      const fieldId = fs.field?.[0]?.id;
      const fieldInfo = fieldId ? fieldMap.get(fieldId) : null;
      const fieldName = fieldInfo?.name || fs.field?.[0]?.value || 'Unknown';
      const serviceType = fs.service_type?.value || '';
      const billingEntityId = fieldInfo?.billingEntityId;
      const season = fs.season || new Date().getFullYear();

      // Look up rate from service_rates table
      const rate = rateMap.get(serviceType.toLowerCase()) || 0;

      if (season) {
        allSeasons.add(season);
      }

      // Group by billing entity and season
      if (billingEntityId && season) {
        const key = `${billingEntityId}-${season}`;
        const existing = beSeasonLines.get(key) || [];
        existing.push({ fieldSeasonId: fs.id, fieldName, serviceType, rate });
        beSeasonLines.set(key, existing);
      }
    });

    // Also track invoices by billing entity and season for status/notes
    const invoicesByBEAndSeason = new Map<string, typeof invoices[0]>();
    invoices.forEach((inv) => {
      const beLink = inv.billing_entity?.[0];
      const season = inv.season || new Date().getFullYear();
      if (beLink) {
        const key = `${beLink.id}-${season}`;
        // Use first invoice if multiple exist
        if (!invoicesByBEAndSeason.has(key)) {
          invoicesByBEAndSeason.set(key, inv);
        }
        allSeasons.add(season);
      }
    });

    // Process billing entities that have field seasons
    const processedEntities: ProcessedBillingEntity[] = [];

    billingEntities.forEach((be) => {
      const opNames = beToOperations.get(be.id) || [];
      const linkedContacts = beToContacts.get(be.id) || [];

      // Find all seasons this billing entity has field seasons for
      const beSeasonsSet = new Set<number>();
      beSeasonLines.forEach((_, key) => {
        const [beIdStr, seasonStr] = key.split('-');
        if (parseInt(beIdStr) === be.id) {
          beSeasonsSet.add(parseInt(seasonStr));
        }
      });

      // Create an entry for each season this billing entity has field seasons
      beSeasonsSet.forEach((season) => {
        const key = `${be.id}-${season}`;
        const lines = beSeasonLines.get(key) || [];
        const invoice = invoicesByBEAndSeason.get(key);

        // Calculate totals from lines
        const subtotal = lines.reduce((sum, line) => sum + line.rate, 0);

        // Create processed invoice structure
        const processedInvoice = {
          id: invoice?.id || 0,
          season: season,
          amount: subtotal,
          status: invoice?.status?.value || 'Draft',
          sentAt: invoice?.sent_at,
          paidAt: invoice?.paid_at,
          notes: invoice?.notes || '',
          lines: lines.map((line) => ({
            id: line.fieldSeasonId,
            fieldName: line.fieldName,
            serviceType: line.serviceType,
            rate: line.rate,
          })),
        };

        const totalBilled = subtotal;
        const totalPaid = processedInvoice.status.toLowerCase() === 'paid' ? subtotal : 0;

        processedEntities.push({
          id: be.id,
          name: be.name,
          operation: opNames.length > 0 ? opNames.join(', ') : '—',
          invoiceContact: linkedContacts.length > 0 ? linkedContacts.map((c) => c.name).join(', ') : '—',
          invoiceContactEmail: linkedContacts[0]?.email,
          invoices: [processedInvoice],
          totalBilled,
          totalPaid,
          season,
        });
      });
    });

    // Sort seasons descending (newest first)
    const sortedSeasons = Array.from(allSeasons).sort((a, b) => b - a);

    console.log('=== BILLING RESULTS ===');
    console.log('Processed entities:', processedEntities.length);
    console.log('Available seasons:', sortedSeasons);
    if (processedEntities.length > 0) {
      console.log('Sample entity:', { id: processedEntities[0].id, name: processedEntities[0].name, season: processedEntities[0].season, lineCount: processedEntities[0].invoices[0]?.lines.length });
    }
    console.log('=== END RESULTS ===');

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
