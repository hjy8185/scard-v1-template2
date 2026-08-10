'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface ScrollAreaProps {
  children: React.ReactNode;
  className?: string;
}

export function ScrollArea({ children, className }: ScrollAreaProps) {
  return (
    <div
      className={cn(
        'overflow-y-auto overflow-x-hidden',
        className,
      )}
    >
      {children}
    </div>
  );
}
