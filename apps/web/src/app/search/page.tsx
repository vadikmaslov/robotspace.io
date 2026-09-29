import type { Metadata } from 'next'
import Link from 'next/link'
import { robotUrl } from '../../lib/public-urls'
import { cleanSearchQuery, searchPublicEntities } from '../../lib/unified-search'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Search RobotSpace',
  description: 'Find published robots, robotics companies, verified software projects and developer profiles.',
  alternates: { canonical: '/search' },
}

type SearchParams = { q?: string }

// Robot detail routes use the normalized public model name, as does /robots.

function ResultSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border p-5" style={{ borderColor: 'var(--color-border-color)', background: 'var(--color-bg-card)' }}>
    <h2 className="text-lg font-medium" style={{ color: 'var(--color-text-heading)' }}>{title}</h2>
    <div className="mt-3 divide-y" style={{ borderColor: 'var(--color-border-color)' }}>{children}</div>
  </section>
}

function Empty() {
  return <p className="py-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>No matching published records.</p>
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { q } = await searchParams
  const { query, results } = await searchPublicEntities(q)
  const searched = Boolean(cleanSearchQuery(q))
  const count = results.robots.length + results.companies.length + results.projects.length + results.developers.length

  return <main className="max-w-[1100px] mx-auto px-6 py-8">
    <div className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}><Link href="/">Home</Link><span className="mx-2">/</span><span>Search</span></div>
    <h1 className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--color-text-heading)' }}>Search RobotSpace</h1>
    <p className="mt-2 max-w-2xl text-sm" style={{ color: 'var(--color-text-muted)' }}>One place for published robots, companies, verified software projects and developer profiles. Results stay separated by type.</p>
    <form action="/search" method="GET" className="mt-6 flex gap-2 max-w-2xl">
      <label className="flex-1"><span className="sr-only">Search RobotSpace</span><input name="q" defaultValue={query} autoFocus className="w-full rounded-md border px-3 py-2.5 text-sm outline-none" placeholder="Robot, company, project or developer" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} /></label>
      <button className="rounded-md px-4 py-2.5 text-sm font-medium" style={{ background: 'var(--color-accent-cta)', color: 'var(--color-accent-cta-text)' }}>Search</button>
    </form>
    {!searched ? <div className="mt-8 rounded-xl border p-8 text-center" style={{ borderColor: 'var(--color-border-color)' }}>Enter a name, model, project or GitHub handle to search the public directory.</div> : <>
      <p className="mt-5 text-sm" style={{ color: 'var(--color-text-muted)' }}>{count ? `${count} matching record${count === 1 ? '' : 's'} for “${query}”` : `No published records found for “${query}”.`}</p>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <ResultSection title="Robots">{results.robots.length ? results.robots.map(item => <Link key={item.slug} href={robotUrl(item.name)} className="block py-3 hover:underline"><span className="block font-medium" style={{ color: 'var(--color-text-heading)' }}>{item.name}</span>{item.summary && <span className="mt-1 block text-sm line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>{item.summary}</span>}</Link>) : <Empty />}</ResultSection>
        <ResultSection title="Companies">{results.companies.length ? results.companies.map(item => <Link key={item.slug} href={`/companies/${item.slug}`} className="block py-3 hover:underline"><span className="block font-medium" style={{ color: 'var(--color-text-heading)' }}>{item.name}</span>{item.summary && <span className="mt-1 block text-sm line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>{item.summary}</span>}</Link>) : <Empty />}</ResultSection>
        <ResultSection title="Verified software projects">{results.projects.length ? results.projects.map(item => <Link key={item.slug} href={`/projects/${item.slug}`} className="block py-3 hover:underline"><span className="block font-medium" style={{ color: 'var(--color-text-heading)' }}>{item.name}</span><span className="mt-1 block text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-dim)' }}>{item.projectType}</span>{item.description && <span className="mt-1 block text-sm line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>{item.description}</span>}</Link>) : <Empty />}</ResultSection>
        <ResultSection title="Developers">{results.developers.length ? results.developers.map(item => <Link key={item.handle} href={`/developers/${item.handle}`} className="block py-3 hover:underline"><span className="block font-medium" style={{ color: 'var(--color-text-heading)' }}>{item.displayName ?? item.handle}</span><span className="block text-sm" style={{ color: 'var(--color-text-dim)' }}>@{item.handle}</span>{item.bio && <span className="mt-1 block text-sm line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>{item.bio}</span>}</Link>) : <Empty />}</ResultSection>
      </div>
    </>}
  </main>
}
