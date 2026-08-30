import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
  {
    variants: {
      variant: {
        default: 'bg-brand-500/10 text-brand-700 dark:text-brand-300 ring-brand-500/20',
        success: 'bg-success-500/10 text-success-600 dark:text-success-400 ring-success-500/20',
        warning: 'bg-signal-500/10 text-signal-600 dark:text-signal-400 ring-signal-500/20',
        danger: 'bg-danger-500/10 text-danger-600 dark:text-danger-400 ring-danger-500/20',
        muted: 'bg-muted text-muted-foreground ring-border',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
