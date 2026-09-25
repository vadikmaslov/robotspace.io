'use client'

import { useState } from 'react'

export function CompanyUploadForm({ companyId }: { companyId: string }) {
  const [msg, setMsg] = useState('')

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const file = form.get('image') as File
    if (!file || !file.name) { setMsg('Select a file first'); return }
    setMsg('Uploading...')
    const res = await fetch(`/api/admin/companies/${companyId}/image`, { method: 'POST', body: form })
    const data = await res.json()
    if (data.success) { setMsg('Uploaded!'); setTimeout(() => location.reload(), 500) }
    else { setMsg(data.error || 'Upload failed') }
  }

  return (
    <form onSubmit={upload}>
      <input type="file" name="image" accept="image/*" className="text-xs mb-2 block p-2 rounded-md border cursor-pointer"
        style={{ color: 'var(--color-text-muted)', background: 'var(--color-input-bg)', borderColor: 'var(--color-input-border)' }} />
      <button type="submit" className="px-3 py-1.5 rounded-md text-xs font-medium"
        style={{ background: 'var(--color-accent-cta)', color: 'var(--color-accent-cta-text)' }}>Upload Logo</button>
      {msg && <p className="text-xs mt-1" style={{ color: msg.startsWith('Upload') ? 'var(--color-accent-growth)' : 'var(--color-accent-decline)' }}>{msg}</p>}
    </form>
  )
}

export function DeleteCompanyButton({ companyId, robotCount }: { companyId: string; robotCount: number }) {
  const router = (typeof window !== 'undefined') ? require('next/navigation').useRouter() : null

  async function del() {
    const msg = robotCount > 0
      ? `This company has ${robotCount} robot(s) linked. Archive the company? Links and history are preserved.`
      : 'Archive this company? It will remain in the audit history.'
    if (!confirm(msg)) return
    await fetch(`/api/admin/companies/${companyId}`, { method: 'DELETE' })
    if (router) router.push('/admin/companies')
  }

  return (
    <button onClick={del} className="px-4 py-2 rounded-md text-sm border"
      style={{ color: 'var(--color-accent-decline)', borderColor: 'var(--color-accent-decline)' }}>
      Archive Company ({robotCount} robots)
    </button>
  )
}
