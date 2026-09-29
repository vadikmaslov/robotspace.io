import Link from 'next/link'
import { submitData } from '../public-form-actions'

export async function generateMetadata() {
  return { title: 'Submit Data', description: 'Suggest a robot, company, or correction for editorial review.' }
}

export default async function SubmitPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string }> }) {
  const params = await searchParams
  return (
    <div className="max-w-[720px] mx-auto px-6 py-16" style={{ color: 'var(--color-text-body)' }}>
      <h1 className="text-4xl font-semibold mb-4" style={{ color: 'var(--color-text-heading)' }}>Submit Data</h1>
      <p className="mb-8" style={{ color: 'var(--color-text-muted)' }}>
        Suggest a robot, company, or correction for editorial review. Sending a suggestion does not publish it automatically.
      </p>

      {params.status === 'received' && <p role="status" className="rounded-md p-3 text-sm">Thank you. Your submission was received for verification.</p>}
      {params.error && <p role="alert" className="rounded-md p-3 text-sm">{params.error}</p>}
      <form action={submitData} className="space-y-6">
        <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
        <div>
          <label className="block text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>Submission Type</label>
          <div className="flex gap-4">
            {['Add Robot', 'Add Company', 'Submit Update'].map(type => (
              <label key={type} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="type" value={type} required className="accent-[var(--color-accent-cta)]" />
                {type}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>Robot/Company Name *</label>
          <input type="text" name="name" required placeholder="e.g. ABB IRB-6700" className="w-full p-3 rounded-md text-sm border"
            style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
        </div>

        <div>
          <label className="block text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>Source URLs</label>
          <textarea name="urls" rows={2} placeholder="Official website, datasheet link..." className="w-full p-3 rounded-md text-sm border"
            style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
        </div>

        <div>
          <label className="block text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>Your Email (optional)</label>
          <input type="email" name="email" placeholder="you@company.com" className="w-full p-3 rounded-md text-sm border"
            style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} />
        </div>

        <button type="submit" className="px-6 py-3 rounded-md text-sm font-medium transition-opacity hover:opacity-90"
          style={{ background: 'var(--color-accent-cta)', color: 'var(--color-accent-cta-text)' }}>
          Submit for Verification
        </button>

        <p className="text-xs" style={{ color: 'var(--color-text-dim)' }}>
          Your suggestion and optional contact email will be stored for review. Read how we handle this information in our{' '}
          <Link href="/privacy" className="underline">Privacy Policy</Link>.
        </p>
      </form>
    </div>
  )
}
