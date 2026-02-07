import { Badge } from '@/components/ui/badge';
import { Circle, AlertTriangle, Clock, Wrench } from 'lucide-react';

type StatusType = 'HEALTHY' | 'DEGRADED' | 'PROVISIONING' | 'MAINTENANCE' | 'ONLINE' | 'OFFLINE' | 'DRAINING';

const statusConfig: Record<StatusType, { variant: 'success' | 'warning' | 'error' | 'info' | 'default'; icon: typeof Circle }> = {
  HEALTHY: { variant: 'success', icon: Circle },
  ONLINE: { variant: 'success', icon: Circle },
  DEGRADED: { variant: 'error', icon: AlertTriangle },
  OFFLINE: { variant: 'error', icon: Circle },
  PROVISIONING: { variant: 'info', icon: Clock },
  DRAINING: { variant: 'warning', icon: Clock },
  MAINTENANCE: { variant: 'warning', icon: Wrench },
};

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status as StatusType] ?? { variant: 'default' as const, icon: Circle };
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="flex items-center gap-1.5">
      <Icon className="h-2.5 w-2.5" />
      {status}
    </Badge>
  );
}
