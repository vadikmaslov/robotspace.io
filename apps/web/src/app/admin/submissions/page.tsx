import { prisma } from '@robotspace/db'
import { auth } from '../../../auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requestEmailStatuses, requestIdPattern } from '../../../lib/request-email-status'

export const dynamic = 'force-dynamic'

export default async function AdminSubmissionsPage({ searchParams }: { searchParams: Promise<{ page?: string; id?: string }> }) {
  if ((await auth())?.user?.sessionKind !== 'admin') redirect('/admin/login')
  const params = await searchParams
  const page = Math.min(10000, Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1))
  const submissions = await prisma.submissions.findMany({
    where: params.id ? { id: requestIdPattern.test(params.id) ? params.id : '00000000-0000-0000-0000-000000000000' } : undefined,
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }], take: 51, skip: (page - 1) * 50,
    select: { id: true, type: true, payload_json: true, submitter_email: true, source_urls: true, status: true, created_at: true },
  })
  const deliveries = await requestEmailStatuses(submissions.slice(0, 50).map(request => request.id))
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text-heading)' }}>Submissions</h1>
      <p>Saved user suggestions, not automatically published. Email failures do not remove requests. Older submissions are not emailed again.</p>
      {params.id && <Link href="/admin/submissions">All submissions</Link>}
      {submissions.length === 0 && <p>No submissions on this page.</p>}
      {submissions.slice(0, 50).map(request => <article key={request.id} className="rounded-lg border p-4 space-y-2 break-words" style={{ borderColor: 'var(--color-border-color)' }}>
        <h2 className="font-semibold">{request.type} · {request.status}</h2>
        <p>{request.submitter_email || 'No email provided'}</p>
        <p className="text-sm">{request.created_at.toISOString()} · {deliveries.get(request.id) ?? 'Legacy submission: email delivery unknown'}</p>
        <p className="text-xs">ID: {request.id}</p>
        <pre className="whitespace-pre-wrap break-words text-sm">{JSON.stringify(request.payload_json, null, 2)}</pre>
        <p className="text-sm">Sources: {Array.isArray(request.source_urls) ? request.source_urls.filter(url => typeof url === 'string').join(', ') : 'None'}</p>
      </article>)}
      <nav className="flex justify-between" aria-label="Submissions pagination">
        {page > 1 ? <Link href={`/admin/submissions?page=${page - 1}`}>Previous</Link> : <span />}
        {submissions.length > 50 && <Link href={`/admin/submissions?page=${page + 1}`}>Next</Link>}
      </nav>
    </div>
  )
}
