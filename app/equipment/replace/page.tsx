import WorkflowScreen from '../../workflows/WorkflowScreen';

import { staffMetadata } from '@/lib/site-metadata';

export const metadata = staffMetadata('equipmentReplace');

export const dynamic = 'force-dynamic';

export default function ReplaceProbePage() {
  return <WorkflowScreen initialWorkflow="rma" returnToEquipment />;
}
