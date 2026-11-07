import WorkflowScreen from '../../workflows/WorkflowScreen';

import { staffMetadata } from '@/lib/site-metadata';

export const metadata = staffMetadata('equipmentRegister');

export const dynamic = 'force-dynamic';

export default function RegisterProbePage() {
  return <WorkflowScreen initialWorkflow="register" returnToEquipment />;
}
