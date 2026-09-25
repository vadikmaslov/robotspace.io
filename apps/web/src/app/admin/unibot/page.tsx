'use client'

import { useState, useEffect } from 'react'

interface Config {
  id: string
  feed_url: string
  cron_expression: string
  is_enabled: boolean
  last_sync_at: string | null
  last_sync_status: string | null
  last_sync_count: number
  last_error: string | null
}

interface Counts {
  total: number
  robots: number
  brands: number
}

export default function AdminUnibotPage() {
  const [config, setConfig] = useState<Config | null>(null)
  const [counts, setCounts] = useState<Counts>({ total: 0, robots: 0, brands: 0 })
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncResult, setSyncResult] = useState<any>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/unibot/config')
      .then(r => r.json())
      .then(d => { setConfig(d.config); setCounts(d.counts) })
      .finally(() => setLoading(false))
  }, [])

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const form = new FormData(e.target as HTMLFormElement)
    const body = {
      feed_url: form.get('feed_url'),
      cron_expression: form.get('cron_expression'),
      is_enabled: form.get('is_enabled') === 'on',
    }
    const res = await fetch('/api/admin/unibot/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (res.ok) {
      setConfig(data.config)
    } else {
      setError(data.error || 'Save failed')
    }
    setSaving(false)
  }

  async function triggerSync() {
    setSyncing(true)
    setSyncResult(null)
    setError('')
    const res = await fetch('/api/admin/unibot/sync', { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      setSyncResult(data)
      // Refresh config + counts
      const cfg = await fetch('/api/admin/unibot/config').then(r => r.json())
      setConfig(cfg.config)
      setCounts(cfg.counts)
    } else {
      setError(data.error || 'Sync failed')
    }
    setSyncing(false)
  }

  if (loading) return <div className="p-8 text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>

  return (
    <div className="space-y-8 max-w-3xl">
      <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text-heading)' }}>Unibot Integration</h1>
      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
        Import catalog data from unibot.ru as supplementary reference for the data collection agent.
      </p>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          ['Total Cached', String(counts.total)],
          ['Robots', String(counts.robots)],
          ['Brands', String(counts.brands)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl p-5" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}>
            <div className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
            <div className="font-mono text-2xl mt-1" style={{ color: 'var(--color-text-heading)' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Last sync status */}
      {config && (
        <div className="rounded-xl p-5 space-y-2" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-medium" style={{ color: 'var(--color-text-heading)' }}>Sync Status</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              config.last_sync_status === 'ok' ? 'text-green-400 bg-green-400/10' :
              config.last_sync_status === 'error' ? 'text-red-400 bg-red-400/10' :
              'text-gray-400 bg-gray-400/10'
            }`}>
              {config.last_sync_status || 'never'}
            </span>
          </div>
          <div className="text-sm space-y-1" style={{ color: 'var(--color-text-muted)' }}>
            {config.last_sync_at && <div>Last sync: {new Date(config.last_sync_at).toLocaleString()}</div>}
            <div>Items cached: {config.last_sync_count}</div>
            {config.last_error && <div className="text-red-400">Error: {config.last_error}</div>}
          </div>
        </div>
      )}

      {/* Config form */}
      <form onSubmit={saveConfig} className="rounded-xl p-5 space-y-4" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}>
        <h2 className="text-lg font-medium" style={{ color: 'var(--color-text-heading)' }}>Configuration</h2>

        {error && (
          <div className="p-3 rounded-md text-sm border" style={{ color: 'var(--color-accent-decline)', borderColor: 'var(--color-accent-decline)', background: 'rgba(235,87,87,0.06)' }}>
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>Feed URL</label>
          <input name="feed_url" defaultValue={config?.feed_url}
            className="w-full p-2.5 rounded-md text-sm border font-mono"
            style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>Cron Expression</label>
            <input name="cron_expression" defaultValue={config?.cron_expression}
              className="w-full p-2.5 rounded-md text-sm border font-mono"
              style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
            <div className="text-[11px] mt-1" style={{ color: 'var(--color-text-dim)' }}>e.g. 0 */6 * * * (every 6 hours)</div>
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" name="is_enabled" defaultChecked={config?.is_enabled}
                className="accent-[var(--color-accent-cta)]" />
              <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Enabled</span>
            </label>
          </div>
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={saving}
            className="px-5 py-2.5 rounded-md text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--color-accent-cta)', color: 'var(--color-accent-cta-text)' }}>
            {saving ? 'Saving...' : 'Save Config'}
          </button>
          <button type="button" onClick={triggerSync} disabled={syncing}
            className="px-5 py-2.5 rounded-md text-sm font-medium border transition-colors hover:border-[var(--color-border-strong)]"
            style={{ color: 'var(--color-text-body)', borderColor: 'var(--color-border-color)', background: 'transparent' }}>
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>

        {syncResult && (
          <div className="p-3 rounded-md text-sm border" style={{ color: 'var(--color-accent-growth)', borderColor: 'var(--color-accent-growth)', background: 'rgba(39,166,68,0.06)' }}>
            Sync complete: {syncResult.inserted} new, {syncResult.updated} updated · {syncResult.total} total ({syncResult.robots} robots, {syncResult.brands} brands)
          </div>
        )}
      </form>
    </div>
  )
}
