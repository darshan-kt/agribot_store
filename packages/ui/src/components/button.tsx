'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover border-primary',
  secondary: 'bg-surface text-ink border-line-strong hover:bg-surface-sunk',
  ghost: 'bg-transparent text-ink border-transparent hover:bg-surface-sunk',
  danger: 'bg-danger text-on-critical border-danger hover:bg-danger-hover',
};

// Every size clears the 44px touch minimum except `sm`, which is only for controls
// inside an already-large hit area (a chip in a row that is itself tappable).
const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 text-sm gap-1.5',
  md: 'h-11 px-4 text-base gap-2',
  lg: 'h-13 px-6 text-lg gap-2.5',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconLeft?: ReactNode;
  block?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  iconLeft,
  block,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-sm border font-medium',
        'focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-45',
        'motion-safe:duration-fast motion-safe:transition-colors',
        // Physical feedback matters when you cannot feel the screen through a glove.
        'active:translate-y-px',
        VARIANT[variant],
        SIZE[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {iconLeft}
      {children}
    </button>
  );
}
