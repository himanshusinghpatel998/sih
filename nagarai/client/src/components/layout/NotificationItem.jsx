import { FileText, Sparkles, User, Radio, Bell } from 'lucide-react';
import { cn } from '../../lib/utils';
import { fmtDate } from '../../utils/helpers';

const ICONS = { complaint: FileText, reward: Sparkles, user: User, iot: Radio, incident: Bell };
const TONES = {
  complaint: 'bg-brand-500/10 text-brand-600 dark:text-brand-400',
  reward: 'bg-signal-500/10 text-signal-600 dark:text-signal-400',
  user: 'bg-muted text-muted-foreground',
  iot: 'bg-danger-500/10 text-danger-600 dark:text-danger-400',
  incident: 'bg-danger-500/10 text-danger-600 dark:text-danger-400',
};

export default function NotificationItem({ notification, onClick }) {
  const Icon = ICONS[notification.type] || Bell;
  const tone = TONES[notification.type] || 'bg-muted text-muted-foreground';

  return (
    <button
      onClick={() => onClick(notification)}
      className={cn('flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted', !notification.isRead && 'bg-brand-500/5')}
    >
      <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', tone)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm', notification.isRead ? 'text-muted-foreground' : 'font-medium text-foreground')}>{notification.message}</p>
        <span className="mt-0.5 block text-xs text-muted-foreground">{fmtDate(notification.createdAt)}</span>
      </div>
      {!notification.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
    </button>
  );
}
