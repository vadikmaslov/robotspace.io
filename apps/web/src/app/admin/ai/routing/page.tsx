'use client'

import { useEffect, useState } from 'react'

type Model = { id: string; display_name?: string | null; remote_model_id: string; provider_name?: string }
type Route = { id: string; model_id: string; rank: number }
type AgentRule = { operation: string; label: string; simplePercent: number; complexPercent: number }

export default function AdminAIRoutingPage() {
  const [models, setModels] = useState<Model[]>([])
  const [simple, setSimple] = useState<Route[]>([])
  const [complex, setComplex] = useState<Route[]>([])
  const [agentRules, setAgentRules] = useState<AgentRule[]>([])
  const [error, setError] = useState('')

  async function reload() {
    const response = await fetch('/api/admin/ai/routing-data')
    const data = await response.json()
    if (!response.ok) { setError(data.error || 'Unable to load routing'); return }
    setModels(data.models || [])
    setSimple(data.simple || [])
    setComplex(data.complex || [])
    setAgentRules(data.agentRules || [])
  }
  useEffect(() => { void reload() }, [])

  async function request(body: Record<string, unknown>, method = 'POST') {
    setError('')
    const response = await fetch('/api/admin/ai/routes', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await response.json()
    if (!response.ok) { setError(data.error || 'Routing change failed'); return }
    await reload()
  }
  async function remove(id: string) {
    setError('')
    const response = await fetch(`/api/admin/ai/routes?id=${id}`, { method: 'DELETE' })
    const data = await response.json()
    if (!response.ok) { setError(data.error || 'Routing change failed'); return }
    await reload()
  }
  const modelName = (id: string) => {
    const model = models.find(item => item.id === id)
    return model ? `${model.display_name || model.remote_model_id}${model.provider_name ? ` — ${model.provider_name}` : ''}` : id.slice(0, 8)
  }

  const chain = (title: string, scope: 'SIMPLE_DEFAULT' | 'COMPLEX_DEFAULT', routes: Route[], color: string) => <section className="space-y-3">
    <h2 className="text-lg font-medium" style={{ color: 'var(--color-text-heading)' }}><span style={{ color }}>{title}</span> model chain</h2>
    <p className="text-xs" style={{ color: 'var(--color-text-dim)' }}>First model is used first. A timeout, rate limit, provider error, or invalid credential moves work to the next enabled model.</p>
    {!routes.length && <p className="text-sm" style={{ color: 'var(--color-text-dim)' }}>No model configured.</p>}
    {routes.map((route, index) => <div key={route.id} className="flex items-center gap-3 rounded p-3" style={{ background: 'var(--color-bg-card)' }}>
      <span className="w-5 font-mono text-xs" style={{ color: 'var(--color-text-dim)' }}>{index + 1}</span>
      <span className="flex-1 text-sm" style={{ color: 'var(--color-text-body)' }}>{modelName(route.model_id)}</span>
      <button disabled={index === 0} onClick={() => request({ id: route.id, direction: 'up' }, 'PATCH')} className="rounded border px-2 py-1 text-xs disabled:opacity-30" style={{ borderColor: 'var(--color-border-color)' }}>Up</button>
      <button disabled={index === routes.length - 1} onClick={() => request({ id: route.id, direction: 'down' }, 'PATCH')} className="rounded border px-2 py-1 text-xs disabled:opacity-30" style={{ borderColor: 'var(--color-border-color)' }}>Down</button>
      <button onClick={() => remove(route.id)} className="rounded px-2 py-1 text-xs" style={{ color: 'var(--color-accent-decline)' }}>Remove</button>
    </div>)}
    <div className="flex flex-wrap gap-2 pt-1">{models.map(model => <button key={model.id} onClick={() => request({ model_id: model.id, scope })} className="rounded border px-2 py-1 text-xs" style={{ color: 'var(--color-text-body)', borderColor: 'var(--color-border-color)' }}>+ {model.display_name || model.remote_model_id}</button>)}</div>
  </section>

  return <div className="max-w-5xl space-y-9">
    <div><h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text-heading)' }}>AI Routing</h1><p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>Configure quality/cost mix per agent and the ordered fallback chain for each model class.</p></div>
    {error && <p className="rounded border p-3 text-sm" style={{ color: 'var(--color-accent-decline)', borderColor: 'var(--color-accent-decline)' }}>{error}</p>}
    <section><h2 className="mb-3 text-lg font-medium" style={{ color: 'var(--color-text-heading)' }}>Agent routing rules</h2><div className="overflow-x-auto rounded border" style={{ borderColor: 'var(--color-border-color)' }}><table className="w-full text-sm"><thead><tr style={{ background: 'var(--color-bg-card)', color: 'var(--color-text-dim)' }}><th className="p-3 text-left">Agent</th><th className="p-3 text-right">SIMPLE</th><th className="p-3 text-right">COMPLEX</th><th className="p-3 text-left">Rule</th></tr></thead><tbody>{agentRules.map(rule => <tr key={rule.operation} className="border-t" style={{ borderColor: 'var(--color-border-color)' }}><td className="p-3"><div style={{ color: 'var(--color-text-body)' }}>{rule.label}</div><div className="font-mono text-[11px]" style={{ color: 'var(--color-text-dim)' }}>{rule.operation}</div></td><td className="p-3 text-right font-mono" style={{ color: 'var(--color-accent-cta)' }}>{rule.simplePercent}%</td><td className="p-3 text-right font-mono" style={{ color: '#818cf8' }}>{rule.complexPercent}%</td><td className="p-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>Stable per-input selection; selected scope uses its ordered chain.</td></tr>)}</tbody></table></div></section>
    {chain('SIMPLE', 'SIMPLE_DEFAULT', simple, 'var(--color-accent-cta)')}
    {chain('COMPLEX', 'COMPLEX_DEFAULT', complex, '#818cf8')}
  </div>
}
