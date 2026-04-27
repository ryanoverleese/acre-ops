import { getFieldsData } from '@/lib/fields-data';
import { getProbes } from '@/lib/baserow';
import SeasonReadinessClient from './SeasonReadinessClient';

export const dynamic = 'force-dynamic';

export interface ReadinessRow {
  fieldSeasonId: number;
  fieldName: string;
  operation: string;
  lat: number;
  lng: number;
  plannedInstaller: string;
  installer: string;
  installDate: string;
  // Probe 1
  probe1: boolean;
  antenna1: boolean;
  battery1: boolean;
  // Probe 2
  hasProbe2: boolean;
  probe2: boolean;
  antenna2: boolean;
  battery2: boolean;
  // Location approval
  locationApproved: boolean;
  approvalStatus: string;
  // Probe location info (informational)
  probe1Location: 'on-rack' | 'on-order' | 'in-field' | 'none';
  probe2Location: 'on-rack' | 'on-order' | 'in-field' | 'none';
  // Derived
  installed: boolean;
  readyScore: number;
  totalChecks: number;
}

export default async function SeasonReadinessPage() {
  const year = new Date().getFullYear();
  const [{ fields }, rawProbes] = await Promise.all([
    getFieldsData(year),
    getProbes(),
  ]);

  // Build probe rack map: probeId → has rack assigned
  const probeRackMap = new Map<number, boolean>();
  rawProbes.forEach((p) => {
    probeRackMap.set(p.id, !!p.rack);
  });

  const seasonFields = fields.filter((f) => f.fieldSeasonId !== null);

  const rows: ReadinessRow[] = seasonFields.map((f) => {
    const hasProbe2 = !!f.probe2Id || !!f.probe2AntennaType || !!f.probe2BatteryType;

    const probe1           = !!f.probeId;
    const antenna1         = !!f.antennaType;
    const battery1         = !!f.batteryType;
    const probe2           = hasProbe2 ? !!f.probe2Id : false;
    const antenna2         = hasProbe2 ? !!f.probe2AntennaType : false;
    const battery2         = hasProbe2 ? !!f.probe2BatteryType : false;
    const hasInstaller     = !!f.plannedInstaller || !!f.installer;
    const locationApproved = f.approvalStatus === 'Approved';
    const installed        = !!f.installDate || f.probeStatus === 'Installed';

    // Probe location: on-rack, on-order (assigned but no serial), in-field (installed), none
    function probeLocation(probeId: number | null, probeStr: string | null, isInstalled: boolean): ReadinessRow['probe1Location'] {
      if (!probeId) return 'none';
      if (isInstalled) return 'in-field';
      if (probeRackMap.get(probeId)) return 'on-rack';
      if (probeStr?.includes('On Order')) return 'on-order';
      return 'on-rack'; // has serial, not installed → assume on rack
    }

    const probe1Location = probeLocation(f.probeId, f.probe, installed);
    const probe2Location = probeLocation(f.probe2Id, f.probe2, installed);

    const checks = hasProbe2
      ? [probe1, antenna1, battery1, probe2, antenna2, battery2, hasInstaller, locationApproved]
      : [probe1, antenna1, battery1, hasInstaller, locationApproved];

    return {
      fieldSeasonId:    f.fieldSeasonId!,
      fieldName:        f.name,
      operation:        f.operation,
      lat:              f.lat,
      lng:              f.lng,
      plannedInstaller: f.plannedInstaller || '',
      installer:        f.installer || '',
      installDate:      f.installDate || '',
      hasProbe2,
      probe1, antenna1, battery1,
      probe2, antenna2, battery2,
      locationApproved,
      approvalStatus:   f.approvalStatus || 'Pending',
      probe1Location,
      probe2Location,
      installed,
      readyScore:  checks.filter(Boolean).length,
      totalChecks: checks.length,
    };
  });

  rows.sort((a, b) => a.readyScore - b.readyScore || a.fieldName.localeCompare(b.fieldName));

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Season Readiness — {year}</h2>
        </div>
      </header>
      <div className="content">
        <SeasonReadinessClient rows={rows} year={year} />
      </div>
    </>
  );
}
