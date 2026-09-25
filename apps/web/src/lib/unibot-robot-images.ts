import { prisma } from '@robotspace/db'

/**
 * The Unibot cache is the preferred image source for a robot that is linked
 * to an Unibot catalogue item. Other RobotSpace images remain fallbacks.
 */
export async function getUnibotRobotImageMap(unibotIds: Array<string | null | undefined>) {
  const ids = [...new Set(unibotIds.filter((id): id is string => Boolean(id)))]
  if (!ids.length) return new Map<string, string>()
  const rows = await prisma.$queryRawUnsafe<Array<{ unibot_id: string; picture_url: string }>>(
    `SELECT DISTINCT ON (unibot_id) unibot_id, picture_url
     FROM unibot_catalog_cache
     WHERE entity_type = 'robot' AND unibot_id = ANY($1::varchar[])
       AND picture_url IS NOT NULL AND picture_url LIKE 'https://%'
     ORDER BY unibot_id, last_seen_at DESC`, ids,
  )
  return new Map(rows.map(row => [row.unibot_id, row.picture_url]))
}
