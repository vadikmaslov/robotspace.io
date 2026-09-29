import { prisma } from '@robotspace/db'
import { auth } from '../../../auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requestEmailStatuses, requestIdPattern } from '../../../lib/request-email-status'

export const dynamic = 'force-dynamic'

export default async function AdminQuotesPage({ searchParams }: { searchParams: Promise<{ page?: string; id?: string }> }) {
  if ((await auth())?.user?.sessionKind !== 'admin') redirect('/admin/login')
  const params = await searchParams
  const page = Math.min(10000, Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1))
  const requests = await prisma.quote_requests.findMany({
    where: params.id ? { id: requestIdPattern.test(params.id) ? params.id : '00000000-0000-0000-0000-000000000000' } : undefined,
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }], take: 51, skip: (page - 1) * 50,
    select: { id: true, contact_name: true, email: true, company_name: true, message: true, created_at: true, notification_sent: true },
  })
  const deliveries = await requestEmailStatuses(requests.slice(0, 50).map(request => request.id))
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text-heading)' }}>Quotes</h1>
      <p style={{ color: 'var(--color-text-dim)' }}>Requests are saved even when email is unavailable. New notifications are retried automatically. Older requests are not emailed again.</p>
      {params.id && <Link href="/admin/quotes">All requests</Link>}
      {requests.length === 0 && <p>No requests on this page.</p>}
      {requests.slice(0, 50).map(request => <article key={request.id} className="rounded-lg border p-4 space-y-2 break-words" style={{ borderColor: 'var(--color-border-color)' }}>
        <h2 className="font-semibold">{request.contact_name} {request.company_name ? `(${request.company_name})` : ''}</h2>
        <p>{request.email}</p>
        <p className="text-sm">{request.created_at.toISOString()} · {deliveries.get(request.id) ?? (request.notification_sent ? 'Legacy email marked as sent' : 'Legacy request: email delivery unknown')}</p>
        <p className="text-xs">ID: {request.id}</p>
        <p className="whitespace-pre-wrap">{request.message}</p>
      </article>)}
      <nav className="flex justify-between" aria-label="Requests pagination">
        {page > 1 ? <Link href={`/admin/quotes?page=${page - 1}`}>Previous</Link> : <span />}
        {requests.length > 50 && <Link href={`/admin/quotes?page=${page + 1}`}>Next</Link>}
      </nav>
    </div>
  )
}
