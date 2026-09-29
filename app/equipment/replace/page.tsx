import WorkflowScreen from '../../workflows/WorkflowScreen';

export const dynamic = 'force-dynamic';

export default function ReplaceProbePage() {
  return <WorkflowScreen initialWorkflow="rma" returnToEquipment />;
}
