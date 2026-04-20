import fs from 'fs';
import path from 'path';
import { getAllSelectOptionsWithMeta } from '@/lib/baserow';
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

function getConfiguredInstallers(): string[] {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'installer-pins.json'), 'utf-8');
    return Object.keys(JSON.parse(raw));
  } catch {
    return [];
  }
}

export default async function InstallerPage() {
  const [installerNames, configuredInstallers] = await Promise.all([
    getInstallerNames(),
    Promise.resolve(getConfiguredInstallers()),
  ]);

  // Show installers that have a PIN configured; fall back to all names if none configured
  const withPins = installerNames.filter((n) => configuredInstallers.includes(n));
  const displayNames = withPins.length > 0 ? withPins : installerNames;

  return <InstallerApp installerNames={displayNames} />;
}
