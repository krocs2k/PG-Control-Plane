import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'secondary';
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    const variants = {
      default: 'bg-slate-700 text-slate-200',
      secondary: 'bg-slate-600 text-slate-300',
      success: 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30',
      warning: 'bg-amber-600/20 text-amber-400 border border-amber-500/30',
      error: 'bg-red-600/20 text-red-400 border border-red-500/30',
      info: 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/30',
    };

    return (
      <div
        ref={ref}
        className={cn(
          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);
Badge.displayName = 'Badge';

export { Badge };
