'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function BudgetControls({ enabled, daily, monthly, models }: { enabled: boolean; daily: number; monthly: number; models: { id: string; name: string }[] }) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  async function save(body: Record<string, unknown>) {
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/admin/ai/budget', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!response.ok) throw new Error((await response.json()).error || 'Save failed')
      setMessage('Saved'); router.refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Save failed') }
    finally { setBusy(false) }
  }
  return <div className="space-y-6">
    <form className="flex flex-wrap gap-4 items-end" onSubmit={event => {
      event.preventDefault(); const data = new FormData(event.currentTarget)
      void save({ action: 'policy', daily, monthly, enabled: data.get('enabled') === 'on' })
    }}>
      <label><input name="enabled" type="checkbox" defaultChecked={enabled} /> Allow AI calls</label>
      <button className="border rounded p-2" disabled={busy}>Save subscription state</button>
      <button type="button" className="border rounded p-2 text-red-600" disabled={busy} onClick={() => void save({ action: 'policy', enabled: false, daily, monthly })}>Stop AI now</button>
    </form>
    <details><summary>Inactive pay-as-you-go tariffs (paid routing is blocked)</summary><form className="flex flex-wrap gap-4 items-end" onSubmit={event => {
      event.preventDefault(); const data = new FormData(event.currentTarget)
      void save({ action: 'price', modelId: data.get('modelId'), input: Number(data.get('input')), output: Number(data.get('output')), source: data.get('source') })
    }}>
      <label>Model<select name="modelId" className="block border p-2 max-w-full" required>{models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      <label>Input USD / 1M tokens<input className="block border p-2" name="input" type="number" min="0.000001" max="10000" step="0.000001" required /></label>
      <label>Output USD / 1M tokens<input className="block border p-2" name="output" type="number" min="0.000001" max="10000" step="0.000001" required /></label>
      <label>Verified pricing source<input className="block border p-2" name="source" type="url" maxLength={1000} required /></label>
      <button className="border rounded p-2" disabled={busy}>Confirm tariff for 30 days</button>
    </form></details>
    <p role="status">{message}</p>
  </div>
}
