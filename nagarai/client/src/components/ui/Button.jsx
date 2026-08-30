import { forwardRef } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[transform,background-color,opacity,box-shadow] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97] active:duration-100',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm hover:opacity-90',
        outline: 'border border-border bg-transparent text-foreground hover:bg-muted',
        ghost: 'text-foreground hover:bg-muted',
        danger: 'bg-danger-500 text-white shadow-sm hover:bg-danger-600',
        signal: 'bg-signal-500 text-white shadow-sm hover:bg-signal-600',
        link: 'text-primary underline-offset-4 hover:underline p-0 h-auto active:scale-100',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

const Button = forwardRef(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));
Button.displayName = 'Button';

export { Button, buttonVariants };
