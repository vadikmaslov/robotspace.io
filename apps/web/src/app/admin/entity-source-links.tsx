'use client'

import type { EntitySourceLink } from '../../lib/entity-source-links'

function formatDate(value: Date | string) {
  return new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

function fieldCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0
}

export function EntitySourceLinks({ links }: { links: EntitySourceLink[] }) {
  return <section className="p-5 rounded-xl space-y-4" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}>
    <div>
      <h2 className="text-lg font-medium" style={{ color: 'var(--color-text-heading)' }}>Found on sources</h2>
      <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>Admin-only discovery links. They are not shown on public pages and do not by themselves verify or publish a field.</p>
    </div>
    {links.length === 0 ? <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No source links found yet.</p> : <div className="space-y-2">{links.map(link => <div key={link.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--color-input-border)', background: 'var(--color-bg-canvas)' }}>
      <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium" style={{ color: 'var(--color-text-body)' }}>{link.source_name || link.source_key}</span><span className="rounded border px-1.5 py-0.5 text-[10px]" style={{ borderColor: 'var(--color-input-border)', color: 'var(--color-text-muted)' }}>{link.link_status}</span><span className="rounded border px-1.5 py-0.5 text-[10px]" style={{ borderColor: 'var(--color-input-border)', color: 'var(--color-text-muted)' }}>{link.match_type} · {Math.round(Number(link.match_confidence) * 100)}%</span></div>
      <a href={link.canonical_url} target="_blank" rel="noreferrer" className="mt-2 block truncate text-xs font-mono underline" style={{ color: 'var(--color-accent-cta)' }}>{link.canonical_url}</a>
      <div className="mt-2 text-[11px]" style={{ color: 'var(--color-text-dim)' }}>Observed fields: {fieldCount(link.observed_fields)} · last seen: {formatDate(link.last_seen_at)}</div>
    </div>)}</div>}
  </section>
}
