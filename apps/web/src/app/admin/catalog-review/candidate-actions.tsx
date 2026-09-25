'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function CandidateActions({ id, canRestore }: { id: string; canRestore: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function decide(action: 'RESTORE' | 'REJECT') {
    setBusy(true); setError('')
    const response = await fetch(`/api/admin/catalog-candidates/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
    const body = await response.json().catch(() => ({}))
    setBusy(false)
    if (!response.ok) { setError(body.error || 'Could not update candidate'); return }
    router.refresh()
  }
  return <div className="flex flex-col items-end gap-2"><div className="flex gap-2">{canRestore && <button type="button" disabled={busy} onClick={() => decide('RESTORE')} className="rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50" style={{ background: 'var(--color-accent-cta)', color: 'var(--color-accent-cta-text)' }}>Restore robot</button>}<button type="button" disabled={busy} onClick={() => decide('REJECT')} className="rounded border px-3 py-1.5 text-xs disabled:opacity-50" style={{ borderColor: 'var(--color-border-color)', color: 'var(--color-text-muted)' }}>Reject</button></div>{error && <span className="text-xs" style={{ color: 'var(--color-accent-decline)' }}>{error}</span>}</div>
}
