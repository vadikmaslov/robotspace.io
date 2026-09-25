import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default function NotFound() {
  return (
    <div className="max-w-[var(--max-width-page)] mx-auto px-6 py-32">
      <div className="text-center space-y-6">
        <div className="font-mono text-[72px] text-text-dim font-[400]">404</div>
        <h1 className="font-inter text-[32px] text-text-heading font-[510] tracking-[-0.022em]">
          Page not found
        </h1>
        <p className="font-inter text-[14px] text-text-muted max-w-md mx-auto">
          This robot or company doesn't exist or hasn't been indexed yet. Data is being verified and added continuously.
        </p>
        <div className="pt-4">
          <Link href="/"
            className="inline-flex px-6 py-3 bg-accent-cta text-accent-cta-text rounded-[6px] text-[14px] font-[510] hover:opacity-90 transition-opacity">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}
