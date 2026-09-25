'use client'

import { useState } from 'react'

export function UploadForm({ robotId }: { robotId: string }) {
  const [msg, setMsg] = useState('')

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const file = form.get('image') as File
    if (!file || !file.name) { setMsg('Select a file first'); return }
    setMsg('Uploading...')
    const res = await fetch(`/api/admin/robots/${robotId}/image`, { method: 'POST', body: form })
    const data = await res.json()
    if (data.success) { setMsg('Uploaded! Refreshing...'); setTimeout(() => window.location.reload(), 500) }
    else { setMsg(data.error || 'Upload failed') }
  }

  return (
    <form onSubmit={upload}>
      <input type="file" name="image" accept="image/*"
        className="text-xs mb-2 block p-2 rounded-md border cursor-pointer"
        style={{ color: 'var(--color-text-muted)', background: 'var(--color-input-bg)', borderColor: 'var(--color-input-border)' }} />
      <button type="submit" className="px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer"
        style={{ background: 'var(--color-accent-cta)', color: 'var(--color-accent-cta-text)' }}>
        Upload New Image
      </button>
      {msg && <p className="text-xs mt-1" style={{ color: msg.startsWith('Upload') || msg === 'Uploaded! Refreshing...' ? 'var(--color-accent-growth)' : 'var(--color-accent-decline)' }}>{msg}</p>}
    </form>
  )
}
