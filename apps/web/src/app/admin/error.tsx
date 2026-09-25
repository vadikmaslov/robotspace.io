/**
 * Admin error boundary — catches render errors
 */

'use client'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="p-8 text-center space-y-4">
      <h2 className="text-xl font-medium text-red-400">Something went wrong</h2>
      <p className="text-sm text-slate-500 max-w-md mx-auto">
        An error occurred while loading this admin page. Try refreshing or return to the dashboard.
      </p>
      <button
        onClick={() => reset()}
        className="px-4 py-2 text-sm rounded-md bg-slate-800 hover:bg-slate-700 transition-colors"
      >
        Try again
      </button>
      <div className="pt-4">
        <a href="/admin" className="text-sm text-blue-400 hover:underline">Back to Dashboard</a>
      </div>
    </div>
  )
}
