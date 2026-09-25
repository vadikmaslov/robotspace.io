'use client'

import { useRouter } from 'next/navigation'

type Robot = { id: string; canonical_name: string }

export function CompareRemovalControls({ robots, selectedIds }: { robots: Robot[]; selectedIds: string[] }) {
  const router = useRouter()

  function remove(robotId: string) {
    const next = selectedIds.filter(id => id !== robotId)
    const value = next.join(',')
    if (value) {
      localStorage.setItem('compare_ids', value)
      document.cookie = `compare_ids=${value}; path=/; max-age=86400; SameSite=Lax`
    } else {
      localStorage.removeItem('compare_ids')
      document.cookie = 'compare_ids=; path=/; max-age=0; SameSite=Lax'
    }
    router.refresh()
  }

  return <div className="flex flex-wrap items-center gap-2" aria-label="Comparison controls">
    <span className="mr-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>Remove:</span>
    {robots.map(robot => <button key={robot.id} type="button" onClick={() => remove(robot.id)} className="rounded-md border px-3 py-1.5 text-xs transition-colors hover:opacity-80" style={{ color: 'var(--color-accent-decline)', borderColor: 'var(--color-accent-decline)' }}>
      {robot.canonical_name} ×
    </button>)}
  </div>
}
