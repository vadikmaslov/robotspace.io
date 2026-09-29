import { prisma } from '@robotspace/db'

/** Projection existence alone does not authorize publication. */
export async function publicRobotWhere() {
  const rows = await prisma.entities.findMany({ where: { entity_type: 'ROBOT', publication_status: 'PUBLISHED', archived_at: null }, select: { id: true } })
  return { lifecycle_status: 'ACTIVE', robot_entity_id: { in: rows.map(row => row.id) } }
}
export async function publicCompanyEntities() {
  return prisma.entities.findMany({ where: { entity_type: 'COMPANY', publication_status: 'PUBLISHED', archived_at: null }, select: { id: true, slug: true } })
}
