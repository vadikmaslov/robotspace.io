import Link from 'next/link'
import type { RegistryProjectDetail } from '../../../lib/registry-public'

type Compatibility = RegistryProjectDetail['compatibility'][number]
function date(value: Date | null) { return value ? value.toISOString().slice(0, 10) : null }

export function CompatibilityCard({ item }: { item: Compatibility }) {
  const trust = item.communityTrust
  const status = trust.status === 'DISPUTED' ? 'Community reports conflict' : trust.status === 'COMMUNITY_CONFIRMED' ? 'Community confirmed' : 'Editorially verified'
  return <article className="rounded-lg border p-4" style={{ borderColor: trust.status === 'DISPUTED' ? 'var(--color-warning, #d9a441)' : 'var(--color-border-color)' }}>
    <div className="flex flex-wrap items-start justify-between gap-2"><Link href={`/robots/${item.robotSlug}`} className="font-medium hover:underline" style={{ color: 'var(--color-text-heading)' }}>{item.robotName}</Link><span className="text-xs" style={{ color: trust.status === 'DISPUTED' ? 'var(--color-warning, #d9a441)' : 'var(--color-accent-data)' }}>{status}</span></div>
    <div className="mt-1 text-xs" style={{ color: 'var(--color-text-dim)' }}>{item.projectVersion && `Project: ${item.projectVersion}`}{item.projectVersion && item.robotVersion && ' · '}{item.robotVersion && `Robot: ${item.robotVersion}`}{item.verifiedAt && ` · Verified ${date(item.verifiedAt)}`}</div>
    <p className="mt-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>{trust.confirmedCount} accepted confirmation{trust.confirmedCount === 1 ? '' : 's'} · {trust.disputedCount} accepted dispute{trust.disputedCount === 1 ? '' : 's'}</p>
    <div className="mt-3 flex flex-wrap gap-3 text-xs"><Link href={`/compatibility/${item.id}`} className="underline">Evidence and community reports</Link>{item.evidence.map(source => <a key={`${source.url}-${source.observedAt.toISOString()}`} href={source.url} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--color-text-muted)' }}>{source.kind.toLowerCase().replaceAll('_', ' ')} &rarr;</a>)}</div>
  </article>
}
