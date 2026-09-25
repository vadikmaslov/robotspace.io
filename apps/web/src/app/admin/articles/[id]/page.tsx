import { prisma } from '@robotspace/db'
import Link from 'next/link'
import { DeleteArticleButton } from '../delete-button'
import { ArticleEditForm } from '../article-form'
import { ArticleImageUpload } from '../image-upload'

export const dynamic = 'force-dynamic'

export default async function AdminArticleEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let article: any = null

  try {
    article = await prisma.articles.findUnique({ where: { id } })
  } catch {}

  const mentions = await prisma.$queryRawUnsafe<Array<{ entity_type: 'COMPANY' | 'ROBOT'; name: string }>>(`
    SELECT m.entity_type, COALESCE(c.canonical_name, r.canonical_name) AS name
    FROM entity_mentions m LEFT JOIN company_public_projections c ON c.company_entity_id=m.entity_id LEFT JOIN robot_public_projections r ON r.robot_entity_id=m.entity_id
    WHERE m.article_id=$1::uuid ORDER BY m.entity_type, COALESCE(c.canonical_name, r.canonical_name)
  `, id).catch(() => [])

  if (!article) return <div className="p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Article not found</div>

  // These columns were added after the checked-in Prisma client was generated.
  let articleExtras: { image_url: string | null; list_summary: string | null; detail_summary: string | null; publication_status: 'PENDING' | 'PUBLISHED' | 'DRAFT' | 'ARCHIVED' } = {
    image_url: null,
    list_summary: null,
    detail_summary: null,
    publication_status: 'PUBLISHED',
  }
  try {
    const rows = await prisma.$queryRawUnsafe<typeof articleExtras[]>(
      `SELECT image_url, list_summary, detail_summary, COALESCE(publication_status, 'PUBLISHED') AS publication_status FROM articles WHERE id = $1::uuid`,
      id,
    )
    articleExtras = rows[0] ?? articleExtras
  } catch {}

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text-heading)' }}>
          Edit Article
        </h1>
        <Link href="/admin/articles" className="text-sm" style={{ color: 'var(--color-text-muted)' }}>← Back</Link>
      </div>

      {/* Image upload */}
      <div className="flex items-start gap-6 p-5 rounded-xl" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}>
        <div className="w-32 h-24 rounded-lg border flex items-center justify-center overflow-hidden flex-shrink-0" style={{ background: '#fff', borderColor: 'var(--color-border-color)' }}>
          {articleExtras.image_url ? (
            <img src={articleExtras.image_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-3xl">📰</span>
          )}
        </div>
        <div>
          <div className="text-sm font-medium mb-2" style={{ color: 'var(--color-text-body)' }}>Article Image</div>
          <ArticleImageUpload articleId={id} />
          <p className="text-xs mt-2" style={{ color: 'var(--color-text-dim)' }}>Shown on insights card and detail page.</p>
        </div>
      </div>

      {/* Preview block */}
      <div className="p-5 rounded-xl" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}>
        <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-dim)' }}>Public Preview</div>
        <Link href={`/insights/${article.title?.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 80)}`}
          target="_blank" className="text-sm underline break-all" style={{ color: 'var(--color-accent-b2b)' }}>
          /insights/{article.title?.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 80)}
        </Link>
      </div>

      {/* Edit form */}
      <div className="p-5 rounded-xl space-y-4" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}>
        <h2 className="text-lg font-medium" style={{ color: 'var(--color-text-heading)' }}>Article Details</h2>
        <ArticleEditForm article={{
          id: article.id,
          title: article.title,
          authors: article.authors,
          canonical_url: article.canonical_url,
          published_at: article.published_at.toISOString(),
          language: article.language,
          source_id: article.source_id,
          categories: article.categories,
          list_summary: articleExtras.list_summary,
          detail_summary: articleExtras.detail_summary,
          publication_status: articleExtras.publication_status,
          brands: mentions.filter(item => item.entity_type === 'COMPANY').map(item => item.name),
          robots: mentions.filter(item => item.entity_type === 'ROBOT').map(item => item.name),
        }} />
        <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--color-border-color)' }}>
          <DeleteArticleButton articleId={id} />
        </div>
      </div>
    </div>
  )
}
