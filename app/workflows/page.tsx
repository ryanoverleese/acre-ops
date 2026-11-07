import WorkflowScreen from './WorkflowScreen';

import { staffMetadata } from '@/lib/site-metadata';

export const metadata = staffMetadata('workflows');

export const dynamic = 'force-dynamic';

export default function WorkflowsPage() {
  return <WorkflowScreen />;
}
