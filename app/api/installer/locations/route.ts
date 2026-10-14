import { fieldOperationLabel } from '@/lib/data-mappings';
import { withApiAuth } from '@/lib/supabase/api';
import { NextResponse } from 'next/server';
import { getCachedRows } from '@/lib/supabase/adapter';
import type { Field, FieldSeason, ProbeAssignment, Operation, Contact } from '@/lib/types';

export const dynamic = 'force-dynamic';

export interface InstallerFieldLocation {
  id: number;
  name: string;
  operation: string;
  acres: number;
  // Planned location (from fields table)
  lat: number;
  lng: number;
  // Installed location (from probe_assignments)
  installLat?: number;
  installLng?: number;
  waterSource?: string;
  fuelSource?: string;
  notes?: string;
  // Irrigation details
  irrigationType?: string;
  rowDirection?: string;
  dripTubingDirection?: string;
  dripTubingSpacing?: number;
  dripEmitterSpacing?: number;
  dripZones?: number;
  dripGpm?: number;
  dripDepth?: number;
  // Location data
  elevation?: string | number;
  soilType?: string;
  placementNotes?: string;
}

export const GET = withApiAuth(async function GET() {
  try {
    const [fields, operations, fieldSeasons, probeAssignments, contacts] = await Promise.all([
      getCachedRows<Field>('fields', undefined, 120),
      getCachedRows<Operation>('operations', undefined, 300),
      getCachedRows<FieldSeason>('field_seasons', undefined, 60),
      getCachedRows<ProbeAssignment>('probe_assignments', undefined, 60),
      getCachedRows<Contact>('contacts', undefined, 300),
    ]);

    const operationMap = new Map(operations.map((op) => [op.id, op.name]));

    // Map billing entity to operation through contacts
    const billingToOperationMap = new Map<number, number[]>();
    contacts.forEach((contact) => {
      const contactOpIds = contact.operations?.map((op) => op.id) || [];
      const contactBeIds = contact.billing_entity?.map((be) => be.id) || [];
      contactBeIds.forEach((beId) => {
        contactOpIds.forEach((opId) => {
          const ids = billingToOperationMap.get(beId) || [];
          if (!ids.includes(opId)) ids.push(opId);
          billingToOperationMap.set(beId, ids);
        });
      });
    });

    // Map field_season IDs to field IDs for probe_assignments lookup
    const fsToFieldMap = new Map<number, number>();
    fieldSeasons.forEach((fs) => {
      const fieldId = fs.field?.[0]?.id;
      if (fieldId) fsToFieldMap.set(fs.id, fieldId);
    });

    // Most recent install location per field from probe_assignments
    const installLocationMap = new Map<number, { lat: number; lng: number }>();
    probeAssignments.forEach((pa) => {
      const fsId = pa.field_season?.[0]?.id;
      const fieldId = fsId ? fsToFieldMap.get(fsId) : undefined;
      if (fieldId && pa.install_lat && pa.install_lng) {
        installLocationMap.set(fieldId, { lat: pa.install_lat, lng: pa.install_lng });
      }
    });

    const result: InstallerFieldLocation[] = fields
      .map((field) => {
        const operationName = fieldOperationLabel(field, billingToOperationMap, operationMap);
        const installLocation = installLocationMap.get(field.id);
        return {
          id: field.id,
          name: field.name || 'Unnamed Field',
          operation: operationName,
          acres: field.acres || 0,
          lat: field.lat || 0,
          lng: field.lng || 0,
          installLat: installLocation?.lat,
          installLng: installLocation?.lng,
          waterSource: field.water_source?.value,
          fuelSource: field.fuel_source?.value,
          notes: field.notes,
          irrigationType: field.irrigation_type?.value,
          rowDirection: field.row_direction?.value,
          dripTubingDirection: field.drip_tubing_direction?.value,
          dripTubingSpacing: field.drip_tubing_spacing,
          dripEmitterSpacing: field.drip_emitter_spacing,
          dripZones: field.drip_zones,
          dripGpm: field.drip_gpm,
          dripDepth: field.drip_depth,
          elevation: typeof field.elevation === 'object' ? field.elevation?.value : field.elevation,
          soilType: typeof field.soil_type === 'object' ? field.soil_type?.value : field.soil_type,
          placementNotes: field.placement_notes,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ fields: result });
  } catch (error) {
    console.error('installer locations error:', error);
    return NextResponse.json({ error: 'Failed to fetch locations' }, { status: 500 });
  }
});
