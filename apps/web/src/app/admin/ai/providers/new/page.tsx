'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function NewAIProviderPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const form = new FormData(e.currentTarget)
    const data = {
      display_name: form.get('display_name') as string,
      adapter_type: form.get('adapter_type') as string,
      base_url: form.get('base_url') as string || undefined,
      api_key: form.get('api_key') as string,
    }

    try {
      const res = await fetch('/api/admin/ai/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed')
      }

      router.push('/admin/ai/providers')
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-xl space-y-8">
      <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text-heading)' }}>Add AI Provider</h1>

      {error && (
        <div className="p-3 rounded-md text-sm" style={{ background: 'rgba(235,87,87,0.15)', color: 'var(--color-accent-decline)' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>Display Name</label>
          <input name="display_name" placeholder="e.g. OpenAI" required
            className="w-full p-3 rounded-md text-sm border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
        </div>

        <div>
          <label className="block text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>Adapter Type</label>
          <select name="adapter_type" className="w-full p-3 rounded-md text-sm border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }}>
            <option value="openai">OpenAI</option>
            <option value="deepseek">DeepSeek</option>
            <option value="openai_compatible">OpenAI-compatible</option>
          </select>
        </div>

        <div>
          <label className="block text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>Base URL</label>
          <input name="base_url" placeholder="https://api.openai.com/v1"
            className="w-full p-3 rounded-md text-sm font-mono border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
        </div>

        <div>
          <label className="block text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>API Key</label>
          <input name="api_key" type="password" placeholder="sk-..." required
            className="w-full p-3 rounded-md text-sm font-mono border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
        </div>

        <button type="submit" disabled={loading}
          className="px-6 py-3 rounded-md text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: 'var(--color-accent-cta)', color: 'var(--color-accent-cta-text)' }}>
          {loading ? 'Saving...' : 'Save Provider'}
        </button>

        <Link href="/admin/ai/providers" className="ml-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>Cancel</Link>
      </form>
    </div>
  )
}
