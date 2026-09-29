import type { Metadata } from 'next'
import Link from 'next/link'
import Script from 'next/script'
import { notFound } from 'next/navigation'
import { getRegistryProject } from '../../../lib/registry-public'
import { auth } from '../../../auth'
import { prisma } from '@robotspace/db'
import { CompatibilityCard } from './compatibility-card'
import { RepositoryLink } from './repository-link'

export const dynamic = 'force-dynamic'

function date(value: Date | null) {
  return value ? new Date(value).toISOString().slice(0, 10) : null
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const data = await getRegistryProject((await params).slug)
  if (!data.enabled || !data.project) return { title: 'Project Registry', robots: { index: false, follow: false } }
  return { title: data.project.name, description: data.project.description ?? `Verified ${data.project.projectType} project for robotics platforms.`, alternates: { canonical: `/projects/${data.project.slug}` } }
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const data = await getRegistryProject((await params).slug)
  if (!data.enabled) return <div className="max-w-[900px] mx-auto px-6 py-16 text-center"><h1 className="text-2xl font-medium" style={{ color: 'var(--color-text-heading)' }}>Registry is being prepared</h1></div>
  if (!data.project) notFound()
  const project = data.project
  const session = await auth()
  const userId = session?.user?.sessionKind === 'registry' ? session.user.registryUserId : null
  const isOwner = userId ? Boolean(await prisma.entity_claims.findFirst({ where: { entity_id: project.entityId, claimant_id: userId, status: 'VERIFIED' }, select: { id: true } })) : false
  const schema = { '@context': 'https://schema.org', '@type': 'SoftwareSourceCode', name: project.name, description: project.description ?? undefined, codeRepository: project.repositoryUrl ?? undefined, license: project.license ?? undefined, applicationCategory: project.projectType }

  return <div className="max-w-[1100px] mx-auto px-6 py-8">
    <Script id="project-structured-data" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }} />
    <div className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}><Link href="/registry">Registry</Link><span className="mx-2">/</span><span>{project.name}</span></div>
    <section className="rounded-xl border p-6 md:p-8" style={{ borderColor: 'var(--color-border-color)', background: 'var(--color-bg-card)' }}>
      <div className="flex flex-wrap gap-2 mb-4"><span className="rounded-full border px-2.5 py-1 text-xs" style={{ borderColor: 'var(--color-border-color)', color: project.originStatus === 'OFFICIAL' ? 'var(--color-accent-data)' : 'var(--color-text-muted)' }}>{project.originStatus === 'OFFICIAL' ? 'Official' : 'Community project'}</span><span className="rounded-full border px-2.5 py-1 text-xs" style={{ borderColor: 'var(--color-border-color)', color: 'var(--color-text-muted)' }}>{project.projectType}</span><span className="rounded-full px-2.5 py-1 text-xs" style={{ background: 'rgba(52, 213, 154, 0.12)', color: 'var(--color-accent-data)' }}>Verified</span></div>
      <h1 className="text-3xl md:text-4xl font-semibold tracking-tight" style={{ color: 'var(--color-text-heading)' }}>{project.name}</h1><p className="mt-4 max-w-3xl leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>{project.description ?? 'Verified robotics software project.'}</p>
      <div className="mt-6 flex flex-wrap gap-3">{project.repositoryUrl && <RepositoryLink href={project.repositoryUrl} />}{project.homepageUrl && <a href={project.homepageUrl} target="_blank" rel="noopener noreferrer" className="rounded-md border px-4 py-2 text-sm" style={{ borderColor: 'var(--color-border-color)', color: 'var(--color-text-body)' }}>Project website &rarr;</a>}{project.repositoryUrl && <Link href={`/claim?project=${encodeURIComponent(project.slug)}`} className="rounded-md border px-4 py-2 text-sm" style={{ borderColor: 'var(--color-border-color)', color: 'var(--color-text-body)' }}>Claim project</Link>}{isOwner && <Link href={`/projects/${project.slug}/manage`} className="rounded-md border px-4 py-2 text-sm">Manage project</Link>}<Link href={`/corrections/new?entity=${project.slug}`} className="rounded-md border px-4 py-2 text-sm">Submit correction</Link></div>
    </section>
    <div className="grid lg:grid-cols-[1.6fr_1fr] gap-5 mt-5">
      <section className="rounded-xl border p-6" style={{ borderColor: 'var(--color-border-color)', background: 'var(--color-bg-card)' }}><h2 className="text-xl font-medium" style={{ color: 'var(--color-text-heading)' }}>Verified compatibility</h2>{project.compatibility.length === 0 ? <p className="mt-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>No robot compatibility is published yet.</p> : <div className="mt-4 space-y-3">{project.compatibility.map((item) => <CompatibilityCard key={item.id} item={item} />)}</div>}</section>
      <div className="space-y-5"><section className="rounded-xl border p-5" style={{ borderColor: 'var(--color-border-color)', background: 'var(--color-bg-card)' }}><h2 className="font-medium" style={{ color: 'var(--color-text-heading)' }}>Project details</h2><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-3"><dt style={{ color: 'var(--color-text-muted)' }}>Ecosystem</dt><dd>{project.ecosystem}</dd></div>{project.license && <div className="flex justify-between gap-3"><dt style={{ color: 'var(--color-text-muted)' }}>License</dt><dd>{project.license}</dd></div>}{project.latestRelease && <div className="flex justify-between gap-3"><dt style={{ color: 'var(--color-text-muted)' }}>Latest release</dt><dd>{project.latestRelease}</dd></div>}{project.lastCommitAt && <div className="flex justify-between gap-3"><dt style={{ color: 'var(--color-text-muted)' }}>Last activity</dt><dd>{date(project.lastCommitAt)}</dd></div>}{project.repositorySync.checkedAt && <div className="flex justify-between gap-3"><dt style={{ color: 'var(--color-text-muted)' }}>GitHub checked</dt><dd>{date(project.repositorySync.checkedAt)}</dd></div>}{project.verifiedAt && <div className="flex justify-between gap-3"><dt style={{ color: 'var(--color-text-muted)' }}>Project verified</dt><dd>{date(project.verifiedAt)}</dd></div>}</dl>{project.repositorySync.status && project.repositorySync.status !== 'OK' && <p className="mt-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>GitHub is temporarily unavailable. Previously verified repository data remains visible.</p>}</section><section className="rounded-xl border p-5" style={{ borderColor: 'var(--color-border-color)', background: 'var(--color-bg-card)' }}><h2 className="font-medium" style={{ color: 'var(--color-text-heading)' }}>Verified owners</h2>{project.owners.length ? <ul className="mt-3 space-y-2 text-sm">{project.owners.map((owner) => <li key={owner.handle}><Link href={`/developers/${owner.handle}`} className="underline">{owner.displayName ?? owner.handle}</Link> <span style={{ color: 'var(--color-text-dim)' }}>@{owner.handle}</span></li>)}</ul> : <p className="mt-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>No verified owner is published yet.</p>}</section></div>
    </div>
    {project.releases.length > 0 && <section className="mt-5 rounded-xl border p-6" style={{ borderColor: 'var(--color-border-color)', background: 'var(--color-bg-card)' }}><h2 className="text-xl font-medium" style={{ color: 'var(--color-text-heading)' }}>Releases</h2><div className="mt-4 divide-y" style={{ borderColor: 'var(--color-border-color)' }}>{project.releases.map((release) => <div key={release.version} className="py-3 flex justify-between text-sm"><span>{release.version}{release.tag && <span style={{ color: 'var(--color-text-dim)' }}> · {release.tag}</span>}</span><span style={{ color: 'var(--color-text-muted)' }}>{date(release.releasedAt) ?? release.supportStatus}</span></div>)}</div></section>}
  </div>
}
