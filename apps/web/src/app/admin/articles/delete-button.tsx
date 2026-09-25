'use client'

import { useRouter } from 'next/navigation'

export function DeleteArticleButton({ articleId }: { articleId: string }) {
  const router = useRouter()

  async function del() {
    if (!confirm('Delete this article? This will also remove its previews.')) return
    await fetch(`/api/admin/articles/${articleId}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <button onClick={del} className="text-xs px-2 py-1 rounded border transition-colors"
      style={{ color: 'var(--color-accent-decline)', borderColor: 'var(--color-accent-decline)' }}>
      Delete
    </button>
  )
}
