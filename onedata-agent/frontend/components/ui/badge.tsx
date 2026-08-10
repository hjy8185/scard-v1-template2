'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = 'default', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variant === 'default' && 'bg-ink-700 text-mist border border-ink-600',
        variant === 'success' && 'bg-jade/10 text-jade border border-jade/20',
        variant === 'warning' && 'bg-amber/10 text-amber border border-amber/20',
        variant === 'error' && 'bg-coral/10 text-coral border border-coral/20',
        variant === 'info' && 'bg-aqua/10 text-aqua border border-aqua/20',
        className,
      )}
    >
      {children}
    </span>
  );
}
