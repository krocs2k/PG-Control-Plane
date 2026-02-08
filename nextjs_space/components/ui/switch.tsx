'use client';

import * as React from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';

import { cn } from '@/lib/utils';

interface SwitchProps extends React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> {
  variant?: 'default' | 'success';
}

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  SwitchProps
>(({ className, variant = 'default', ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-50',
      // Unchecked state - muted/disabled look
      'data-[state=unchecked]:bg-slate-700 data-[state=unchecked]:border-slate-600',
      // Checked state - varies by variant
      variant === 'success' 
        ? 'data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-400 data-[state=checked]:shadow-[0_0_8px_rgba(16,185,129,0.4)]'
        : 'data-[state=checked]:bg-cyan-500 data-[state=checked]:border-cyan-400',
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        'pointer-events-none block h-5 w-5 rounded-full shadow-lg ring-0 transition-all duration-200',
        'data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0',
        // Thumb color based on state
        'data-[state=unchecked]:bg-slate-400',
        'data-[state=checked]:bg-white'
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
