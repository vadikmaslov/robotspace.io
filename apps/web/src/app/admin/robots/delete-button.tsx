'use client'

import { useRouter } from 'next/navigation'

export function DeleteRobotButton({ robotId }: { robotId: string }) {
  const router = useRouter()

  async function del() {
    if (!confirm('Archive this robot? It will remain in the audit history.')) return
    await fetch(`/api/admin/robots/${robotId}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <button onClick={del} className="text-xs px-2 py-1 rounded border transition-colors"
      style={{ color: 'var(--color-accent-decline)', borderColor: 'var(--color-accent-decline)' }}>
      Archive
    </button>
  )
}
