import { getAllSelectOptionsWithMeta } from '@/lib/baserow';
import { readPins } from '@/app/api/installer-pins/route';
import InstallerApp from './InstallerApp';

export const dynamic = 'force-dynamic';

async function getInstallerNames(): Promise<string[]> {
  try {
    const opts = await getAllSelectOptionsWithMeta(['probe_assignments']);
    const options = opts.probe_assignments?.planned_installer?.options ?? [];
    return options.map((o: { value: string }) => o.value).filter(Boolean);
  } catch {
    return [];
  }
}

export default async function InstallerPage() {
  const [installerNames, pins] = await Promise.all([
    getInstallerNames(),
    Promise.resolve(readPins()),
  ]);

  // Only show installers that have a PIN configured
  const configuredNames = installerNames.filter((n) => !!pins[n]);
  // Fall back to all names if none have PINs yet (dev/setup mode)
  const displayNames = configuredNames.length > 0 ? configuredNames : installerNames;

  return <InstallerApp installerNames={displayNames} />;
}
