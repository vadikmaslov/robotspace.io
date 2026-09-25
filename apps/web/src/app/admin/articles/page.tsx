import { prisma } from '@robotspace/db'
import Link from 'next/link'
import { DeleteArticleButton } from './delete-button'

export const dynamic = 'force-dynamic'

const SRC_LABEL: Record<string, string> = {
  the_robot_report: 'The Robot Report',
  ieee_spectrum_robotics: 'IEEE Spectrum',
  wikidata: 'Wikidata',
}

export default async function AdminArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const params = await searchParams
  let articles: any[] = []
  let total = 0

  try {
    const where: any = {}
    if (params.q) {
      where.OR = [
        { title: { contains: params.q, mode: 'insensitive' } },
        { authors: { contains: params.q, mode: 'insensitive' } },
      ]
    }
    ;[articles, total] = await Promise.all([
      prisma.articles.findMany({ where, orderBy: { published_at: 'desc' }, take: 50 }),
      prisma.articles.count({ where }),
    ])
  } catch (e) { console.error(e) }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text-heading)' }}>
          Articles ({total})
        </h1>
        <Link href="/admin/articles/new" className="px-4 py-2 rounded-md text-sm font-medium"
          style={{ background: 'var(--color-accent-cta)', color: 'var(--color-accent-cta-text)' }}>
          + Add Article
        </Link>
      </div>

      {/* Search */}
      <form action="/admin/articles" method="GET" className="flex gap-2">
        <input name="q" defaultValue={params.q || ''} placeholder="Search title or author..."
          className="p-2.5 rounded-md text-sm border min-w-[300px]" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
        <button type="submit" className="px-4 py-2.5 rounded-md text-sm font-medium"
          style={{ background: 'var(--color-accent-cta)', color: 'var(--color-accent-cta-text)' }}>Search</button>
        {params.q && (
          <Link href="/admin/articles" className="px-4 py-2.5 rounded-md text-sm border"
            style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border-color)' }}>Reset</Link>
        )}
      </form>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left" style={{ borderColor: 'var(--color-border-color)' }}>
              <th className="py-3 pr-4 text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-dim)' }}>Title</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-dim)' }}>Author</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-dim)' }}>Source</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-dim)' }}>Date</th>
              <th className="py-3 text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-dim)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {articles.map((a: any) => (
              <tr key={a.id} className="border-b hover:bg-[var(--color-hover-bg)]" style={{ borderColor: 'var(--color-border-color)' }}>
                <td className="py-3 pr-4 max-w-xs truncate" style={{ color: 'var(--color-text-body)' }}>{a.title}</td>
                <td className="py-3 pr-4" style={{ color: 'var(--color-text-muted)' }}>{a.authors || '—'}</td>
                <td className="py-3 pr-4">
                  <span className="text-xs font-mono" style={{ color: 'var(--color-accent-cta)' }}>
                    {SRC_LABEL[a.source_id] || a.source_id || '—'}
                  </span>
                </td>
                <td className="py-3 pr-4 text-xs font-mono" style={{ color: 'var(--color-text-dim)' }}>
                  {new Date(a.published_at).toISOString().slice(0, 10)}
                </td>
                <td className="py-3 flex gap-2">
                  <Link href={`/admin/articles/${a.id}`} className="text-xs px-3 py-1.5 rounded-md border transition-colors"
                    style={{ color: 'var(--color-text-body)', borderColor: 'var(--color-border-color)' }}>Edit</Link>
                  <DeleteArticleButton articleId={a.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
