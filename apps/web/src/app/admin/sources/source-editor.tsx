'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import {
  SOURCE_AREA_LABELS,
  SOURCE_AREAS,
  SOURCE_LEGAL_STATUSES,
  SOURCE_STATUSES,
  SOURCE_TIERS,
  SOURCE_TYPES,
  type SourceCatalogRecord,
} from '../../../lib/source-catalog'

type Props = { source?: SourceCatalogRecord }

const fieldStyle = { background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }

export function SourceEditor({ source }: Props) {
  const router = useRouter()
  const logoInput = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [logoUrl, setLogoUrl] = useState(source?.logo_url ?? '')
  const [isPublic, setIsPublic] = useState(source?.is_public ?? false)

  async function uploadLogo(key: string) {
    const file = logoInput.current?.files?.[0]
    if (!file) return null
    setUploading(true)
    try {
      const form = new FormData()
      form.append('image', file)
      const response = await fetch(`/api/admin/sources/${encodeURIComponent(key)}/logo`, { method: 'POST', body: form })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Logo upload failed')
      setLogoUrl(data.url)
      return data.url as string
    } finally {
      setUploading(false)
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    const form = new FormData(event.currentTarget)
    const body = {
      key: form.get('key'),
      display_name: form.get('display_name'),
      owner_name: form.get('owner_name'),
      homepage_url: form.get('homepage_url'),
      logo_url: logoUrl || form.get('logo_url'),
      content_area: form.get('content_area'),
      admin_description: form.get('admin_description'),
      public_description: form.get('public_description'),
      is_public: isPublic,
      tier: form.get('tier'),
      source_type: form.get('source_type'),
      status: form.get('status'),
      legal_status: form.get('legal_status'),
      schedule: form.get('schedule'),
      rate_limit_rpm: form.get('rate_limit_rpm'),
      trust_default_confidence: form.get('trust_default_confidence'),
      kill_switch: form.get('kill_switch') === 'on',
    }
    const key = source?.key || String(body.key || '')
    try {
      const response = await fetch(source ? `/api/admin/sources/${encodeURIComponent(source.key)}` : '/api/admin/sources', {
        method: source ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Save failed')
      if (logoInput.current?.files?.[0]) await uploadLogo(key)
      if (!source) {
        router.push(`/admin/sources/${encodeURIComponent(key)}`)
      } else {
        setNotice('Saved')
        router.refresh()
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!source || !window.confirm(`Delete “${source.display_name || source.key}”? Sources with history will be disabled instead.`)) return
    setSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/admin/sources/${encodeURIComponent(source.key)}`, { method: 'DELETE' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Delete failed')
      router.push('/admin/sources')
      router.refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Delete failed')
      setSaving(false)
    }
  }

  const title = source ? `Edit ${source.display_name || source.key}` : 'New Source'
  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text-heading)' }}>{title}</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>Registration does not authorize collection. Activate only after the source contract and current terms are reviewed.</p>
        </div>
        <Link href="/admin/sources" className="text-sm" style={{ color: 'var(--color-text-muted)' }}>← All sources</Link>
      </div>

      <form onSubmit={submit} className="space-y-6">
        {(error || notice) && <div className="p-3 rounded-md text-sm border" style={{ color: error ? 'var(--color-accent-decline)' : 'var(--color-accent-cta)', borderColor: error ? 'var(--color-accent-decline)' : 'var(--color-accent-cta)' }}>{error || notice}</div>}

        <Section title="Identity and presentation">
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Display name *"><input name="display_name" required defaultValue={source?.display_name ?? source?.owner_name ?? ''} className="input" style={fieldStyle} /></Field>
            <Field label="Stable key *" hint="Cannot be changed after creation"><input name="key" required disabled={!!source} defaultValue={source?.key ?? ''} placeholder="wikidata" className="input font-mono disabled:opacity-60" style={fieldStyle} /></Field>
            <Field label="Owner / publisher"><input name="owner_name" defaultValue={source?.owner_name ?? ''} className="input" style={fieldStyle} /></Field>
            <Field label="Homepage"><input name="homepage_url" type="url" defaultValue={source?.homepage_url ?? ''} placeholder="https://…" className="input" style={fieldStyle} /></Field>
          </div>
          <div className="grid md:grid-cols-[120px_1fr] gap-4 items-end">
            <div className="w-[120px] h-[72px] rounded-lg border flex items-center justify-center overflow-hidden" style={{ borderColor: 'var(--color-input-border)', background: '#fff' }}>
              {logoUrl ? <img src={logoUrl} alt="Source logo" className="max-w-full max-h-full object-contain" /> : <span className="text-xl font-semibold text-slate-500">{(source?.display_name || source?.key || 'S').slice(0, 1)}</span>}
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Upload logo" hint="JPEG, PNG, WebP or GIF; up to 5 MB"><input ref={logoInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="block w-full text-sm" /></Field>
              <Field label="Logo URL" hint="Optional HTTPS URL; upload takes precedence"><input name="logo_url" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://…" className="input" style={fieldStyle} /></Field>
            </div>
          </div>
        </Section>

        <Section title="Where this source is used">
          <div className="grid md:grid-cols-3 gap-4">
            <Field label="Site area"><select name="content_area" defaultValue={source?.content_area || 'GENERAL'} className="input" style={fieldStyle}>{SOURCE_AREAS.map(area => <option key={area} value={area}>{SOURCE_AREA_LABELS[area]}</option>)}</select></Field>
            <Field label="Technical type"><select name="source_type" defaultValue={source?.source_type || 'MANUAL'} className="input" style={fieldStyle}>{SOURCE_TYPES.map(value => <option key={value}>{value}</option>)}</select></Field>
            <Field label="Trust tier"><select name="tier" defaultValue={source?.tier || 'D'} className="input" style={fieldStyle}>{SOURCE_TIERS.map(value => <option key={value}>{value}</option>)}</select></Field>
          </div>
          <Field label="Admin preview" hint="What it contains, why it exists, boundaries and operational notes."><textarea name="admin_description" rows={4} defaultValue={source?.admin_description ?? ''} className="input w-full" style={fieldStyle} /></Field>
          <Field label="Public description" hint="Short user-facing explanation. It appears in Data Methodology only when published."><textarea name="public_description" rows={3} defaultValue={source?.public_description ?? ''} className="input w-full" style={fieldStyle} /></Field>
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-body)' }}><input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} /> Show this source publicly in Data Methodology</label>
        </Section>

        <Section title="Collection and governance">
          <div className="grid md:grid-cols-3 gap-4">
            <Field label="Status"><select name="status" defaultValue={source?.status || 'PROPOSED'} className="input" style={fieldStyle}>{SOURCE_STATUSES.map(value => <option key={value}>{value}</option>)}</select></Field>
            <Field label="Legal status"><select name="legal_status" defaultValue={source?.legal_status || 'UNKNOWN'} className="input" style={fieldStyle}>{SOURCE_LEGAL_STATUSES.map(value => <option key={value}>{value}</option>)}</select></Field>
            <Field label="Rate limit / min"><input name="rate_limit_rpm" type="number" min="0" max="100000" defaultValue={source?.rate_limit_rpm ?? 10} className="input" style={fieldStyle} /></Field>
            <Field label="Schedule" hint="For the future collector"><input name="schedule" defaultValue={source?.schedule ?? ''} placeholder="0 */6 * * *" className="input font-mono" style={fieldStyle} /></Field>
            <Field label="Default confidence" hint="0 to 1"><input name="trust_default_confidence" type="number" min="0" max="1" step="0.01" defaultValue={Number(source?.trust_default_confidence ?? 0.5)} className="input" style={fieldStyle} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-body)' }}><input name="kill_switch" type="checkbox" defaultChecked={source?.kill_switch} /> Kill switch: do not collect or publish from this source</label>
        </Section>

        <div className="flex flex-wrap gap-3 items-center">
          <button type="submit" disabled={saving || uploading} className="px-5 py-2.5 rounded-md text-sm font-medium disabled:opacity-50" style={{ background: 'var(--color-accent-cta)', color: 'var(--color-accent-cta-text)' }}>{saving ? (uploading ? 'Uploading…' : 'Saving…') : source ? 'Save changes' : 'Create source'}</button>
          {source && <button type="button" disabled={saving} onClick={remove} className="px-5 py-2.5 rounded-md text-sm border disabled:opacity-50" style={{ color: 'var(--color-accent-decline)', borderColor: 'var(--color-accent-decline)' }}>Delete / disable</button>}
        </div>
      </form>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-xl p-5 space-y-4" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}><h2 className="text-lg font-medium" style={{ color: 'var(--color-text-heading)' }}>{title}</h2>{children}</section>
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-2 text-sm" style={{ color: 'var(--color-text-muted)' }}><span>{label}</span>{hint && <span className="text-xs -mt-1" style={{ color: 'var(--color-text-dim)' }}>{hint}</span>}{children}</label>
}
