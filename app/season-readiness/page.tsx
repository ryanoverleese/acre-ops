import { getFieldsData } from '@/lib/fields-data';
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
  // Probe 2 (null = field only has 1 probe)
  hasProbe2: boolean;
  probe2: boolean;
  antenna2: boolean;
  battery2: boolean;
  // Derived
  installed: boolean;
  readyScore: number;
  totalChecks: number;
}

export default async function SeasonReadinessPage() {
  const year = new Date().getFullYear();
  const { fields } = await getFieldsData(year);

  // Only fields that have a field season this year
  const seasonFields = fields.filter((f) => f.fieldSeasonId !== null);

  const rows: ReadinessRow[] = seasonFields.map((f) => {
    const hasProbe2 = !!f.probe2Id || !!f.probe2AntennaType || !!f.probe2BatteryType;

    const probe1     = !!f.probeId;
    const antenna1   = !!f.antennaType;
    const battery1   = !!f.batteryType;
    const probe2     = hasProbe2 ? !!f.probe2Id : false;
    const antenna2   = hasProbe2 ? !!f.probe2AntennaType : false;
    const battery2   = hasProbe2 ? !!f.probe2BatteryType : false;
    const hasInstaller = !!f.plannedInstaller || !!f.installer;

    const installed = !!f.installDate || f.probeStatus === 'Installed';

    const checks = hasProbe2
      ? [probe1, antenna1, battery1, probe2, antenna2, battery2, hasInstaller]
      : [probe1, antenna1, battery1, hasInstaller];

    const readyScore  = checks.filter(Boolean).length;
    const totalChecks = checks.length;

    return {
      fieldSeasonId:   f.fieldSeasonId!,
      fieldName:       f.name,
      operation:       f.operation,
      lat:             f.lat,
      lng:             f.lng,
      plannedInstaller: f.plannedInstaller || '',
      installer:       f.installer || '',
      installDate:     f.installDate || '',
      hasProbe2,
      probe1, antenna1, battery1,
      probe2, antenna2, battery2,
      installed,
      readyScore,
      totalChecks,
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
