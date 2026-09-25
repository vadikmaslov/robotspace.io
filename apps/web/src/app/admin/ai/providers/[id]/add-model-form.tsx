'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type FetchedModel = { id: string; name?: string; added: boolean }

export function AddModelForm({ providerId }: { providerId: string }) {
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [fetching, setFetching] = useState(false)
  const [fetched, setFetched] = useState<FetchedModel[]>([])
  const router = useRouter()

  async function addModel(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return
    const res = await fetch('/api/admin/ai/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider_id: providerId, remote_model_id: id, display_name: name || id }),
    })
    if (res.ok) { setId(''); setName(''); router.refresh() }
  }

  async function fetchModels() {
    setFetching(true)
    try {
      const res = await fetch(`/api/admin/ai/providers/${providerId}/models`)
      const data = await res.json()
      if (data.error) { alert(data.error); setFetching(false); return }
      setFetched(data.models || [])
      if (data.models?.length === 0) alert('No models returned. Try manual entry.')
    } catch {}
    setFetching(false)
  }

  async function addFetched(m: FetchedModel) {
    await fetch('/api/admin/ai/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider_id: providerId, remote_model_id: m.id, display_name: m.name || m.id }),
    })
    setFetched(f => f.map(x => x.id === m.id ? { ...x, added: true } : x))
    router.refresh()
  }

  return (
    <div className="space-y-3">
      <form onSubmit={addModel} className="flex gap-2">
        <input value={id} onChange={e => setId(e.target.value)} placeholder="Model ID"
          className="flex-1 p-2 rounded text-xs border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Display name"
          className="w-32 p-2 rounded text-xs border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
        <button type="submit" className="px-3 py-2 rounded text-xs font-medium"
          style={{ background: 'var(--color-accent-cta)', color: 'var(--color-accent-cta-text)' }}>Add</button>
      </form>

      <button onClick={fetchModels} disabled={fetching}
        className="px-3 py-2 rounded text-xs border transition-colors"
        style={{ color: 'var(--color-text-body)', borderColor: 'var(--color-border-color)' }}>
        {fetching ? 'Fetching...' : '📡 Fetch available models from provider'}
      </button>

      {fetched.length > 0 && (
        <div className="grid grid-cols-2 gap-1 max-h-64 overflow-y-auto mt-2 p-2 rounded" style={{ background: 'var(--color-bg-elevated)' }}>
          {fetched.map(m => (
            <button key={m.id} onClick={() => !m.added && addFetched(m)} disabled={m.added}
              className="text-left px-2 py-1 rounded text-xs truncate transition-colors"
              style={{ color: m.added ? 'var(--color-text-dim)' : 'var(--color-text-body)', opacity: m.added ? 0.5 : 1 }}
              title={m.id}>
              {m.added ? '✓ ' : '+ '}{m.name || m.id}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
