/**
 * Development-only fixtures for Registry page and route checks.
 * They use unmistakable fixture names and example.com URLs, and never run in production.
 */
import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'

type Fixture = {
  slug: string
  name: string
  type: 'navigation' | 'skill' | 'simulator'
  ecosystem: 'ROS' | 'GAZEBO'
  license: string
  robotSlug: string
  robotName: string
}

const fixtures: Fixture[] = [
  { slug: 'fixture-ros-navigation', name: 'Fixture ROS Navigation', type: 'navigation', ecosystem: 'ROS', license: 'Apache-2.0', robotSlug: 'fixture-mobile-robot', robotName: 'Fixture Mobile Robot' },
  { slug: 'fixture-voice-skill', name: 'Fixture Voice Skill', type: 'skill', ecosystem: 'ROS', license: 'MIT', robotSlug: 'fixture-service-robot', robotName: 'Fixture Service Robot' },
  { slug: 'fixture-simulator', name: 'Fixture Simulator', type: 'simulator', ecosystem: 'GAZEBO', license: 'BSD-3-Clause', robotSlug: 'fixture-mobile-robot', robotName: 'Fixture Mobile Robot' },
]

async function ensureRobot(db: PrismaClient, slug: string, name: string) {
  let entity = await db.entities.findUnique({ where: { slug } })
  if (!entity) {
    const id = randomUUID()
    entity = await db.entities.create({ data: { id, entity_type: 'ROBOT', slug, publication_status: 'PUBLISHED' } })
    await db.robots.create({ data: { entity_id: id } })
  }
  await db.robot_public_projections.upsert({
    where: { robot_entity_id: entity.id },
    create: { robot_entity_id: entity.id, canonical_name: name },
    update: { canonical_name: name },
  })
  return entity
}

async function ensureProject(db: PrismaClient, fixture: Fixture) {
  const robot = await ensureRobot(db, fixture.robotSlug, fixture.robotName)
  let entity = await db.entities.findUnique({ where: { slug: fixture.slug } })
  if (!entity) {
    const id = randomUUID()
    entity = await db.entities.create({ data: { id, entity_type: 'PROJECT', slug: fixture.slug, publication_status: 'PUBLISHED' } })
    await db.software_packages.create({ data: {
      id, entity_id: id, canonical_name: fixture.name, ecosystem: fixture.ecosystem,
      project_type: fixture.type, origin_status: 'COMMUNITY', verification_status: 'DISCOVERED',
      repository_url: `https://example.com/registry-fixtures/${fixture.slug}`,
      homepage_url: `https://example.com/registry-fixtures/${fixture.slug}`,
      license_id: fixture.license, description: 'Development fixture. It is never intended for production publication.',
    } })
  }
  const project = await db.software_packages.findUniqueOrThrow({ where: { entity_id: entity.id } })
  const projectEvidence = await db.registry_evidence.findFirst({ where: { entity_id: entity.id, url: project.repository_url ?? undefined } })
  if (!projectEvidence) await db.registry_evidence.create({ data: { entity_id: entity.id, url: project.repository_url!, kind: 'REPOSITORY' } })
  if (project.verification_status === 'DISCOVERED') await db.software_packages.update({ where: { id: project.id }, data: { verification_status: 'SUGGESTED' } })
  if ((await db.software_packages.findUniqueOrThrow({ where: { id: project.id } })).verification_status === 'SUGGESTED') {
    await db.software_packages.update({ where: { id: project.id }, data: { verification_status: 'VERIFIED', last_verified_at: new Date() } })
  }

  let compatibility = await db.compatibility_claims.findFirst({ where: { project_id: project.id, robot_id: robot.id } })
  if (!compatibility) {
    compatibility = await db.compatibility_claims.create({ data: {
      project_id: project.id, robot_id: robot.id, subject_type: 'PROJECT', subject_entity_id: project.id,
      object_type: 'ROBOT', object_entity_id: robot.id, type: 'SOFTWARE', claim_status: 'DISCOVERED',
    } })
  }
  const compatibilityEvidence = await db.registry_evidence.findFirst({ where: { compatibility_id: compatibility.id } })
  if (!compatibilityEvidence) await db.registry_evidence.create({ data: { compatibility_id: compatibility.id, url: project.repository_url!, kind: 'TEST_RESULT' } })
  if (compatibility.claim_status === 'DISCOVERED') compatibility = await db.compatibility_claims.update({ where: { id: compatibility.id }, data: { claim_status: 'SUGGESTED' } })
  if (compatibility.claim_status === 'SUGGESTED') await db.compatibility_claims.update({ where: { id: compatibility.id }, data: { claim_status: 'VERIFIED', checked_at: new Date(), confidence: 1 } })
}

export async function seedRegistryFixtures(db: PrismaClient) {
  if (process.env.NODE_ENV === 'production') throw new Error('Registry fixtures cannot run in production')
  for (const fixture of fixtures) await ensureProject(db, fixture)
  await db.feature_flags.upsert({ where: { key_environment: { key: 'registry.read', environment: 'development' } }, create: { key: 'registry.read', environment: 'development', enabled: true }, update: { enabled: true } })
  return fixtures.map((fixture) => fixture.slug)
}

if (process.argv[1]?.endsWith('registry-fixtures.ts')) {
  void import('./index').then(({ prisma }) => seedRegistryFixtures(prisma).then((slugs) => console.log(`Registry fixtures ready: ${slugs.join(', ')}`)).finally(() => prisma.$disconnect()))
}
