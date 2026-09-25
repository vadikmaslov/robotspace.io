'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { CompanyUploadForm, DeleteCompanyButton } from './company-actions'
import { EntitySourceLinks } from '../../entity-source-links'

export default function AdminCompanyEditPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState('')
  const [company, setCompany] = useState<any>(null)
  const [robotCount, setRobotCount] = useState(0)

  useEffect(() => { params.then(p => setId(p.id)) }, [params])

  useEffect(() => {
    if (!id) return
    fetch('/api/admin/companies/' + id).then(r => r.json()).then(data => {
      setCompany(data)
      setRobotCount(data.robot_count || 0)
    })
  }, [id])

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const data: any = {}
    form.forEach((v, k) => { data[k] = v })
    await fetch(`/api/admin/companies/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    location.reload()
  }

  if (!company) return <p style={{ color: 'var(--color-text-muted)' }}>Loading...</p>

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text-heading)' }}>Edit: {company.canonical_name}</h1>
        <Link href="/admin/companies" className="text-sm" style={{ color: 'var(--color-text-muted)' }}>← Back</Link>
      </div>

      <div className="p-5 rounded-xl space-y-4" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}>
        <h2 className="text-lg font-medium" style={{ color: 'var(--color-text-heading)' }}>Company Details</h2>

        {/* Logo preview + upload */}
        <div className="flex items-start gap-4 p-3 rounded-lg" style={{ background: 'var(--color-bg-elevated)' }}>
          <div className="w-16 h-16 rounded-md border flex items-center justify-center overflow-hidden flex-shrink-0" style={{ background: '#fff', borderColor: 'var(--color-border-color)' }}>
            {company.image_url ? <img src={company.image_url} alt="" className="w-full h-full object-contain" /> : <span className="text-2xl">🏢</span>}
          </div>
          <CompanyUploadForm companyId={id} />
        </div>

        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-text-dim)' }}>Name</label>
              <input name="canonical_name" defaultValue={company.canonical_name} className="w-full p-2.5 rounded-md text-sm border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-text-dim)' }}>Country</label>
              <input name="country_code" defaultValue={company.country_code || ''} className="w-full p-2.5 rounded-md text-sm border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-text-dim)' }}>Founded Year</label>
              <input name="founded_year" type="number" defaultValue={company.founded_year || ''} className="w-full p-2.5 rounded-md text-sm border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-text-dim)' }}>Official company website</label>
              <input name="official_url" type="url" defaultValue={company.official_url || ''} placeholder="https://company.example" className="w-full p-2.5 rounded-md text-sm font-mono border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
              <label className="mt-2 flex items-start gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                <input name="official_url_confirmed" type="checkbox" className="mt-0.5" />
                <span>I confirmed this is the company’s official HTTPS site.</span>
              </label>
              {company.official_url && <p className="mt-1 text-xs" style={{ color: company.official_url_verified_at ? 'var(--color-success, #65c466)' : 'var(--color-warning, #d9a441)' }}>
                {company.official_url_verified_at
                  ? `Verified via ${company.official_url_verification_method || 'existing record'} on ${new Date(company.official_url_verified_at).toISOString().slice(0, 10)}`
                  : 'Unverified URL — it will not be inherited by robots.'}
              </p>}
            </div>
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-dim)' }}>Description</label>
            <textarea name="summary" rows={4} defaultValue={company.summary || ''} className="w-full p-2.5 rounded-md text-sm border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-dim)' }}>Logo URL</label>
            <input name="image_url" defaultValue={company.image_url || ''} className="w-full p-2.5 rounded-md text-sm font-mono border" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
          </div>
          <button type="submit" className="px-4 py-2.5 rounded-md text-sm font-medium" style={{ background: 'var(--color-accent-cta)', color: 'var(--color-accent-cta-text)' }}>Save</button>
        </form>

        <div className="pt-4 border-t" style={{ borderColor: 'var(--color-border-color)' }}>
          <DeleteCompanyButton companyId={id} robotCount={robotCount} />
        </div>
      </div>

      <EntitySourceLinks links={company.source_links || []} />
    </div>
  )
}
