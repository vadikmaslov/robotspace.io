import { prisma } from '@robotspace/db'

export type EntitySourceLink = {
  id: string
  canonical_url: string
  external_id: string | null
  match_type: string
  match_confidence: number | string
  link_status: 'DISCOVERED' | 'CONFIRMED' | 'REJECTED'
  observed_fields: unknown
  first_seen_at: Date | string
  last_seen_at: Date | string
  source_key: string
  source_name: string | null
  source_status: string
  kill_switch: boolean
}

// This is intentionally queried only by admin routes/pages. Public projections
// do not include source URLs while the evidence and attribution UX is evolving.
export async function getEntitySourceLinks(entityId: string) {
  return prisma.$queryRawUnsafe<EntitySourceLink[]>(`
    SELECT l.id, l.canonical_url, l.external_id, l.match_type, l.match_confidence,
           l.link_status, l.observed_fields, l.first_seen_at, l.last_seen_at,
           s.key AS source_key, s.display_name AS source_name, s.status AS source_status, s.kill_switch
    FROM entity_source_links l
    INNER JOIN sources s ON s.key = l.source_id
    WHERE l.entity_id = $1::uuid
    ORDER BY l.last_seen_at DESC, l.created_at DESC
  `, entityId)
}
