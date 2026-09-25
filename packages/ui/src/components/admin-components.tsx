/**
 * Phase 8: Admin-specific components
 * DataTable, CompareTable, admin badges, confidence/source indicators.
 * Styled by LINEAR tokens — same borders, radii, typography, transitions.
 */

import React from 'react'

// ============================================================
// DATA TABLE (accessible, semantic <table>)
// ============================================================
export interface DataTableColumn<T> {
  key: string
  label: string
  render?: (row: T) => React.ReactNode
  align?: 'left' | 'right'
  width?: string
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  emptyMessage = 'No data',
}: {
  columns: DataTableColumn<T>[]
  data: T[]
  emptyMessage?: string
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border-color text-left text-text-dim font-inter text-[12px] uppercase tracking-wider">
            {columns.map(col => (
              <th key={col.key} className={`py-3 pr-4 ${col.align === 'right' ? 'text-right' : ''}`} style={{ width: col.width }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 && (
            <tr><td colSpan={columns.length} className="py-12 text-center text-text-muted">{emptyMessage}</td></tr>
          )}
          {data.map((row, i) => (
            <tr key={i} className="border-b border-border-color/50 text-text-body hover:bg-hover-bg transition-colors">
              {columns.map(col => (
                <td key={col.key} className={`py-3 pr-4 ${col.align === 'right' ? 'text-right font-mono text-xs' : 'text-[14px]'}`}>
                  {col.render ? col.render(row) : String(row[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// 19. COMPARE TABLE
export function CompareTable({
  robots,
  attributes,
}: {
  robots: Array<{ name: string; values: Record<string, string | null> }>
  attributes: Array<{ key: string; label: string; unit?: string }>
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border-color">
            <th className="py-3 pr-4 text-left text-text-dim font-inter text-[12px] uppercase">Attribute</th>
            {robots.map((r, i) => (
              <th key={i} className="py-3 pr-4 text-right font-inter text-[14px] text-text-body font-[510]">{r.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {attributes.map(attr => (
            <tr key={attr.key} className="border-b border-border-color/50">
              <td className="py-3 pr-4 text-text-muted font-inter text-[13px]">
                {attr.label}{attr.unit ? <span className="text-text-dim ml-1">({attr.unit})</span> : ''}
              </td>
              {robots.map((r, i) => (
                <td key={i} className="py-3 pr-4 text-right font-mono text-xs text-text-body">
                  {r.values[attr.key] ?? <span className="text-text-dim italic">Not verified</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// 20. HEALTH BADGE
export function HealthBadge({ status }: { status: 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN' | 'RATE_LIMITED' | 'AUTH_ERROR' }) {
  const colors: Record<string, string> = {
    HEALTHY: 'bg-[rgba(39,166,68,0.15)] text-accent-growth',
    DEGRADED: 'bg-[rgba(252,211,77,0.15)] text-[#fcd34d]',
    DOWN: 'bg-[rgba(235,87,87,0.15)] text-accent-decline',
    UNKNOWN: 'bg-tag-bg text-text-dim',
    RATE_LIMITED: 'bg-[rgba(252,165,77,0.15)] text-[#fca54d]',
    AUTH_ERROR: 'bg-[rgba(235,87,87,0.15)] text-accent-decline',
  }
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--radius-badge)] font-inter text-[11px] font-[400] ${colors[status]}`}>
    <span className={`w-1.5 h-1.5 rounded-full ${status === 'HEALTHY' ? 'bg-accent-growth' : status === 'DOWN' ? 'bg-accent-decline' : 'bg-text-dim'}`} />
    {status.replace('_', ' ')}
  </span>
}

// 21. CONFIDENCE BADGE
export function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100)
  const color = confidence >= 0.90 ? 'text-accent-growth' : confidence >= 0.70 ? 'text-[#fcd34d]' : 'text-accent-decline'
  return <span className={`inline-flex items-center font-mono text-[12px] ${color}`}>● {pct}%</span>
}

// 22. SOURCE BADGE
export function SourceBadge({ source, tier }: { source: string; tier?: 'A' | 'B' | 'C' | 'D' }) {
  const colors: Record<string, string> = { A: 'text-accent-growth', B: 'text-accent-b2b', C: 'text-[#fcd34d]', D: 'text-text-dim' }
  return <span className={`inline-flex items-center gap-1 font-inter text-[11px] ${colors[tier ?? 'D']}`}>
    {source}{tier ? <span className="opacity-50">T{tier}</span> : ''}
  </span>
}

// 23. KILL SWITCH
export function KillSwitch({ active, onToggle, label, impact }: { active: boolean; onToggle: () => void; label: string; impact?: string }) {
  return (
    <div className="flex items-center justify-between p-4 bg-bg-card rounded-[var(--radius-card)] shadow-card">
      <div>
        <div className="font-inter text-[14px] text-text-body">{label}</div>
        {impact && <div className="font-inter text-[12px] text-text-dim mt-1">{impact}</div>}
      </div>
      <button onClick={onToggle}
        className={`relative w-11 h-6 rounded-full transition-colors ${active ? 'bg-accent-growth' : 'bg-border-strong'}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${active ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  )
}

// 24. SPARKLINE (mini SVG chart)
export function Sparkline({ data, width, height }: { data: number[]; width?: number; height?: number }) {
  const w = width ?? 80
  const h = height ?? 24
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ')
  return (
    <svg width={w} height={h} className="inline-block">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5"
        className="text-accent-growth" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
