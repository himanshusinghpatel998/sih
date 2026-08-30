import { cn } from '@/lib/utils';

export function Card({ className, interactive, ...props }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-[transform,box-shadow,border-color] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
        interactive && 'cursor-pointer hover:-translate-y-0.5 hover:border-brand-400/40 hover:shadow-md active:translate-y-0 active:scale-[0.99]',
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }) {
  return <div className={cn('flex flex-col gap-1 p-5', className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return <h3 className={cn('text-sm font-semibold tracking-tight text-foreground', className)} {...props} />;
}

export function CardDescription({ className, ...props }) {
  return <p className={cn('text-xs text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn('p-5 pt-0', className)} {...props} />;
}

export function CardFooter({ className, ...props }) {
  return <div className={cn('flex items-center p-5 pt-0', className)} {...props} />;
}
