/**
 * Phase 8: Input Component
 * Matches prototype: bg rgba(255,255,255,0.02), border rgba(255,255,255,0.08), text #d0d6e0
 * border-radius 6px, padding 12px 14px, Inter 14px/400
 */

import React from 'react'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <div className="space-y-2">
      {label && (
        <label className="block font-inter text-[13px] text-text-muted">{label}</label>
      )}
      <input
        className={`w-full bg-input-bg border border-input-border text-text-body rounded-[var(--radius-input)] px-[14px] py-3 font-inter text-[14px] font-[400] placeholder:text-text-dim focus:outline-none focus:border-text-muted transition-colors ${error ? 'border-accent-decline' : ''} ${className}`}
        {...props}
      />
      {error && <p className="font-inter text-[12px] text-accent-decline">{error}</p>}
    </div>
  )
}
