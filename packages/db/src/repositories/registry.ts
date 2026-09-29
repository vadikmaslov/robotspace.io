import { randomUUID } from 'node:crypto'
import type { PrismaClient, Prisma } from '@prisma/client'

type Tx = Prisma.TransactionClient
type GraphClient = PrismaClient | Tx
export type RegistryFlag = 'registry.read' | 'registry.write' | 'registry.claims' | 'registry.sync'

// Explicit dependency injection: these repositories don't create a connection at import time.
export function registryRepository(db: PrismaClient) {
  async function enabled(client: GraphClient, key: RegistryFlag, environment: string) {
    const flags = await client.feature_flags.findMany({ where: { key, environment: { in: [environment, 'all'] } } })
    return (flags.find(f => f.environment === environment) ?? flags.find(f => f.environment === 'all'))?.enabled === true
  }
  async function writable(tx: Tx, userId: string, environment: string) {
    if (!await enabled(tx, 'registry.write', environment)) throw new Error('Registry writes disabled')
    const user = await tx.registry_users.findUnique({ where: { id: userId } })
    if (user?.status !== 'ACTIVE') throw new Error('Active Registry user required')
  }
  return {
    enabled: (key: RegistryFlag, environment = 'production') => enabled(db, key, environment),
    async findPublishedProject(slug: string, environment = 'production') {
      if (!await enabled(db, 'registry.read', environment)) return null
      const entity = await db.entities.findFirst({ where: { slug, entity_type: 'PROJECT', publication_status: 'PUBLISHED', archived_at: null } })
      if (!entity) return null
      return db.software_packages.findUnique({ where: { entity_id: entity.id } })
    },
    async createProject(input: { userId: string; slug: string; name: string; repositoryUrl: string; environment?: string }) {
      if (!/^[a-z0-9][a-z0-9-]{0,254}$/.test(input.slug)) throw new Error('Invalid stable slug')
      if (!input.name.trim() || input.name.length > 255) throw new Error('Invalid project name')
      const url = new URL(input.repositoryUrl)
      if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || url.port ||
          !/^\/[\w.-]+\/[\w.-]+\/?$/.test(url.pathname) || url.search || url.hash) throw new Error('Public GitHub repository URL required')
      const repositoryUrl = 'https://github.com' + url.pathname.replace(/\/$/, '').replace(/\.git$/, '').toLowerCase()
      return db.$transaction(async tx => {
        await writable(tx, input.userId, input.environment ?? 'production')
        const id = randomUUID()
        await tx.entities.create({ data: { id, entity_type: 'PROJECT', slug: input.slug } })
        const project = await tx.software_packages.create({ data: {
          id, entity_id: id, canonical_name: input.name.trim(), ecosystem: 'OTHER', repository_url: repositoryUrl,
        } })
        await tx.registry_changes.create({ data: { entity_id: id, actor_id: input.userId, action: 'PROJECT_CREATED',
          after_value: { name: project.canonical_name, repositoryUrl } } })
        return project
      })
    },
    async proposeCompatibility(input: { userId: string; projectId: string; robotId: string;
      projectVersion?: string; robotVersion?: string; evidenceUrl: string; environment?: string }) {
      const url = new URL(input.evidenceUrl)
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('HTTPS evidence URL required')
      return db.$transaction(async tx => {
        await writable(tx, input.userId, input.environment ?? 'production')
        const project = await tx.software_packages.findUnique({ where: { id: input.projectId } })
        if (!project?.entity_id) throw new Error('Registry project required')
        const owner = await tx.entity_claims.findFirst({ where: { entity_id: project.entity_id, claimant_id: input.userId, status: 'VERIFIED' }, select: { id: true } })
        if (!owner) throw new Error('Verified project ownership required')
        const robot = await tx.entities.findFirst({ where: { id: input.robotId, entity_type: 'ROBOT', publication_status: 'PUBLISHED', archived_at: null }, select: { id: true } })
        if (!robot) throw new Error('Published robot required')
        const compatibility = await tx.compatibility_claims.create({ data: {
          project_id: input.projectId, robot_id: input.robotId, subject_type: 'PROJECT', subject_entity_id: input.projectId,
          object_type: 'ROBOT', object_entity_id: input.robotId, type: 'SOFTWARE', claim_status: 'DISCOVERED',
          subject_version_range: input.projectVersion, object_version_range: input.robotVersion, created_by: input.userId,
        } })
        const evidence = await tx.registry_evidence.create({ data: {
          compatibility_id: compatibility.id, submitted_by: input.userId, url: url.href, kind: 'COMMUNITY',
        } })
        const suggested = await tx.compatibility_claims.update({ where: { id: compatibility.id }, data: { claim_status: 'SUGGESTED' } })
        await tx.registry_changes.create({ data: { compatibility_id: compatibility.id, actor_id: input.userId,
          evidence_id: evidence.id, action: 'COMPATIBILITY_SUGGESTED', after_value: { status: 'SUGGESTED' } } })
        return suggested
      })
    },
    async verifiedOwners(entityId: string, environment = 'production') {
      if (!await enabled(db, 'registry.read', environment)) return []
      const claims = await db.entity_claims.findMany({ where: { entity_id: entityId, status: 'VERIFIED' },
        select: { claimant_id: true, checked_at: true } })
      const active = await db.registry_users.findMany({ where: { id: { in: claims.map(c => c.claimant_id) }, status: 'ACTIVE' }, select: { id: true } })
      return claims.filter(c => active.some(u => u.id === c.claimant_id))
    },
  }
}
