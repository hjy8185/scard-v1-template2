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
        'inline-flex items-center justify-center rounded-[12px] font-medium transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30',
        'disabled:pointer-events-none disabled:opacity-40',
        variant === 'default' &&
          'bg-gray-100 text-gray-800 hover:bg-gray-200',
        variant === 'ghost' &&
          'text-gray-600 hover:text-gray-900 hover:bg-gray-100',
        variant === 'outline' &&
          'border border-gray-300 text-gray-700 hover:bg-gray-50',
        variant === 'primary' &&
          'bg-blue-500 text-white font-semibold hover:bg-blue-600 shadow-sm',
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
