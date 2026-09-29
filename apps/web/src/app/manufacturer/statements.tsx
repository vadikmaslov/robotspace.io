import type { getManufacturerVoice } from '../../lib/manufacturer-voice'

type Voice = Awaited<ReturnType<typeof getManufacturerVoice>>

export function ManufacturerStatements({ voice, title = 'Manufacturer position' }: { voice: Voice; title?: string }) {
  if (!voice.statements.length) return null
  return <section className="rounded-xl border p-5" style={{ borderColor: 'var(--color-accent-b2b)', background: 'var(--color-bg-card)' }}><h2 className="text-xl font-medium">{title}</h2><p className="mt-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>Statements from a DNS-verified manufacturer. Editorial specifications and community evidence are shown separately.</p><div className="mt-4 grid gap-3 md:grid-cols-2">{voice.statements.map(statement => <article key={statement.id} className="rounded-lg border p-4" style={{ borderColor: 'var(--color-border-color)' }}><span className="text-xs uppercase">{statement.statement_type}</span><h3 className="mt-2 font-medium">{statement.title}</h3>{statement.statement_value && <p className="mt-1 text-sm">{statement.statement_value}</p>}<div className="mt-3 flex flex-wrap gap-3 text-sm">{statement.url && <a href={statement.url} target="_blank" rel="noopener noreferrer" className="underline">Resource</a>}<a href={statement.evidence_url} target="_blank" rel="noopener noreferrer" className="underline">Manufacturer evidence</a></div><p className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>Published {statement.created_at.toISOString().slice(0, 10)}</p></article>)}</div></section>
}
