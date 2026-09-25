/**
 * Phase 8: Badge Component
 * Matches prototype: status tags, category labels
 * background rgba(255,255,255,0.05), text #8a8f98, border-radius 4px, padding 0 6px, Inter 12px/400
 */

import React from 'react'

export type BadgeVariant = 'default' | 'success' | 'error' | 'tag'

export interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
}

const variantColors: Record<BadgeVariant, string> = {
  default: 'bg-[rgba(255,255,255,0.05)] text-text-muted',
  success: 'bg-[rgba(39,166,68,0.15)] text-accent-growth',
  error: 'bg-[rgba(235,87,87,0.15)] text-accent-decline',
  tag: 'bg-[rgba(99,102,241,0.15)] text-[#6366f1]',
}

export function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-[var(--radius-badge)] px-[6px] font-inter text-[12px] font-[400] leading-[1.4] ${variantColors[variant]} ${className}`}
    >
      {children}
    </span>
  )
}
