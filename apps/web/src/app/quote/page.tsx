import Link from 'next/link'
import { requestQuote } from '../public-form-actions'

export async function generateMetadata() {
  return { title: 'Request a Quote', description: 'Get pricing and integration information for robotics solutions tailored to your business.' }
}

export default async function QuotePage({ searchParams }: { searchParams: Promise<{ robot?: string; status?: string; error?: string }> }) {
  const params = await searchParams
  return (
    <div className="max-w-[720px] mx-auto px-6 py-16" style={{ color: 'var(--color-text-body)' }}>
      <h1 className="text-4xl font-semibold mb-4" style={{ color: 'var(--color-text-heading)' }}>Request a Quote</h1>
      <p className="mb-8" style={{ color: 'var(--color-text-muted)' }}>
        Get pricing and integration information for robotics solutions tailored to your business.
      </p>

      {params.status === 'received' && <p role="status" className="rounded-md p-3 text-sm">Thank you. Your request was received.</p>}
      {params.error && <p role="alert" className="rounded-md p-3 text-sm">{params.error}</p>}
      <form action={requestQuote} className="space-y-6">
        <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
        <div>
          <label className="block text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>Robot Model (if known)</label>
          <input type="text" name="robot" defaultValue={params.robot ?? ''}
            placeholder="e.g. IRB-6700" className="w-full p-3 rounded-md text-sm border"
            style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>Your Name *</label>
            <input type="text" name="name" required className="w-full p-3 rounded-md text-sm border"
              style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
          </div>
          <div>
            <label className="block text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>Company</label>
            <input type="text" name="company" className="w-full p-3 rounded-md text-sm border"
              style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>Business Email *</label>
            <input type="email" name="email" required className="w-full p-3 rounded-md text-sm border"
              style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
          </div>
          <div>
            <label className="block text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>Country</label>
            <input type="text" name="country" maxLength={2} placeholder="US" className="w-full p-3 rounded-md text-sm border"
              style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
          </div>
        </div>

        <div>
          <label className="block text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>Message</label>
          <textarea name="message" rows={4} placeholder="Describe your project and requirements..." className="w-full p-3 rounded-md text-sm border"
            style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
        </div>

        <label className="flex items-start gap-2 text-xs cursor-pointer" style={{ color: 'var(--color-text-dim)' }}>
          <input type="checkbox" name="consent" required className="mt-1 accent-[var(--color-accent-cta)]" />
          I consent to the processing of my personal data in accordance with the{' '}
          <Link href="/privacy" className="underline">Privacy Policy</Link>.
        </label>

        <button type="submit" className="px-6 py-3 rounded-md text-sm font-medium transition-opacity hover:opacity-90"
          style={{ background: 'var(--color-accent-cta)', color: 'var(--color-accent-cta-text)' }}>
          Send Request
        </button>
      </form>
    </div>
  )
}
