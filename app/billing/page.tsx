import { getBillingEntities, getInvoices, getInvoiceLines, getOperations, getContacts, getFieldSeasons, getFields, getProductsServices, getProbes } from '@/lib/baserow';
import { buildOperationMap, buildBillingToOperationMaps } from '@/lib/data-mappings';
import { allocateFieldCharge, fieldChargeBasis, type SavedFieldCharge } from '@/lib/billing-allocation';
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
    const fieldMap = new Map(fields.map((f) => [f.id, { name: f.name, billingEntityIds: [...new Set((f.billing_entity || []).map(be => be.id))] }]));

    // Build field_season_id → { quantity, invoiceLineId } map from invoice_lines
    const invoiceEntityMap = new Map(invoices.map(inv => [inv.id, inv.billing_entity?.[0]?.id]));
    const fsInvoiceLineMap = new Map<string, SavedFieldCharge & { invoiceLineId: number }>();
    invoiceLines.forEach((il) => {
      const fsId = il.field_season?.[0]?.id;
      const entityId = invoiceEntityMap.get(il.invoice?.[0]?.id ?? 0);
      if (fsId && entityId) {
        fsInvoiceLineMap.set(`${fsId}-${entityId}`, { rate: Number(il.rate ?? 0), quantity: Number(il.quantity ?? 1), invoiceLineId: il.id,
          field_unit_rate: il.field_unit_rate == null ? null : Number(il.field_unit_rate), field_quantity: il.field_quantity == null ? null : Number(il.field_quantity) });
      }
    });

    // Track field seasons grouped by billing entity and season
    // Key: "beId-season", Value: array of line items (field name, service type, rate, quantity)
    const beSeasonLines = new Map<string, { fieldSeasonId: number; invoiceLineId: number; fieldName: string; serviceType: string; rate: number; quantity: number; shareCount: number; shareIndex: number; fieldUnitRate: number | null; fieldQuantity: number | null; needsAllocation: boolean }[]>();
    const allSeasons = new Set<number>();

    fieldSeasons.forEach((fs) => {
      const fieldId = fs.field?.[0]?.id;
      const fieldInfo = fieldId ? fieldMap.get(fieldId) : null;
      const fieldName = fieldInfo?.name || fs.field?.[0]?.value || 'Unknown';
      const serviceType = fs.service_type?.[0]?.value || '';
      const billingEntityIds = fieldInfo?.billingEntityIds || [];
      // Ensure season is a number (Baserow may return it as string)
      const season = typeof fs.season === 'string' ? parseInt(fs.season, 10) : (fs.season || new Date().getFullYear());

      // Look up rate from service_rates table
      const lookupRate = serviceType ? rateMap.get(serviceType.toLowerCase()) : undefined;
      const rate = typeof lookupRate === 'number' ? lookupRate : 0;

      if (season) {
        allSeasons.add(season);
      }

      // Group by billing entity and season
      const allocations = billingEntityIds.length ? allocateFieldCharge(rate, 1, billingEntityIds) : [];
      const savedLines = billingEntityIds.map(id => fsInvoiceLineMap.get(`${fs.id}-${id}`)).filter(line => !!line);
      const basis = fieldChargeBasis(savedLines, rate);
      const savedAmounts = savedLines.map(line => Math.round(line.rate * line.quantity * 100));
      const needsAllocation = savedLines.length > 0 && billingEntityIds.length > 1 &&
        (savedLines.length !== billingEntityIds.length || Math.max(...savedAmounts) - Math.min(...savedAmounts) > 1);
      for (const allocation of allocations) {
        const billingEntityId = allocation.billingEntityId;
        if (!season) continue;
        const key = `${billingEntityId}-${season}`;
        const existing = beSeasonLines.get(key) || [];
        const ilData = fsInvoiceLineMap.get(`${fs.id}-${billingEntityId}`);
        existing.push({ fieldSeasonId: fs.id, invoiceLineId: ilData?.invoiceLineId || 0, fieldName,
          serviceType, rate: ilData?.rate ?? allocation.rate, quantity: ilData?.quantity ?? allocation.quantity,
          shareCount: allocations.length, shareIndex: allocation.shareIndex, ...basis, needsAllocation });
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

      // Find all seasons this billing entity has field seasons for OR an invoice for.
      // Union of the field-service rollup and the invoices table keyed on billing_entity,
      // so invoice-only entities (e.g. a Davis weather station, no probe field_seasons) still show.
      const beSeasonsSet = new Set<number>();
      beSeasonLines.forEach((_, key) => {
        const [beIdStr, seasonStr] = key.split('-');
        if (parseInt(beIdStr) === be.id) {
          beSeasonsSet.add(parseInt(seasonStr));
        }
      });
      invoicesByBEAndSeason.forEach((_, key) => {
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

        // Calculate totals from lines. For invoice-only entities (no field-service
        // rollup), fall back to the invoice's own amount so the row still has a value.
        const linesSubtotal = lines.reduce((sum, line) => sum + (line.rate * line.quantity), 0);
        const subtotal = lines.length > 0
          ? linesSubtotal
          : (invoice?.amount != null ? Number(invoice.amount) : 0);

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
          checkNumber: invoice?.check_number ? Number(invoice.check_number) : undefined,
          // For invoice-only entities (no field-service lines), fall back to the invoice's
          // own amount so Actual Billed is populated. Line-based rows keep null = unentered.
          actualBilledAmount: invoice?.actual_billed_amount != null
            ? Number(invoice.actual_billed_amount)
            : (lines.length === 0 && invoice?.amount != null ? Number(invoice.amount) : undefined),
          invoiceNumber: invoice?.invoice_number ? Number(invoice.invoice_number) : undefined,
          matchedInQb: invoice?.matched_in_qb ?? false,
          lines: lines.map((line) => ({
            id: line.fieldSeasonId,
            invoiceLineId: line.invoiceLineId,
            fieldName: line.fieldName,
            serviceType: line.serviceType,
            rate: line.rate,
            quantity: line.quantity,
            shareCount: line.shareCount,
            shareIndex: line.shareIndex,
            fieldUnitRate: line.fieldUnitRate,
            fieldQuantity: line.fieldQuantity,
            needsAllocation: line.needsAllocation,
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
    const operationBulkFields = new Map<string, Set<number>>();
    processedEntities.forEach((entity) => {
      const opKey = `${entity.operation}-${entity.season}`;
      const fieldIds = operationBulkFields.get(opKey) || new Set<number>();
      entity.invoices[0]?.lines.filter(line => line.serviceType.toLowerCase().includes('bulk')).forEach(line => fieldIds.add(line.id));
      operationBulkFields.set(opKey, fieldIds);
    });

    // Add operation bulk count to each entity so client can calculate discount
    processedEntities.forEach((entity) => {
      const opKey = `${entity.operation}-${entity.season}`;
      entity.operationBulkFieldCount = operationBulkFields.get(opKey)?.size || 0;
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
      const brandLower = group.brand.toLowerCase();
      const matchingService = group.isTrade
        ? // Try full brand name first, then fall back to first word only
          (productsServices.find((ps) =>
            ps.service_type?.toLowerCase().includes('trade') &&
            ps.service_type?.toLowerCase().includes(brandLower)
          ) ?? productsServices.find((ps) =>
            ps.service_type?.toLowerCase().includes('trade') &&
            ps.service_type?.toLowerCase().includes(brandLower.split(' ')[0])
          ))
        : productsServices.find((ps) =>
            ps.service_type?.toLowerCase().includes(brandLower) &&
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
