import { notFound } from 'next/navigation'
import { prisma } from '@robotspace/db'
import { isSourceKey, type SourceCatalogRecord } from '../../../../lib/source-catalog'
import { SourceEditor } from '../source-editor'

export const dynamic = 'force-dynamic'

export default async function SourcePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  if (!isSourceKey(key)) notFound()
  const rows = await prisma.$queryRawUnsafe<SourceCatalogRecord[]>(`
    SELECT key, display_name, owner_name, homepage_url, logo_url, content_area, admin_description,
           public_description, is_public, tier, source_type, status, legal_status, schedule,
           rate_limit_rpm, trust_default_confidence, kill_switch, last_success_at, last_error_at
    FROM sources WHERE key = $1
  `, key)
  if (!rows[0]) notFound()
  return <SourceEditor source={rows[0]} />
}
