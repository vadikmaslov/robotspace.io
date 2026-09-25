import { prisma } from '@robotspace/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  return { title: 'Industry Insights', description: 'Robotics industry news, research, and trends from verified sources worldwide.' }
}

const CAT_TABS = ['All', 'Technology', 'AI', 'Case Studies', 'Interviews'] as const

const CAT_ICON: Record<string, string> = {
  technology: '\u2699\uFE0F',
  ai: '\uD83E\uDD16',
  'case-studies': '\uD83C\uDFED',
  'case study': '\uD83C\uDFED',
  interview: '\uD83C\uDF99\uFE0F',
  research: '\uD83D\uDD2C',
  logistics: '\uD83D\uDCE6',
  humanoid: '\uD83E\uDD16',
  industrial: '\uD83C\uDFED',
}

function catTag(categories: any): string | null {
  if (!categories) return null
  if (Array.isArray(categories)) return categories[0]?.toLowerCase() || null
  if (typeof categories === 'object') return (categories as any).primary || null
  return null
}

function catIcon(tag: string | null): string {
  if (!tag) return '\uD83D\uDCF0'
  return CAT_ICON[tag] || '\uD83D\uDCF0'
}

function ArticleImage({ article, className }: { article: any; className: string }) {
  if (isStoredImageUrl(article.image_url)) {
    return <img src={article.image_url} alt="" className={`${className} object-cover`} />
  }
  if (isStoredImageUrl(article.source_logo_url)) {
    return <img src={article.source_logo_url} alt="" className={`${className} object-contain p-6`} />
  }
  const tag = catTag(article.categories)
  return <span className={className}>{catIcon(tag)}</span>
}

function isStoredImageUrl(value: unknown) {
  if (typeof value !== 'string' || !value) return false
  if (value.startsWith('/uploads/')) return true
  const publicBase = process.env.S3_PUBLIC_BASE_URL?.replace(/\/$/, '')
  return Boolean(publicBase && value.startsWith(`${publicBase}/images/`))
}

