'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function CompareSelector({ allRobots, selectedIds, page, totalPages }: { allRobots: any[]; selectedIds: string[]; page: number; totalPages: number }) {
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>(selectedIds)

  function toggle(id: string) {
    const next = selected.includes(id)
      ? selected.filter(selectedId => selectedId !== id)
      : selected.length >= 5 ? null : [...selected, id]
    if (!next) { alert('Max 5 robots'); return }
    setSelected(next)
    document.cookie = `compare_ids=${next.join(',')}; path=/; max-age=86400; SameSite=Lax`
    router.refresh()
  }

  function clear() {
    setSelected([])
    localStorage.removeItem('compare_ids')
    document.cookie = 'compare_ids=; path=/; max-age=0; SameSite=Lax'
    router.refresh()
  }

  return <div className="space-y-6">
    {selected.length < 2 && <div className="p-6 rounded-xl text-center" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}>
      <p style={{ color: 'var(--color-text-muted)' }}>{selected.length === 0 ? 'Click "Add to Compare" on robot pages to build your comparison.' : `${selected.length} robot(s) selected. Select at least 2 to compare.`}</p>
      {selected.length > 0 && <button onClick={clear} className="mt-4 px-4 py-2 rounded-md text-xs border" style={{ color: 'var(--color-accent-decline)', borderColor: 'var(--color-accent-decline)' }}>Clear</button>}
    </div>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-medium" style={{ color: 'var(--color-text-heading)' }}>Add robots:</h2>
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        <button type="button" onClick={() => router.push(`/compare?page=${page - 1}`)} disabled={page <= 1} className="rounded border px-3 py-1.5 disabled:opacity-40" style={{ borderColor: 'var(--color-border-color)' }}>Previous</button>
        <span>Page {page} of {totalPages}</span>
        <button type="button" onClick={() => router.push(`/compare?page=${page + 1}`)} disabled={page >= totalPages} className="rounded border px-3 py-1.5 disabled:opacity-40" style={{ borderColor: 'var(--color-border-color)' }}>Next</button>
      </div>
    </div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {allRobots.map((robot: any) => <button key={robot.id} onClick={() => toggle(robot.id)} className="p-2 rounded text-xs border transition-colors text-left" style={{
        color: selected.includes(robot.id) ? 'var(--color-accent-cta-text)' : 'var(--color-text-body)', background: selected.includes(robot.id) ? 'var(--color-accent-cta)' : 'transparent', borderColor: selected.includes(robot.id) ? 'var(--color-accent-cta)' : 'var(--color-border-color)', fontWeight: selected.includes(robot.id) ? 510 : 400,
      }}>{selected.includes(robot.id) ? '✓ ' : '+ '}{robot.canonical_name}</button>)}
    </div>
  </div>
}
