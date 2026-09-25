import { prisma } from '@robotspace/db'
import { SOURCE_AREA_LABELS, sourceDisplayName, type SourceCatalogRecord } from '../../lib/source-catalog'

export async function generateMetadata() {
  return { title: 'Data Methodology', description: 'How RobotSpace verifies data: source → parser → assertion → confidence scoring → canonical field.' }
}

export const dynamic = 'force-dynamic'

export default async function MethodologyPage() {
  const sources = await prisma.$queryRawUnsafe<SourceCatalogRecord[]>(`
    SELECT key, display_name, owner_name, homepage_url, logo_url, content_area, public_description
    FROM sources
    WHERE is_public = true AND status <> 'DISABLED' AND legal_status <> 'TAKEDOWN'
    ORDER BY content_area, display_name NULLS LAST, key
  `)
  const groups = sources.reduce<Record<string, SourceCatalogRecord[]>>((result, source) => {
    ;(result[source.content_area] ??= []).push(source)
    return result
  }, {})
  return (
    <div className="max-w-[960px] mx-auto px-6 py-12" style={{ color: 'var(--color-text-body)' }}>
      <h1 className="text-3xl font-semibold mb-6" style={{ color: 'var(--color-text-heading)' }}>Data Methodology</h1>
      <div className="space-y-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
        <p>Every data point on RobotSpace.io has an evidence chain: source → parser → assertion → confidence scoring → canonical field → public projection.</p>
        <p><strong>Confidence thresholds:</strong> Identity (85%), Technical specs (90%), Compatibility (90%), News metadata (80%).</p>
        <p><strong>Never published:</strong> AI-only unsupported inference (30% cap), expired data, fake ratings or fabricated numbers.</p>
        <p>Source terms, rate limits and permitted fields are reviewed before a collector is activated. A listed resource does not mean every page or image can be republished.</p>
      </div>
      {sources.length > 0 && <section className="mt-10 space-y-7"><h2 className="text-2xl font-semibold" style={{ color: 'var(--color-text-heading)' }}>Sources and references</h2>{Object.entries(groups).map(([area, items]) => <div key={area}><h3 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--color-text-muted)' }}>{SOURCE_AREA_LABELS[area as keyof typeof SOURCE_AREA_LABELS] || area}</h3><div className="grid sm:grid-cols-2 gap-3">{items.map(source => <SourceReference key={source.key} source={source} />)}</div></div>)}</section>}
      <p className="mt-10 text-xs" style={{ color: 'var(--color-text-dim)' }}>Last updated: 2026-07-28.</p>
    </div>
  )
}

function SourceReference({ source }: { source: SourceCatalogRecord }) {
  const name = sourceDisplayName(source)
  const content = <div className="flex gap-3 p-4 rounded-xl h-full" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}><div className="w-12 h-12 shrink-0 rounded-lg border flex items-center justify-center overflow-hidden" style={{ background: '#fff', borderColor: 'var(--color-input-border)' }}>{source.logo_url ? <img src={source.logo_url} alt="" className="max-w-full max-h-full object-contain" /> : <span className="font-semibold text-slate-500">{name.slice(0, 1)}</span>}</div><div><h4 className="font-medium" style={{ color: 'var(--color-text-heading)' }}>{name}</h4><p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>{source.public_description || 'Reference source used in RobotSpace data review.'}</p></div></div>
  return source.homepage_url ? <a href={source.homepage_url} target="_blank" rel="noreferrer" className="block h-full hover:opacity-85">{content}</a> : content
}
