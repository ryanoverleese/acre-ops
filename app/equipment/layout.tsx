import type { ReactNode } from 'react';
import EquipmentShell from '@/components/equipment/EquipmentShell';

export default function EquipmentLayout({ children }: { children: ReactNode }) {
  return <EquipmentShell>{children}</EquipmentShell>;
}
