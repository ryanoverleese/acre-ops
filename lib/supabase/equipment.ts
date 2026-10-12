import 'server-only';
import { getRow, getRows, createRow, updateRow, type Row } from './adapter';
import { transaction } from './database';
import { positiveId, DataError } from './registry';
type Rack = {id: number; probe: {id: number}[]};

export async function moveProbe(probeId: number, sourceId: number | null, destinationId: number | null) {
  return transaction(async () => {
    await getRow('probes', positiveId(probeId));
    const occupied = await getRows<Rack>('probe_rack', {filters: {probe: probeId}});
    if (occupied.length > 1 || (occupied[0]?.id ?? null) !== sourceId)
      throw new DataError('The probe location changed; refresh before moving it', 409);
    if (sourceId === destinationId) return {success: true};
    if (destinationId !== null) {
      const destination = await getRow<Rack>('probe_rack', positiveId(destinationId));
      if (destination.probe.length) throw new DataError('The destination slot is occupied; refresh first', 409);
    }
    if (sourceId !== null) await updateRow('probe_rack', sourceId, {probe: []});
    if (destinationId !== null) await updateRow('probe_rack', destinationId, {probe: [probeId]});
    return {success: true};
  });
}

export async function replaceRmaProbe(input: Row) {
  return transaction(async () => {
    const oldId = positiveId(input.probeId), serial = String(input.serial || '').trim();
    if (!serial) throw new DataError('Replacement serial is required');
    const old = await getRow<{id: number; serial_number: string; brand: {id: number} | null; status: {value: string} | null}>('probes', oldId);
    const replacementNote = `RMA replacement for #${old.serial_number}`;
    const sameSerial = (await getRows<{id: number; serial_number: string; notes: string}>('probes',{search: serial})).filter(p => p.serial_number?.toLowerCase() === serial.toLowerCase());
    if (sameSerial.length) {
      if (sameSerial.length === 1 && old.status?.value === 'RMA' && sameSerial[0].notes === replacementNote)
        return {success: true, probe: sameSerial[0], alreadyReplaced: true};
      throw new DataError('That replacement serial is already registered',409);
    }
    const selectedIds = Array.isArray(input.assignmentIds) ? input.assignmentIds.map(positiveId) : [];
    if (new Set(selectedIds).size !== selectedIds.length) throw new DataError('Duplicate assignment selection');
    const assignments = await getRows<{id: number; field_season: {id: number}[]}>('probe_assignments',{filters:{probe:oldId}});
    const seasons = new Map((await getRows<{id: number; season: number}>('field_seasons')).map(row=>[row.id,row.season]));
    const current = assignments.filter(row => seasons.get(row.field_season[0]?.id) === new Date().getFullYear()).map(row=>row.id).sort((a,b)=>a-b);
    if (JSON.stringify([...selectedIds].sort((a,b)=>a-b)) !== JSON.stringify(current))
      throw new DataError('The selected probe assignments changed; refresh before replacing it',409);
    const racks = await getRows<Rack>('probe_rack',{filters:{probe:oldId}});
    if (racks.length>1) throw new DataError('The old probe is in multiple rack slots; review its location first',409);
    const replacement = await createRow<{id: number}>('probes',{serial_number:serial,brand:old.brand?.id ?? null,year_new:new Date().getFullYear(),status:'In Stock',notes:replacementNote,date_created:new Date().toISOString().slice(0,10)});
    for (const id of current) await updateRow('probe_assignments',id,{probe:[replacement.id]});
    await updateRow('probes',oldId,{status:'RMA'});
    for (const rack of racks) await updateRow('probe_rack',rack.id,{probe:[replacement.id]});
    const docs = await getRows<{id: number; description: string}>('documents',{filters:{name:'Probe RMA Records'}});
    if (docs.length>1) throw new DataError('Multiple RMA logs exist; consolidate them before saving',409);
    const description = [docs[0]?.description,`${new Date().toISOString().slice(0,10)} — ${old.serial_number}: RMA replaced by ${serial}`].filter(Boolean).join('\n');
    if (docs[0]) await updateRow('documents',docs[0].id,{description});
    else await createRow('documents',{name:'Probe RMA Records',description});
    return {success:true,probe:replacement};
  });
}
