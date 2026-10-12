import { NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/supabase/api';
import { createRow, updateRow, getRow, getRows } from '@/lib/supabase/adapter';
import { transaction, query } from '@/lib/supabase/database';
import { DataError, positiveId } from '@/lib/supabase/registry';
import { allocateFieldCharge } from '@/lib/billing-allocation';

export const POST = withApiAuth(async request => {
  const body = await request.json();
  const season = positiveId(body.season), fsId = positiveId(body.field_season_id);
  if (body.rate == null || body.rate === '') return NextResponse.json({ message: 'Skipped billing - no rate provided', invoice: null, invoiceLine: null, charges: [] });
  const rate = Number(body.rate);
  if (!Number.isFinite(rate) || rate < 0 || Math.abs(rate * 100 - Math.round(rate * 100)) > 0.00001)
    throw new DataError('Rate must be a non-negative amount with at most two decimal places');
  const result = await transaction(async () => {
    const fs = await getRow<{field: {id: number}[]; season: number}>('field_seasons', fsId);
    if (fs.season !== season) throw new DataError('Season does not match', 409);
    // All field billing comes from this join. A legacy billing_entity_id input
    // selects only the compatibility response, never the recipients of charges.
    const memberships = await query<{billing_entity_id: string}>('SELECT billing_entity_id FROM public.field_billing_entities WHERE field_id=$1 ORDER BY billing_entity_id', [fs.field[0]?.id]);
    const entityIds = memberships.map(row => Number(row.billing_entity_id));
    if (!entityIds.length) throw new DataError('Link a billing entity to this field before enrolling it', 409);
    const lines = await getRows<{id: number; invoice: {id: number}[]; quantity: number | null}>('invoice_lines', {filters: {field_season: fsId}});
    const existingInvoices = await getRows<{id: number; billing_entity: {id: number}[]; season: number; status?: {value: string}}>('invoices', {filters: {season}});
    const invoiceMap = new Map(existingInvoices.map(invoice => [invoice.id, invoice]));
    // Never silently delete an old recipient's charge or move posted money.
    if (lines.some(line => !entityIds.includes(invoiceMap.get(line.invoice[0]?.id)?.billing_entity[0]?.id ?? 0)))
      throw new DataError('Existing charges include an entity no longer linked to this field; review those charges first', 409);
    const quantity = body.quantity === undefined ? (entityIds.length === 1 ? (lines[0]?.quantity ?? 1) : 1) : Number(body.quantity);
    let allocations;
    try { allocations = allocateFieldCharge(rate, quantity, entityIds); }
    catch (error) { throw new DataError((error as Error).message); }
    const charges = [];
    for (const allocation of allocations) {
      const matches = existingInvoices.filter(invoice => invoice.billing_entity[0]?.id === allocation.billingEntityId);
      if (matches.length > 1) throw new DataError('Multiple invoices exist for this entity and season; review them before enrolling', 409);
      if (matches[0]?.status?.value && matches[0].status.value.toLowerCase() !== 'draft')
        throw new DataError('A linked invoice is no longer Draft; review it before changing charges', 409);
      const invoice = matches[0] || await createRow<{id: number}>('invoices', {billing_entity: [allocation.billingEntityId], season, status: 'Draft', amount: 0});
      const matchesLines = lines.filter(line => line.invoice[0]?.id === invoice.id);
      if (matchesLines.length > 1) throw new DataError('Duplicate field charges exist on an invoice; review them first', 409);
      const patch = {invoice: [invoice.id], field_season: [fsId], service_type: body.service_type || null, rate: allocation.rate, quantity: allocation.quantity};
      const invoiceLine = matchesLines[0] ? await updateRow('invoice_lines', matchesLines[0].id, patch) : await createRow('invoice_lines', patch);
      const total = (await query('SELECT coalesce(sum(line_total),0) AS total FROM public.invoice_lines_calculated WHERE invoice_id=$1', [invoice.id]))[0].total;
      const saved = await updateRow('invoices', invoice.id, {amount: total});
      charges.push({...allocation, invoice: saved, invoiceLine});
    }
    const selected = charges.find(charge => charge.billingEntityId === Number(body.billing_entity_id)) || charges[0];
    return {message: 'Saved equal billing shares', invoice: selected.invoice, invoiceLine: selected.invoiceLine, charges};
  });
  return NextResponse.json(result);
});
