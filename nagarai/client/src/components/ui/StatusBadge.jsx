import { Clock, RefreshCw, CheckCircle2, XCircle, Gift } from 'lucide-react';
import { Badge } from './Badge';

const MAP = {
  pending: { variant: 'warning', icon: Clock, label: 'Pending' },
  'in-progress': { variant: 'default', icon: RefreshCw, label: 'In Progress' },
  completed: { variant: 'success', icon: CheckCircle2, label: 'Completed' },
  rejected: { variant: 'danger', icon: XCircle, label: 'Rejected' },
  ready: { variant: 'default', icon: Gift, label: 'Ready' },
};

export default function StatusBadge({ status }) {
  const cfg = MAP[status] || { variant: 'muted', icon: Clock, label: status };
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.variant}>
      <Icon className="h-3 w-3" /> {cfg.label}
    </Badge>
  );
}
