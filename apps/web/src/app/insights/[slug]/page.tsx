import { prisma } from '@robotspace/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

function slugify(title: string) { return title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 80) }
function isStoredImageUrl(value: unknown) {
  if (typeof value !== 'string' || !value) return false
  if (value.startsWith('/uploads/')) return true
  const publicBase = process.env.S3_PUBLIC_BASE_URL?.replace(/\/$/, '')
  return Boolean(publicBase && value.startsWith(`${publicBase}/images/`))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  try {
    const articles = await prisma.$queryRawUnsafe<Array<{ title: string; list_summary: string | null }>>(`SELECT title, list_summary FROM articles WHERE COALESCE(publication_status, 'PUBLISHED') = 'PUBLISHED' ORDER BY published_at DESC LIMIT 250`)
    const article = articles.find(item => slugify(item.title) === slug)
    if (article) return { title: `${article.title} | RobotSpace Insights`, description: article.list_summary || `Robotics industry insight: ${article.title}.` }
  } catch {}
  return { title: 'Insight | RobotSpace', description: 'Robotics industry news and analysis from verified sources.' }
}

export default async function InsightDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  let article: any = null

  try {
    const articles = await prisma.$queryRawUnsafe<any[]>(`
      SELECT a.id, a.title, a.authors, a.published_at, a.language, a.canonical_url, a.categories, a.image_url, a.summary_status,
             a.detail_summary, s.logo_url AS source_logo_url, COALESCE(s.display_name, s.key, 'Original source') AS source_name
      FROM articles a LEFT JOIN sources s ON s.key = a.source_id
      WHERE COALESCE(a.publication_status, 'PUBLISHED') = 'PUBLISHED'
      ORDER BY a.published_at DESC LIMIT 250
    `)
    article = articles.find((item: any) => slugify(item.title) === slug)
    if (article) article.article_previews = await prisma.article_previews.findMany({ where: { article_id: article.id }, take: 1, orderBy: { created_at: 'desc' } })
  } catch {}

  if (!article) notFound()
  const preview = article.article_previews?.[0]
  const detailPreview = article.detail_summary || preview?.preview_en
  const imageUrl = isStoredImageUrl(article.image_url) ? article.image_url : isStoredImageUrl(article.source_logo_url) ? article.source_logo_url : null
  const mentions = await prisma.$queryRawUnsafe<Array<{ entity_type: 'COMPANY' | 'ROBOT'; name: string; public_slug: string }>>(`
    SELECT m.entity_type, COALESCE(c.canonical_name, r.canonical_name) AS name,
           replace(lower(trim(COALESCE(c.canonical_name, r.canonical_name))), ' ', '-') AS public_slug
    FROM entity_mentions m
    JOIN entities e ON e.id = m.entity_id AND e.publication_status = 'PUBLISHED' AND e.archived_at IS NULL
    LEFT JOIN company_public_projections c ON c.company_entity_id = m.entity_id
    LEFT JOIN robot_public_projections r ON r.robot_entity_id = m.entity_id
    WHERE m.article_id = $1::uuid
    ORDER BY m.entity_type, COALESCE(c.canonical_name, r.canonical_name)
  `, article.id).catch(() => [])

  return (
    <div className="max-w-[760px] mx-auto px-6 py-12">
      <Link href="/insights" className="text-sm inline-block mb-6" style={{ color: 'var(--color-text-muted)' }}>← Back to Insights</Link>

      <div className="flex items-center gap-4 mb-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
        {article.authors && <><span>{article.authors}</span><span>·</span></>}
        <span>{new Date(article.published_at).toISOString().slice(0, 10)}</span><span>·</span><span style={{ color: 'var(--color-text-dim)' }}>{article.language?.toUpperCase()}</span>
      </div>
      <h1 className="text-3xl font-semibold mb-6" style={{ color: 'var(--color-text-heading)' }}>{article.title}</h1>
      {imageUrl && <div className="mb-8 rounded-xl overflow-hidden border" style={{ borderColor: 'var(--color-border-color)' }}><img src={imageUrl} alt="" className={`w-full max-h-[400px] ${imageUrl === article.image_url ? 'object-cover' : 'object-contain p-12'}`} style={{ background: '#fff' }} /></div>}
      {detailPreview && <div className="text-base leading-relaxed mb-8" style={{ color: 'var(--color-text-body)' }}>{detailPreview.split(/\n{2,}/).filter(Boolean).map((paragraph: string, index: number) => <p key={index} className={index > 0 ? 'mt-4' : undefined}>{paragraph.trim()}</p>)}</div>}
      {mentions.length > 0 && <section className="mb-8 rounded-xl border p-5" style={{ borderColor: 'var(--color-border-color)', background: 'var(--color-bg-card)' }}><h2 className="text-lg font-medium mb-3" style={{ color: 'var(--color-text-heading)' }}>Mentions</h2><div className="flex flex-wrap gap-2">{mentions.map(mention => <Link key={`${mention.entity_type}:${mention.public_slug}`} href={`/${mention.entity_type === 'ROBOT' ? 'robots' : 'companies'}/${mention.public_slug}`} className="rounded-full border px-3 py-1.5 text-sm" style={{ borderColor: 'var(--color-input-border)', color: 'var(--color-text-body)' }}>{mention.entity_type === 'ROBOT' ? 'Robot' : 'Brand'}: {mention.name}</Link>)}</div></section>}
      <div className="flex items-center gap-4 pt-6 border-t" style={{ borderColor: 'var(--color-border-color)' }}>
        <a href={article.canonical_url} target="_blank" rel="noopener noreferrer" className="inline-block px-5 py-2.5 rounded-md text-sm font-medium transition-opacity hover:opacity-90" style={{ background: 'var(--color-accent-cta)', color: 'var(--color-accent-cta-text)' }}>Read the original →</a>
        <span className="text-xs" style={{ color: 'var(--color-text-dim)' }}>Source: {article.source_name}. {article.summary_status === 'FALLBACK' ? 'Read the full story at the source.' : 'Full article at source.'}</span>
      </div>
    </div>
  )
}
