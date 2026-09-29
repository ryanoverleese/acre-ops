import WorkflowScreen from '../../workflows/WorkflowScreen';

export const dynamic = 'force-dynamic';

export default function RegisterProbePage() {
  return <WorkflowScreen initialWorkflow="register" returnToEquipment />;
}
