import type { Metadata } from 'next'
import Link from 'next/link'
import { Prisma, prisma } from '@robotspace/db'
import { cleanSearchQuery } from '../../lib/unified-search'
import { registryReadEnabled } from '../../lib/registry-public'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Robotics Developers',
  description: 'Public profiles of developers with verified robotics software projects and contributions.',
  alternates: { canonical: '/developers' },
}

type Developer = { handle: string; displayName: string | null; bio: string | null; reputation: number }

export default async function DevelopersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const query = cleanSearchQuery((await searchParams).q)
  let developers: Developer[] = []
  if (await registryReadEnabled()) {
    try {
      const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`
      developers = await prisma.$queryRaw<Developer[]>(Prisma.sql`
        SELECT profile.handle, profile.display_name AS "displayName", profile.bio, profile.reputation
        FROM developer_profiles AS profile
        JOIN entities AS entity ON entity.id = profile.entity_id
        JOIN registry_users AS registry_user ON registry_user.id = profile.user_id
        WHERE entity.entity_type = 'DEVELOPER' AND entity.publication_status = 'PUBLISHED'
          AND entity.archived_at IS NULL AND registry_user.status = 'ACTIVE'
          AND (${query === ''} OR profile.handle ILIKE ${pattern} ESCAPE '\\' OR profile.display_name ILIKE ${pattern} ESCAPE '\\')
        ORDER BY profile.handle ASC LIMIT 100`)
    } catch {}
  }
  return <main className="max-w-[1000px] mx-auto px-6 py-8"><div className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}><Link href="/registry">Registry</Link><span className="mx-2">/</span><span>Developers</span></div><h1 className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--color-text-heading)' }}>Robotics developers</h1><p className="mt-2 text-sm max-w-2xl" style={{ color: 'var(--color-text-muted)' }}>Public profiles are shown only for active contributors with a published profile.</p><form action="/developers" method="GET" className="mt-5 flex max-w-xl gap-2"><label className="flex-1"><span className="sr-only">Search developers</span><input name="q" defaultValue={query} placeholder="Search by name or handle" className="w-full rounded-md border px-3 py-2.5 text-sm outline-none" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} /></label><button className="rounded-md px-4 py-2.5 text-sm font-medium" style={{ background: 'var(--color-accent-cta)', color: 'var(--color-accent-cta-text)' }}>Search</button></form><div className="mt-6 grid gap-4 md:grid-cols-2">{developers.length ? developers.map(developer => <Link key={developer.handle} href={`/developers/${developer.handle}`} className="rounded-xl border p-5 hover:bg-[var(--color-hover-bg)]" style={{ borderColor: 'var(--color-border-color)', background: 'var(--color-bg-card)' }}><h2 className="font-medium" style={{ color: 'var(--color-text-heading)' }}>{developer.displayName ?? developer.handle}</h2><p className="mt-1 text-sm" style={{ color: 'var(--color-text-dim)' }}>@{developer.handle}</p>{developer.bio && <p className="mt-3 text-sm line-clamp-3" style={{ color: 'var(--color-text-muted)' }}>{developer.bio}</p>}</Link>) : <p className="md:col-span-2 rounded-xl border p-8 text-center text-sm" style={{ borderColor: 'var(--color-border-color)', color: 'var(--color-text-muted)' }}>No public developer profiles match this search.</p>}</div></main>
}
