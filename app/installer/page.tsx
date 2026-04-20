import { getRows, type Installer } from '@/lib/baserow';
import InstallerApp from './InstallerApp';

export const dynamic = 'force-dynamic';

export default async function InstallerPage() {
  let installers: Installer[] = [];
  try {
    installers = await getRows<Installer>('installers');
  } catch {
    installers = [];
  }

  // Only show installers that have a PIN set
  const withPin = installers.filter(i => i.name && i.pin);
  const displayNames = (withPin.length > 0 ? withPin : installers)
    .map(i => i.name!)
    .filter(Boolean);

  return <InstallerApp installerNames={displayNames} />;
}
