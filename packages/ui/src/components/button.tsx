/**
 * Phase 8: Button Component
 * Matches prototype: Primary CTA (Acid Lime), Nav, Pill, Ghost
 * From refero-linear.md — no invention
 */

import React from 'react'

export type ButtonVariant = 'primary' | 'nav' | 'pill' | 'ghost'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  href?: string
  size?: 'sm' | 'md'
  children: React.ReactNode
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-accent-cta text-accent-cta-text rounded-[var(--radius-btn)] px-4 py-2.5 font-inter text-[14px] font-[510] tracking-[-0.011em] hover:opacity-90 transition-opacity',
  nav: 'bg-transparent text-nav-link px-3 py-2 font-inter text-[13px] font-[400] hover:underline transition-all',
  pill: 'bg-white text-[#08090a] rounded-full px-4 py-2 font-inter text-[13px] font-[510] hover:opacity-90 transition-opacity',
  ghost:
    'bg-transparent border border-border-color text-text-body rounded-[var(--radius-btn)] px-3 py-2 font-inter text-[13px] font-[400] hover:bg-hover-bg transition-colors',
}

export function Button({ variant = 'primary', href, size = 'md', className = '', children, ...props }: ButtonProps) {
  const base = variantStyles[variant]

  if (href) {
    return (
      <a href={href} className={`inline-flex items-center justify-center ${base} ${className}`}>
        {children}
      </a>
    )
  }

  return (
    <button className={`${base} ${className}`} {...props}>
      {children}
    </button>
  )
}
