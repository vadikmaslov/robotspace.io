import type { MetadataRoute } from 'next'
import { prisma } from '@robotspace/db'
import { registryReadEnabled, registrySitemapProjects } from '../lib/registry-public'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://robotspace.io'

// The sitemap changes as publication status changes; it must not query the DB
// during an image build, where production credentials are intentionally absent.
export const dynamic = 'force-dynamic'
const slug = (value: string) => value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
type PublicEntity = { canonical_name: string; last_verified_at: Date | null }
type PublishedArticle = { title: string; published_at: Date }

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const registryEnabled = await registryReadEnabled()
  const staticPaths = ['', '/robots', '/companies', '/compare', '/insights', '/market', '/integrators', '/submit', '/quote', '/privacy', '/methodology']
  if (registryEnabled) staticPaths.push('/registry')
  const staticRoutes = staticPaths.map((path) => ({ url: `${siteUrl}${path}`, lastModified: new Date() }))
  try {
    const [robots, companies, articles, projects] = await Promise.all([
      prisma.$queryRaw<PublicEntity[]>`
        SELECT projection.canonical_name, projection.last_verified_at
        FROM robot_public_projections AS projection
        JOIN entities AS entity ON entity.id = projection.robot_entity_id
        WHERE entity.publication_status = 'PUBLISHED'
          AND entity.archived_at IS NULL
          AND projection.lifecycle_status <> 'ARCHIVED'
        LIMIT 50000`,
      prisma.$queryRaw<PublicEntity[]>`
        SELECT projection.canonical_name, projection.last_verified_at
        FROM company_public_projections AS projection
        JOIN entities AS entity ON entity.id = projection.company_entity_id
        WHERE entity.publication_status = 'PUBLISHED'
          AND entity.archived_at IS NULL
          AND projection.status = 'ACTIVE'
        LIMIT 50000`,
      prisma.$queryRaw<PublishedArticle[]>`SELECT title, published_at FROM articles WHERE published_at IS NOT NULL LIMIT 50000`,
      registrySitemapProjects(),
    ])
    return [...staticRoutes, ...robots.map((item) => ({ url: `${siteUrl}/robots/${slug(item.canonical_name)}`, lastModified: item.last_verified_at ?? undefined })), ...companies.map((item) => ({ url: `${siteUrl}/companies/${slug(item.canonical_name)}`, lastModified: item.last_verified_at ?? undefined })), ...articles.map((item) => ({ url: `${siteUrl}/insights/${slug(item.title)}`, lastModified: item.published_at })), ...projects.map((item) => ({ url: `${siteUrl}/projects/${item.slug}`, lastModified: item.updatedAt }))]
  } catch { return staticRoutes }
}
