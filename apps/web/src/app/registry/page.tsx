import Link from 'next/link'
import { listRegistryProjects, registryFilterOptions, registryOrigins, registryPageSize, registryProjectTypes, type CleanRegistryFilters, type RegistryFilters } from '../../lib/registry-public'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const data = await listRegistryProjects({})
  return { title: 'Robot Software Registry', description: 'Verified software projects, SDKs, drivers, datasets and tools for robotics platforms.', robots: data.enabled ? undefined : { index: false, follow: false } }
}

function label(value: string) {
  return value.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function projectUrl(filters: CleanRegistryFilters, page: number) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) if (typeof value === 'string' && value && key !== 'page') query.set(key, value)
  if (page > 1) query.set('page', String(page))
  const suffix = query.toString()
  return suffix ? `/registry?${suffix}` : '/registry'
}

export default async function RegistryPage({ searchParams }: { searchParams: Promise<RegistryFilters> }) {
  const input = await searchParams
  const [data, options] = await Promise.all([listRegistryProjects(input), registryFilterOptions()])
  const totalPages = Math.max(1, Math.ceil(data.total / registryPageSize))

  return <div className="max-w-[1200px] mx-auto px-6 py-8">
    <div className="text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}><Link href="/" style={{ color: 'var(--color-text-muted)' }}>Home</Link><span className="mx-2">/</span><span>Registry</span></div>
    <div className="flex flex-wrap justify-between gap-5 items-end mb-7">
      <div><p className="text-xs uppercase tracking-[0.16em]" style={{ color: 'var(--color-accent-data)' }}>RobotSpace Registry</p><h1 className="text-[32px] font-medium tracking-tight mt-1" style={{ color: 'var(--color-text-heading)' }}>Robot software projects</h1><p className="text-sm mt-2 max-w-2xl" style={{ color: 'var(--color-text-muted)' }}>Verified SDKs, drivers, skills, datasets and tools, connected to the robots they support.</p></div>
      <span className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: 'var(--color-border-color)', color: 'var(--color-text-muted)' }}>{data.enabled ? `${data.total} verified project${data.total === 1 ? '' : 's'}` : 'Registry is preparing'}</span>
    </div>
    {!data.enabled ? <div className="rounded-xl border p-8 text-center" style={{ borderColor: 'var(--color-border-color)', background: 'var(--color-bg-card)' }}><h2 className="text-lg font-medium" style={{ color: 'var(--color-text-heading)' }}>Registry is being prepared</h2><p className="mt-2 text-sm max-w-lg mx-auto" style={{ color: 'var(--color-text-muted)' }}>Projects become visible only after their identity, ownership and robot compatibility are verified.</p></div> : <>
      <form action="/registry" method="GET" className="rounded-xl border p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 mb-6" style={{ borderColor: 'var(--color-border-color)', background: 'var(--color-bg-card)' }}>
        <label className="md:col-span-2 xl:col-span-1"><span className="sr-only">Search projects</span><input name="q" defaultValue={data.filters.q ?? ''} placeholder="Search projects..." className="w-full rounded-md border px-3 py-2.5 text-sm outline-none" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} /></label>
        <select name="type" defaultValue={data.filters.type ?? ''} aria-label="Project type" className="rounded-md border px-3 py-2.5 text-sm outline-none" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }}><option value="">All types</option>{registryProjectTypes.map((type) => <option key={type} value={type}>{label(type)}</option>)}</select>
        <select name="origin" defaultValue={data.filters.origin ?? ''} aria-label="Project status" className="rounded-md border px-3 py-2.5 text-sm outline-none" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }}><option value="">Official and community</option>{registryOrigins.map((origin) => <option key={origin} value={origin}>{label(origin)}</option>)}</select>
        <select name="license" defaultValue={data.filters.license ?? ''} aria-label="License" className="rounded-md border px-3 py-2.5 text-sm outline-none" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }}><option value="">All licenses</option>{options.licenses.map((license) => <option key={license} value={license}>{license}</option>)}</select>
        <select name="robot" defaultValue={data.filters.robot ?? ''} aria-label="Compatible robot" className="rounded-md border px-3 py-2.5 text-sm outline-none" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }}><option value="">All robots</option>{options.robots.map((robot) => <option key={robot.slug} value={robot.slug}>{robot.name}</option>)}</select>
        <div className="xl:col-span-5 flex gap-2"><button className="rounded-md px-4 py-2 text-sm font-medium" style={{ background: 'var(--color-accent-cta)', color: 'var(--color-accent-cta-text)' }}>Apply filters</button><Link href="/registry" className="rounded-md border px-4 py-2 text-sm" style={{ borderColor: 'var(--color-border-color)', color: 'var(--color-text-muted)' }}>Clear</Link></div>
      </form>
      {data.projects.length === 0 ? <div className="rounded-xl border p-8 text-center" style={{ borderColor: 'var(--color-border-color)' }}><h2 className="font-medium" style={{ color: 'var(--color-text-heading)' }}>No verified projects match these filters</h2><p className="text-sm mt-2" style={{ color: 'var(--color-text-muted)' }}>Try a broader search or clear the filters.</p></div> : <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{data.projects.map((project) => <Link key={project.id} href={`/projects/${project.slug}`} className="rounded-xl border p-5 transition-colors hover:bg-[var(--color-bg-elevated)]" style={{ borderColor: 'var(--color-border-color)', background: 'var(--color-bg-card)' }}><div className="flex justify-between gap-3 items-start"><span className="text-xs uppercase tracking-wider" style={{ color: project.originStatus === 'OFFICIAL' ? 'var(--color-accent-data)' : 'var(--color-text-dim)' }}>{label(project.originStatus)}</span><span className="text-xs rounded-full border px-2 py-0.5" style={{ borderColor: 'var(--color-border-color)', color: 'var(--color-text-muted)' }}>{label(project.projectType)}</span></div><h2 className="mt-4 text-lg font-medium" style={{ color: 'var(--color-text-heading)' }}>{project.name}</h2><p className="mt-2 text-sm line-clamp-3 min-h-[60px]" style={{ color: 'var(--color-text-muted)' }}>{project.description || 'Verified robotics software project.'}</p><div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--color-text-dim)' }}><span>{project.robotCount} compatible robot{project.robotCount === 1 ? '' : 's'}</span>{project.license && <span>{project.license}</span>}{project.latestRelease && <span>Release {project.latestRelease}</span>}</div></Link>)}</div>}
      {totalPages > 1 && <nav className="mt-7 flex items-center justify-between text-sm" aria-label="Registry pagination">{data.filters.page > 1 ? <Link href={projectUrl(data.filters, data.filters.page - 1)} className="rounded-md border px-3 py-2" style={{ borderColor: 'var(--color-border-color)' }}>&larr; Previous</Link> : <span />}<span style={{ color: 'var(--color-text-muted)' }}>Page {data.filters.page} of {totalPages}</span>{data.filters.page < totalPages ? <Link href={projectUrl(data.filters, data.filters.page + 1)} className="rounded-md border px-3 py-2" style={{ borderColor: 'var(--color-border-color)' }}>Next &rarr;</Link> : <span />}</nav>}
    </>}
  </div>
}
