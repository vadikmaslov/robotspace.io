'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface ArticleEditFormProps {
  article: {
    id: string
    title: string
    authors: string | null
    canonical_url: string
    published_at: string
    language: string
    source_id: string | null
    categories: any
    list_summary: string | null
    detail_summary: string | null
    publication_status: 'PENDING' | 'PUBLISHED' | 'DRAFT' | 'ARCHIVED'
    brands: string[]
    robots: string[]
  }
}

export function ArticleEditForm({ article }: ArticleEditFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const form = new FormData(e.currentTarget)
    let categories = null
    try {
      const raw = form.get('categories') as string
      if (raw?.trim()) categories = JSON.parse(raw)
    } catch { setError('Invalid JSON in categories'); setSaving(false); return }

    const res = await fetch(`/api/admin/articles/${article.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.get('title'),
        authors: form.get('authors') || null,
        canonical_url: form.get('canonical_url'),
        published_at: form.get('published_at'),
        language: form.get('language'),
        source_id: form.get('source_id') || null,
        categories,
        list_summary: form.get('list_summary') || null,
        detail_summary: form.get('detail_summary') || null,
        publication_status: form.get('publication_status'),
        brands: (form.get('brands') as string).split(/\n|,/).map(value => value.trim()).filter(Boolean),
        robots: (form.get('robots') as string).split(/\n|,/).map(value => value.trim()).filter(Boolean),
      }),
    })

    if (res.ok) {
      router.refresh()
      setSaving(false)
    } else {
      const data = await res.json()
      setError(data.error || 'Save failed')
      setSaving(false)
    }
  }

  const publishedDate = new Date(article.published_at).toISOString().slice(0, 16)
  const catsStr = article.categories ? JSON.stringify(article.categories, null, 2) : ''

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 rounded-md text-sm border" style={{ color: 'var(--color-accent-decline)', borderColor: 'var(--color-accent-decline)', background: 'rgba(235,87,87,0.06)' }}>
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>Title *</label>
        <input name="title" defaultValue={article.title} required
          className="w-full p-2.5 rounded-md text-sm border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div><label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>Mentioned brands</label><textarea name="brands" defaultValue={article.brands.join('\n')} rows={5} placeholder="One existing brand per line" className="w-full p-2.5 rounded-md text-sm border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} /><p className="text-xs mt-1" style={{ color: 'var(--color-text-dim)' }}>Names must match brands in the database. Saving replaces this list.</p></div>
        <div><label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>Mentioned robots</label><textarea name="robots" defaultValue={article.robots.join('\n')} rows={5} placeholder="One existing robot per line" className="w-full p-2.5 rounded-md text-sm border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} /><p className="text-xs mt-1" style={{ color: 'var(--color-text-dim)' }}>Names must match robots in the database. Saving replaces this list.</p></div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>Authors</label>
          <input name="authors" defaultValue={article.authors || ''}
            className="w-full p-2.5 rounded-md text-sm border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
        </div>
        <div>
          <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>Source ID</label>
          <input name="source_id" defaultValue={article.source_id || ''} placeholder="the_robot_report, wikidata..."
            className="w-full p-2.5 rounded-md text-sm border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
        </div>
      </div>

      <div>
        <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>Canonical URL *</label>
        <input name="canonical_url" defaultValue={article.canonical_url} required type="url"
          className="w-full p-2.5 rounded-md text-sm border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>Published At</label>
          <input name="published_at" defaultValue={publishedDate} type="datetime-local"
            className="w-full p-2.5 rounded-md text-sm border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
        </div>
        <div>
          <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>Language</label>
          <select name="language" defaultValue={article.language || 'en'}
            className="w-full p-2.5 rounded-md text-sm border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }}>
            <option value="en">English (en)</option>
            <option value="de">German (de)</option>
            <option value="ja">Japanese (ja)</option>
            <option value="zh">Chinese (zh)</option>
            <option value="ko">Korean (ko)</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>
          Categories <span className="text-xs" style={{ color: 'var(--color-text-dim)' }}>(JSON array e.g. ["technology","ai"])</span>
        </label>
        <textarea name="categories" defaultValue={catsStr} rows={3} placeholder='["technology", "ai"]'
          className="w-full p-2.5 rounded-md text-sm border font-mono" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
      </div>

      <div className="pt-2 border-t" style={{ borderColor: 'var(--color-border-color)' }}>
        <div className="text-sm font-medium mb-1" style={{ color: 'var(--color-text-body)' }}>Public preview text</div>
        <p className="text-xs mb-3" style={{ color: 'var(--color-text-dim)' }}>
          The list preview appears on Insights cards. The detailed preview appears on the article page; blank lines create paragraphs.
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>List preview</label>
            <textarea name="list_summary" defaultValue={article.list_summary || ''} rows={4} maxLength={1_200}
              placeholder="Short card description"
              className="w-full p-2.5 rounded-md text-sm border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
          </div>
          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>Detailed preview</label>
            <textarea name="detail_summary" defaultValue={article.detail_summary || ''} rows={12} maxLength={8_000}
              placeholder="Longer reader-facing description. Separate paragraphs with a blank line."
              className="w-full p-2.5 rounded-md text-sm border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>Publication status</label>
        <select name="publication_status" defaultValue={article.publication_status}
          className="w-full p-2.5 rounded-md text-sm border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }}>
          <option value="PUBLISHED">Published</option>
          <option value="DRAFT">Draft</option>
          <option value="PENDING">Pending summary</option>
          <option value="ARCHIVED">Archived</option>
        </select>
      </div>

      <button type="submit" disabled={saving}
        className="px-6 py-2.5 rounded-md text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{ background: 'var(--color-accent-cta)', color: 'var(--color-accent-cta-text)' }}>
        {saving ? 'Saving...' : 'Save Changes'}
      </button>
    </form>
  )
}
