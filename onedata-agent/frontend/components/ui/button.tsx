'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost' | 'outline' | 'primary';
  size?: 'default' | 'sm' | 'icon';
}

export function Button({
  className,
  variant = 'default',
  size = 'default',
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-[10px] font-medium transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua/50',
        'disabled:pointer-events-none disabled:opacity-50',
        // Variants
        variant === 'default' &&
          'bg-ink-700 text-pearl border border-ink-600 hover:bg-ink-600 hover:border-aqua/30',
        variant === 'ghost' &&
          'text-mist hover:text-pearl hover:bg-ink-700',
        variant === 'outline' &&
          'border border-ink-600 text-mist hover:text-pearl hover:border-aqua/50 hover:bg-ink-700/50',
        variant === 'primary' &&
          'bg-aqua text-ink-900 font-semibold hover:bg-aqua/90 shadow-lg shadow-aqua/20',
        // Sizes
        size === 'default' && 'h-10 px-4 py-2 text-sm',
        size === 'sm' && 'h-8 px-3 text-xs',
        size === 'icon' && 'h-10 w-10',
        className,
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
