'use client'

import { useState } from 'react'
export function SpecsForm({ robotId, robot, brands, categories }: { robotId: string; robot: any; brands: Array<{ id: string; name: string }>; categories: Array<{ id: string; name: string }> }) {
  const [msg, setMsg] = useState('')
  const [specs, setSpecs] = useState<Array<{ label: string; value: string }>>(() =>
    Object.entries(robot.extra_specs && typeof robot.extra_specs === 'object' ? robot.extra_specs : {})
      .map(([label, value]) => ({ label, value: String(value) })),
  )

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const data: any = {}
    form.forEach((v, k) => { data[k] = v })
    data.extra_specs = Object.fromEntries(specs.map(spec => [spec.label.trim(), spec.value.trim()]).filter(([label, value]) => label && value))
    const res = await fetch(`/api/admin/robots/${robotId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const result = await res.json()
    setMsg(result.error ? `Error: ${result.error}` : 'Saved!')
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--color-text-dim)' }}>Name</label>
          <input name="canonical_name" defaultValue={robot.canonical_name}
            className="w-full p-2.5 rounded-md text-sm border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--color-text-dim)' }}>Category</label>
          <select name="category_id" defaultValue={robot.category_id || ''} className="w-full p-2.5 rounded-md text-sm border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }}>
            <option value="">No category assigned</option>
            {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--color-text-dim)' }}>Brand / manufacturer</label>
          <select name="manufacturer_entity_id" defaultValue={robot.manufacturer_entity_id || ''} className="w-full p-2.5 rounded-md text-sm border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }}>
            <option value="">No brand assigned</option>
            {brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
          </select>
        </div>
        <div><label className="block text-xs mb-1" style={{ color: 'var(--color-text-dim)' }}>Payload (kg)</label>
          <input name="payload_kg" type="number" step="0.1" defaultValue={robot.payload_kg || ''}
            className="w-full p-2.5 rounded-md text-sm border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} /></div>
        <div><label className="block text-xs mb-1" style={{ color: 'var(--color-text-dim)' }}>Reach (mm)</label>
          <input name="reach_mm" type="number" step="1" defaultValue={robot.reach_mm || ''}
            className="w-full p-2.5 rounded-md text-sm border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} /></div>
        <div><label className="block text-xs mb-1" style={{ color: 'var(--color-text-dim)' }}>Weight (kg)</label>
          <input name="weight_kg" type="number" step="0.1" defaultValue={robot.weight_kg || ''}
            className="w-full p-2.5 rounded-md text-sm border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} /></div>
        <div><label className="block text-xs mb-1" style={{ color: 'var(--color-text-dim)' }}>Official URL</label>
          <input name="official_url" type="url" defaultValue={robot.official_url || ''} placeholder="https://..."
            className="w-full p-2.5 rounded-md text-sm font-mono border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} /></div>
      </div>
      <div>
        <label className="block text-xs mb-1" style={{ color: 'var(--color-text-dim)' }}>Description</label>
        <textarea name="summary" rows={5} defaultValue={robot.summary || ''}
          className="w-full p-2.5 rounded-md text-sm border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
      </div>
      <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: 'var(--color-border-color)' }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium" style={{ color: 'var(--color-text-heading)' }}>Additional specifications</h3>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-dim)' }}>Named fields from sources; add, edit, or remove any value.</p>
          </div>
          <button type="button" onClick={() => setSpecs(current => [...current, { label: '', value: '' }])}
            className="rounded-md border px-3 py-2 text-xs" style={{ color: 'var(--color-text-body)', borderColor: 'var(--color-border-color)' }}>+ Add field</button>
        </div>
        {specs.map((spec, index) => (
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] gap-2" key={`${index}-${spec.label}`}>
            <input aria-label="Specification name" value={spec.label} placeholder="Specification"
              onChange={event => setSpecs(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))}
              className="min-w-0 p-2.5 rounded-md text-sm border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
            <input aria-label="Specification value" value={spec.value} placeholder="Value"
              onChange={event => setSpecs(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))}
              className="min-w-0 p-2.5 rounded-md text-sm border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
            <button type="button" onClick={() => setSpecs(current => current.filter((_, itemIndex) => itemIndex !== index))}
              className="rounded-md border px-3 text-xs" style={{ color: 'var(--color-accent-decline)', borderColor: 'var(--color-border-color)' }}>Remove</button>
          </div>
        ))}
        {!specs.length && <p className="text-xs" style={{ color: 'var(--color-text-dim)' }}>No additional specifications yet.</p>}
      </div>
      <div>
        <label className="block text-xs mb-1" style={{ color: 'var(--color-text-dim)' }}>Image URL (external, downloaded to server)</label>
        <input name="image_url" defaultValue={robot.image_url || ''} placeholder="https://..."
          className="w-full p-2.5 rounded-md text-sm font-mono border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
      </div>
      <button type="submit" className="px-4 py-2.5 rounded-md text-sm font-medium"
        style={{ background: 'var(--color-accent-cta)', color: 'var(--color-accent-cta-text)' }}>
        Save Changes
      </button>
      {msg && <span className="ml-3 text-xs" style={{ color: msg.startsWith('Error') ? 'var(--color-accent-decline)' : 'var(--color-accent-growth)' }}>{msg}</span>}
    </form>
  )
}
