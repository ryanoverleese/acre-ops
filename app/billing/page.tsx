import { getBillingEntities, getInvoices, getInvoiceLines, getOperations, getContacts, getFieldSeasons, getFields, getProductsServices, getProbes } from '@/lib/baserow';
import { buildOperationMap, buildBillingToOperationMaps } from '@/lib/data-mappings';
import BillingClient, { ProcessedBillingEntity, OnOrderLine } from './BillingClient';

interface BillingData {
  billingEntities: ProcessedBillingEntity[];
  availableSeasons: number[];
  onOrderLines: OnOrderLine[];
}

async function getBillingData(): Promise<BillingData> {
  try {
    const [billingEntities, invoices, invoiceLines, operations, contacts, fieldSeasons, fields, productsServices, probes] = await Promise.all([
      getBillingEntities(),
      getInvoices(),
      getInvoiceLines(),
      getOperations(),
      getContacts(),
      getFieldSeasons(),
      getFields(),
      getProductsServices(),
      getProbes(),
    ]);

    const operationMap = buildOperationMap(operations);

    // Build service rate lookup by service type name (ensure rate is a number)
    const rateMap = new Map(productsServices.map((sr) => {
      const rate = typeof sr.rate === 'string' ? parseFloat(sr.rate) : (sr.rate || 0);
      return [sr.service_type?.toLowerCase(), isNaN(rate) ? 0 : rate];
    }));

    const { billingToOperationNames } = buildBillingToOperationMaps(contacts, operationMap);

    // Build billing entity -> contacts map
    const beToContacts = new Map<number, { name: string; email?: string }[]>();
    contacts.forEach((contact) => {
      const contactBeIds = contact.billing_entity?.map((be) => be.id) || [];
      contactBeIds.forEach((beId) => {
        const existingContacts = beToContacts.get(beId) || [];
        if (!existingContacts.some((c) => c.name === contact.name)) {
          existingContacts.push({ name: contact.name, email: contact.email });
        }
        beToContacts.set(beId, existingContacts);
      });
    });

    // Build map of field ID to field details (including billing entity)
    const fieldMap = new Map(fields.map((f) => [f.id, { name: f.name, billingEntityId: f.billing_entity?.[0]?.id }]));

    // Build field_season_id → { quantity, invoiceLineId } map from invoice_lines
    const fsInvoiceLineMap = new Map<number, { quantity: number; invoiceLineId: number }>();
    invoiceLines.forEach((il) => {
      const fsId = il.field_season?.[0]?.id;
      if (fsId) {
        fsInvoiceLineMap.set(fsId, { quantity: il.quantity || 1, invoiceLineId: il.id });
      }
    });

    // Track field seasons grouped by billing entity and season
    // Key: "beId-season", Value: array of line items (field name, service type, rate, quantity)
    const beSeasonLines = new Map<string, { fieldSeasonId: number; invoiceLineId: number; fieldName: string; serviceType: string; rate: number; quantity: number }[]>();
    const allSeasons = new Set<number>();

    fieldSeasons.forEach((fs) => {
      const fieldId = fs.field?.[0]?.id;
      const fieldInfo = fieldId ? fieldMap.get(fieldId) : null;
      const fieldName = fieldInfo?.name || fs.field?.[0]?.value || 'Unknown';
      const serviceType = fs.service_type?.[0]?.value || '';
      const billingEntityId = fieldInfo?.billingEntityId;
      // Ensure season is a number (Baserow may return it as string)
      const season = typeof fs.season === 'string' ? parseInt(fs.season, 10) : (fs.season || new Date().getFullYear());

      // Look up rate from service_rates table
      const lookupRate = serviceType ? rateMap.get(serviceType.toLowerCase()) : undefined;
      const rate = typeof lookupRate === 'number' ? lookupRate : 0;

      if (season) {
        allSeasons.add(season);
      }

      // Group by billing entity and season
      if (billingEntityId && season) {
        const key = `${billingEntityId}-${season}`;
        const existing = beSeasonLines.get(key) || [];
        const ilData = fsInvoiceLineMap.get(fs.id);
        existing.push({ fieldSeasonId: fs.id, invoiceLineId: ilData?.invoiceLineId || 0, fieldName, serviceType, rate, quantity: ilData?.quantity || 1 });
        beSeasonLines.set(key, existing);
      }
    });

    // Also track invoices by billing entity and season for status/notes
    const invoicesByBEAndSeason = new Map<string, typeof invoices[0]>();
    invoices.forEach((inv) => {
      const beLink = inv.billing_entity?.[0];
      // Ensure season is a number (Baserow may return it as string)
      const season = typeof inv.season === 'string' ? parseInt(inv.season, 10) : (inv.season || new Date().getFullYear());
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
      const opNames = billingToOperationNames.get(be.id) || [];
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
        const subtotal = lines.reduce((sum, line) => sum + (line.rate * line.quantity), 0);

        // Create processed invoice structure
        const processedInvoice = {
          id: invoice?.id || 0,
          season: season,
          amount: subtotal,
          status: invoice?.status?.value || 'Draft',
          sentAt: invoice?.sent_at,
          depositAt: invoice?.deposit_at,
          paidAt: invoice?.paid_at,
          notes: invoice?.notes || '',
          checkNumber: invoice?.checu_number ? Number(invoice.checu_number) : undefined,
          actualBilledAmount: invoice?.actual_billed_amount ? Number(invoice.actual_billed_amount) : undefined,
          lines: lines.map((line) => ({
            id: line.fieldSeasonId,
            invoiceLineId: line.invoiceLineId,
            fieldName: line.fieldName,
            serviceType: line.serviceType,
            rate: line.rate,
            quantity: line.quantity,
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

    // Calculate bulk field counts per operation per season (for discount calculation)
    // Key: "operation-season", Value: count of bulk fields
    const operationBulkCounts = new Map<string, number>();
    processedEntities.forEach((entity) => {
      const opKey = `${entity.operation}-${entity.season}`;
      const bulkCount = entity.invoices[0]?.lines.filter(
        (line) => line.serviceType.toLowerCase().includes('bulk')
      ).length || 0;
      operationBulkCounts.set(opKey, (operationBulkCounts.get(opKey) || 0) + bulkCount);
    });

    // Add operation bulk count to each entity so client can calculate discount
    processedEntities.forEach((entity) => {
      const opKey = `${entity.operation}-${entity.season}`;
      entity.operationBulkFieldCount = operationBulkCounts.get(opKey) || 0;
    });

    // Build on-order probe lines grouped by billing entity + brand + trade status
    const onOrderProbes = probes.filter((p) =>
      (p.status?.value === 'On Order' || p.status?.value === 'On Order - Trade') && p.billing_entity?.length
    );
    const onOrderGrouped = new Map<string, { billingEntityId: number; billingEntityName: string; brand: string; isTrade: boolean; count: number }>();
    onOrderProbes.forEach((p) => {
      const beId = p.billing_entity![0].id;
      const beName = p.billing_entity![0].value;
      const brand = p.brand?.value || 'Unknown';
      const isTrade = p.is_trade === true || p.status?.value === 'On Order - Trade';
      const key = `${beId}-${brand}-${isTrade ? 'trade' : 'new'}`;
      const existing = onOrderGrouped.get(key);
      if (existing) {
        existing.count++;
      } else {
        onOrderGrouped.set(key, { billingEntityId: beId, billingEntityName: beName, brand, isTrade, count: 1 });
      }
    });

    // Match each on-order group to a products_services rate
    // Trade probes match "Trade-In" service types, regular probes match by brand name
    const onOrderLines: OnOrderLine[] = Array.from(onOrderGrouped.values()).map((group) => {
      const matchingService = group.isTrade
        ? productsServices.find((ps) =>
            ps.service_type?.toLowerCase().includes('trade') &&
            ps.service_type?.toLowerCase().includes(group.brand.toLowerCase().split(' ')[0])
          )
        : productsServices.find((ps) =>
            ps.service_type?.toLowerCase().includes(group.brand.toLowerCase()) &&
            !ps.service_type?.toLowerCase().includes('trade')
          );
      const rate = matchingService
        ? (typeof matchingService.rate === 'string' ? parseFloat(matchingService.rate) : (matchingService.rate || 0))
        : 0;
      return {
        billingEntityId: group.billingEntityId,
        billingEntityName: group.billingEntityName,
        brand: group.brand,
        serviceType: matchingService?.service_type || `${group.brand} Sensor${group.isTrade ? ' - Trade-In' : ''}`,
        quantity: group.count,
        rate: isNaN(rate) ? 0 : rate,
      };
    });

    // Sort seasons descending (newest first)
    const sortedSeasons = Array.from(allSeasons).sort((a, b) => b - a);

    return {
      billingEntities: processedEntities,
      availableSeasons: sortedSeasons,
      onOrderLines,
    };
  } catch (error) {
    console.error('Error fetching billing data:', error);
    return { billingEntities: [], availableSeasons: [new Date().getFullYear()], onOrderLines: [] };
  }
}

export default async function BillingPage() {
  const { billingEntities, availableSeasons, onOrderLines } = await getBillingData();
  return <BillingClient billingEntities={billingEntities} availableSeasons={availableSeasons} onOrderLines={onOrderLines} />;
}
