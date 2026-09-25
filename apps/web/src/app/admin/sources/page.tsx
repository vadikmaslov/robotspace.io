import { prisma } from '@robotspace/db'
import Link from 'next/link'
import { SOURCE_AREA_LABELS, sourceDisplayName, type SourceCatalogRecord } from '../../../lib/source-catalog'

export const dynamic = 'force-dynamic'

export default async function AdminSourcesPage() {
  const sources = await prisma.$queryRawUnsafe<SourceCatalogRecord[]>(`
    SELECT s.key, s.display_name, s.owner_name, s.homepage_url, s.logo_url, s.content_area,
           s.admin_description, s.public_description, s.is_public, s.tier, s.source_type, s.status,
           s.legal_status, s.schedule, s.rate_limit_rpm, s.trust_default_confidence, s.kill_switch,
           s.last_success_at, s.last_error_at,
           (SELECT count(*)::int FROM source_contracts c WHERE c.source_key = s.key) AS contract_count,
           (SELECT count(*)::int FROM source_records r WHERE r.source_id = s.key) AS record_count
    FROM sources s
    ORDER BY s.content_area, s.display_name NULLS LAST, s.key
  `)
  const grouped = sources.reduce<Record<string, SourceCatalogRecord[]>>((groups, source) => {
    ;(groups[source.content_area] ??= []).push(source)
    return groups
  }, {})

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text-heading)' }}>Sources</h1><p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>Registry for future collectors. A source needs a reviewed contract before an agent may use it.</p></div>
        <Link href="/admin/sources/new" className="px-4 py-2 rounded-md text-sm font-medium" style={{ background: 'var(--color-accent-cta)', color: 'var(--color-accent-cta-text)' }}>+ Add source</Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="All sources" value={sources.length} />
        <Stat label="Active" value={sources.filter(s => s.status === 'ACTIVE').length} />
        <Stat label="Contracted" value={sources.filter(s => (s.contract_count ?? 0) > 0).length} />
        <Stat label="Public methodology" value={sources.filter(s => s.is_public).length} />
      </div>
      {Object.entries(grouped).map(([area, items]) => <section key={area} className="space-y-3"><h2 className="text-base font-semibold" style={{ color: 'var(--color-text-heading)' }}>{SOURCE_AREA_LABELS[area as keyof typeof SOURCE_AREA_LABELS] || area} <span className="text-sm font-normal" style={{ color: 'var(--color-text-dim)' }}>({items.length})</span></h2><div className="grid lg:grid-cols-2 gap-3">{items.map(source => <SourceCard key={source.key} source={source} />)}</div></section>)}
      {sources.length === 0 && <div className="p-8 text-center rounded-xl" style={{ background: 'var(--color-bg-card)', color: 'var(--color-text-muted)' }}>No sources configured yet.</div>}
    </div>
  )
}

function SourceCard({ source }: { source: SourceCatalogRecord }) {
  const name = sourceDisplayName(source)
  return <Link href={`/admin/sources/${encodeURIComponent(source.key)}`} className="block rounded-xl p-4 transition-opacity hover:opacity-85" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}><div className="flex gap-3"><div className="w-12 h-12 shrink-0 rounded-lg border flex items-center justify-center overflow-hidden" style={{ background: '#fff', borderColor: 'var(--color-input-border)' }}>{source.logo_url ? <img src={source.logo_url} alt="" className="max-w-full max-h-full object-contain" /> : <span className="font-semibold text-slate-500">{name.slice(0, 1)}</span>}</div><div className="min-w-0 flex-1"><div className="flex gap-2 items-center flex-wrap"><h3 className="font-medium" style={{ color: 'var(--color-text-heading)' }}>{name}</h3><Badge>{source.status}</Badge>{source.kill_switch && <Badge>Kill switch</Badge>}</div><p className="text-xs font-mono mt-0.5" style={{ color: 'var(--color-text-dim)' }}>{source.key} · {source.source_type} · tier {source.tier}</p><p className="text-sm mt-2 line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>{source.admin_description || 'No admin preview yet.'}</p><p className="text-xs mt-2" style={{ color: 'var(--color-text-dim)' }}>{source.contract_count ?? 0} contracts · {source.record_count ?? 0} records {source.is_public ? '· public' : ''}</p></div></div></Link>
}

function Stat({ label, value }: { label: string; value: number }) { return <div className="p-4 rounded-xl" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}><div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{label}</div><div className="text-xl mt-1 font-semibold" style={{ color: 'var(--color-text-heading)' }}>{value}</div></div> }
function Badge({ children }: { children: React.ReactNode }) { return <span className="text-[10px] px-1.5 py-0.5 rounded border" style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-input-border)' }}>{children}</span> }
