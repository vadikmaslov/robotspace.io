import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '../../auth'
import { prisma } from '@robotspace/db'
import { markNotificationRead } from '../registry/actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Registry notifications', robots: { index: false, follow: false } }
export default async function NotificationsPage() {
  const session = await auth()
  const userId = session?.user?.sessionKind === 'registry' ? session.user.registryUserId : null
  if (!userId) redirect('/registry')
  const notifications = await prisma.registry_notifications.findMany({ where: { user_id: userId }, orderBy: { created_at: 'desc' }, take: 50 })
  return <main className="max-w-[720px] mx-auto px-6 py-12 space-y-6"><Link href="/registry" className="text-sm underline">Registry</Link><h1 className="text-3xl font-semibold">Notifications</h1>{notifications.length ? <ul className="space-y-3">{notifications.map(item => <li key={item.id} className="rounded-lg border p-4"><p>{item.message}</p><p className="mt-2 text-xs">{item.created_at.toISOString().slice(0, 10)} · {item.read_at ? 'Read' : 'Unread'}</p>{!item.read_at && <form action={markNotificationRead} className="mt-3"><input type="hidden" name="notification" value={item.id} /><button className="text-sm underline">Mark as read</button></form>}</li>)}</ul> : <p>No moderation results yet.</p>}</main>
}
