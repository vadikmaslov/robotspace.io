/**
 * Phase 8: Card Component
 * Matches prototype: bg #0f1011, border-radius 12px, inset shadow, padding 24px
 * No outer drop shadow — elevation from inset border only
 */

import React from 'react'

export interface CardProps {
  children: React.ReactNode
  className?: string
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div
      className={`bg-bg-card rounded-[var(--radius-card)] p-[var(--card-padding,24px)] shadow-card ${className}`}
    >
      {children}
    </div>
  )
}