function slugify(title: string) {
  return title?.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 80)
}

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  let articles: any[] = []
  let total = 0
  const params = await searchParams
  const page = Math.max(1, Number.parseInt(params.page || '1', 10) || 1)
  const pageSize = 12
  try {
    ;[articles, [{ count: total }]] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(`
      SELECT a.id, a.title, a.authors, a.published_at, a.categories, a.source_id, a.canonical_url, a.image_url, a.list_summary,
             s.logo_url AS source_logo_url
      FROM articles a LEFT JOIN sources s ON s.key = a.source_id
      WHERE COALESCE(a.publication_status, 'PUBLISHED') = 'PUBLISHED'
      ORDER BY a.published_at DESC LIMIT $1 OFFSET $2
    `, pageSize, (page - 1) * pageSize),
      prisma.$queryRawUnsafe<Array<{ count: number }>>(`SELECT count(*)::int AS count FROM articles WHERE COALESCE(publication_status, 'PUBLISHED') = 'PUBLISHED'`),
    ])
  } catch {}

  if (articles.length === 0) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-12">
        <h1 className="text-[32px] font-medium tracking-tight mb-2" style={{ color: 'var(--color-text-heading)' }}>Insights</h1>
        <div className="py-16 text-center rounded-xl border border-dashed" style={{ borderColor: 'var(--color-border-color)' }}>
          <p style={{ color: 'var(--color-text-dim)' }}>News data is being collected. Check back soon.</p>
        </div>
      </div>
    )
  }

  const hero = articles[0]
  const heroTag = catTag(hero.categories)
  const grid = articles.slice(1, 9)   // next 8 articles for grid
  const caseStudies = articles.filter((a: any) => {
    const t = catTag(a.categories)
    return t === 'case-studies' || t === 'case study'
  })

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <h1 className="text-[32px] font-medium tracking-tight mb-0" style={{ color: 'var(--color-text-heading)', letterSpacing: '-0.012em' }}>Insights</h1>

      {/* Category Tabs */}
      <div className="flex gap-1 flex-wrap my-6">
        {CAT_TABS.map(tab => (
          <button key={tab}
            className={`text-[13px] px-4 py-2 rounded-full border transition-all cursor-pointer font-[var(--font-inter)] ${
              tab === 'All' ? 'border-[var(--color-accent-cta)] text-[var(--color-accent-cta-text)]' : 'border-[var(--color-border-color)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-heading)]'
            }`}
            style={tab === 'All' ? { background: 'var(--color-accent-cta)' } : { background: 'transparent' }}>
            {tab}
          </button>
        ))}
      </div>

      {/* Hero Article */}
      <Link href={`/insights/${slugify(hero.title)}`}
        className="block relative mb-12 rounded-xl overflow-hidden border transition-colors hover:bg-[var(--color-bg-elevated)]"
        style={{ background: 'var(--color-bg-elevated)', borderColor: 'var(--color-border-color)' }}>
        <div className="h-[200px] md:h-[280px] flex items-center justify-center overflow-hidden"
          style={{ background: '#fff' }}>
          <ArticleImage article={hero} className="text-[80px]" />
        </div>
        <div className="p-8">
          <span className="text-[11px] uppercase tracking-wider font-medium" style={{ color: 'var(--color-accent-cta)' }}>Featured</span>
          <h2 className="text-[22px] md:text-[28px] font-medium mt-2 leading-tight tracking-[-0.012em]" style={{ color: 'var(--color-text-heading)' }}>
            {hero.title}
          </h2>
          <div className="text-[13px] mt-3" style={{ color: 'var(--color-text-muted)' }}>
            {fmtDate(hero.published_at)}{hero.authors ? ` · ${hero.authors}` : ''}
          </div>
        </div>
      </Link>

      {/* Latest Articles */}
      <div className="flex justify-between items-baseline mb-6">
        <h2 className="text-2xl font-normal tracking-[-0.012em]" style={{ color: 'var(--color-text-heading)' }}>Latest Articles</h2>
        <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{total} articles</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {grid.map((a: any) => {
          const tag = catTag(a.categories)
          return (
            <Link key={a.id} href={`/insights/${slugify(a.title)}`}
              className="block rounded-xl overflow-hidden border transition-colors hover:bg-[var(--color-bg-elevated)]"
              style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)', borderColor: 'var(--color-border-color)' }}>
              <div className="h-[120px] md:h-[140px] flex items-center justify-center overflow-hidden"
                style={{ background: '#fff' }}>
                <ArticleImage article={a} className="text-[40px]" />
              </div>
              <div className="p-5">
                {tag && (
                  <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--color-accent-b2b)' }}>{tag}</span>
                )}
                <h3 className="text-base font-medium mt-2 leading-snug" style={{ color: 'var(--color-text-heading)' }}>{a.title}</h3>
                {a.list_summary && <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>{a.list_summary}</p>}
                <div className="text-xs mt-2" style={{ color: 'var(--color-text-dim)' }}>
                  {fmtDate(a.published_at)}{a.authors ? ` · ${a.authors}` : ''}
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {total > pageSize && <nav className="mt-8 flex items-center justify-between gap-4" aria-label="Insights pagination">
        {page > 1 ? <Link href={page === 2 ? '/insights' : `/insights?page=${page - 1}`} className="rounded border px-4 py-2 text-sm" style={{ borderColor: 'var(--color-border-color)', color: 'var(--color-text-body)' }}>← Previous</Link> : <span />}
        <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Page {page} of {Math.ceil(total / pageSize)}</span>
        {page * pageSize < total ? <Link href={`/insights?page=${page + 1}`} className="rounded border px-4 py-2 text-sm" style={{ borderColor: 'var(--color-border-color)', color: 'var(--color-text-body)' }}>Next →</Link> : <span />}
      </nav>}

      {/* Case Studies */}
      {caseStudies.length > 0 && (
        <>
          <hr className="border-0 border-t my-12" style={{ borderColor: 'var(--color-border-color)' }} />
          <div className="flex justify-between items-baseline mb-6">
            <h2 className="text-2xl font-normal tracking-[-0.012em]" style={{ color: 'var(--color-text-heading)' }}>Case Studies</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {caseStudies.map((a: any) => (
              <Link key={a.id} href={`/insights/${slugify(a.title)}`}
                className="block rounded-xl p-6 border transition-colors hover:bg-[var(--color-bg-elevated)]"
                style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)', borderColor: 'var(--color-border-color)' }}>
                <div className="text-2xl mb-3">{catIcon(catTag(a.categories))}</div>
                <h3 className="text-base font-medium" style={{ color: 'var(--color-text-heading)' }}>{a.title}</h3>
                <p className="text-[13px] mt-2 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                  {a.authors ? `By ${a.authors} · ` : ''}{fmtDate(a.published_at)}
                </p>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
