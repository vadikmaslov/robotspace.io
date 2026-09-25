'use client'

import { useRouter } from 'next/navigation'

export function DeleteButton({ providerId }: { providerId: string }) {
  const router = useRouter()

  async function handleDelete() {
    if (!confirm('Delete this provider?')) return
    try {
      const res = await fetch(`/api/admin/ai/providers/${providerId}`, { method: 'POST' })
      if (res.ok) {
        router.push('/admin/ai/providers')
        router.refresh()
      }
    } catch {}
  }

  return (
    <button onClick={handleDelete}
      className="px-4 py-2 rounded-md text-sm border transition-colors hover:opacity-80"
      style={{ color: 'var(--color-accent-decline)', borderColor: 'var(--color-accent-decline)' }}>
      Delete Provider
    </button>
  )
}
