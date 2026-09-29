import { Prisma, prisma } from '@robotspace/db'
import { registryReadEnabled } from './registry-public'

export type UnifiedSearchResult = {
  robots: Array<{ name: string; slug: string; summary: string | null }>
  companies: Array<{ name: string; slug: string; summary: string | null }>
  projects: Array<{ name: string; slug: string; description: string | null; projectType: string }>
  developers: Array<{ handle: string; displayName: string | null; bio: string | null }>
}

const empty: UnifiedSearchResult = { robots: [], companies: [], projects: [], developers: [] }

export function cleanSearchQuery(value: string | undefined) {
  return (value ?? '').trim().replace(/\s+/g, ' ').slice(0, 120)
}

/**
 * Search only the public projections and verified Registry records. Results are
 * deliberately grouped by entity type so matching a word never implies a
 * cross-type relevance score or an endorsement.
 */
export async function searchPublicEntities(input: string | undefined): Promise<{ query: string; results: UnifiedSearchResult }> {
  const query = cleanSearchQuery(input)
  if (!query) return { query, results: empty }
  const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`

  try {
    const registryEnabled = await registryReadEnabled()
    const [robots, companies, projects, developers] = await Promise.all([
      prisma.$queryRaw<UnifiedSearchResult['robots']>(Prisma.sql`
        SELECT projection.canonical_name AS name, entity.slug, projection.summary
        FROM robot_public_projections AS projection
        JOIN entities AS entity ON entity.id = projection.robot_entity_id
        WHERE entity.entity_type = 'ROBOT' AND entity.publication_status = 'PUBLISHED'
          AND entity.archived_at IS NULL AND projection.lifecycle_status = 'ACTIVE'
          AND projection.canonical_name ILIKE ${pattern} ESCAPE '\\'
        ORDER BY projection.canonical_name ASC LIMIT 8`),
      prisma.$queryRaw<UnifiedSearchResult['companies']>(Prisma.sql`
        SELECT projection.canonical_name AS name, entity.slug, projection.summary
        FROM company_public_projections AS projection
        JOIN entities AS entity ON entity.id = projection.company_entity_id
        WHERE entity.entity_type = 'COMPANY' AND entity.publication_status = 'PUBLISHED'
          AND entity.archived_at IS NULL AND projection.status = 'ACTIVE'
          AND projection.canonical_name ILIKE ${pattern} ESCAPE '\\'
        ORDER BY projection.canonical_name ASC LIMIT 8`),
      registryEnabled ? prisma.$queryRaw<UnifiedSearchResult['projects']>(Prisma.sql`
        SELECT project.canonical_name AS name, entity.slug, project.description,
          project.project_type AS "projectType"
        FROM software_packages AS project
        JOIN entities AS entity ON entity.id = project.entity_id
        WHERE entity.entity_type = 'PROJECT' AND entity.publication_status = 'PUBLISHED'
          AND entity.archived_at IS NULL AND project.verification_status = 'VERIFIED'
          AND project.canonical_name ILIKE ${pattern} ESCAPE '\\'
        ORDER BY project.canonical_name ASC LIMIT 8`) : Promise.resolve([]),
      registryEnabled ? prisma.$queryRaw<UnifiedSearchResult['developers']>(Prisma.sql`
        SELECT profile.handle, profile.display_name AS "displayName", profile.bio
        FROM developer_profiles AS profile
        JOIN entities AS entity ON entity.id = profile.entity_id
        JOIN registry_users AS registry_user ON registry_user.id = profile.user_id
        WHERE entity.entity_type = 'DEVELOPER' AND entity.publication_status = 'PUBLISHED'
          AND entity.archived_at IS NULL AND registry_user.status = 'ACTIVE'
          AND (profile.handle ILIKE ${pattern} ESCAPE '\\' OR profile.display_name ILIKE ${pattern} ESCAPE '\\')
        ORDER BY profile.handle ASC LIMIT 8`) : Promise.resolve([]),
    ])
    return { query, results: { robots, companies, projects, developers } }
  } catch {
    return { query, results: empty }
  }
}
