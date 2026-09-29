import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { registryRepository } from './repositories/registry'
import { seedRegistryFixtures } from './registry-fixtures'
import { importGitHubProject } from './registry-import'
import { syncGitHubProjects } from './registry-sync'
import { registerGitHubIdentity } from '../../../apps/web/src/lib/registry-identity'
import { claimProject, revokeClaim, verifyGitHubControl } from '../../../apps/web/src/lib/registry-claims'
import { createDeveloperProfile, saveProjectMetadata, submitCompatibilityOpinion, submitCorrection, suggestCompatibility } from '../../../apps/web/src/lib/registry-community'
import { moderateCompatibilitySuggestion, moderateConfirmation, moderateCorrection } from '../../../apps/web/src/lib/registry-moderation'
import { getRobotEcosystem } from '../../../apps/web/src/lib/robot-ecosystem'
import { rankRobotEcosystemProjects } from '../../../apps/web/src/lib/registry-ranking'
import { beginManufacturerClaim, getManufacturerVoice, publishManufacturerStatement, revokeManufacturerClaim, verifyManufacturerClaim } from '../../../apps/web/src/lib/manufacturer-voice'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const migrationDir = path.join(root, 'packages/db/migrations')
function connection() {
  let value = process.env.REGISTRY_TEST_DATABASE_URL ?? process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL
  if (!value) {
    const filename = path.join(root, 'apps/web/.env.local')
    if (existsSync(filename)) {
      const lines = readFileSync(filename, 'utf8')
      const match = lines.match(/^\s*(?:DIRECT_DATABASE_URL|DATABASE_URL)\s*=\s*(.+)$/m)
      value = match?.[1].trim().replace(/^['"]|['"]$/g, '')
    }
  }
  if (!value) throw new Error('Set REGISTRY_TEST_DATABASE_URL to a local PostgreSQL connection')
  const url = new URL(value)
  if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error('Tests require localhost')
  return url
}
async function migrations(c: Client, stopBefore36 = false, only36 = false, startAt?: string) {
  await c.query('CREATE TABLE IF NOT EXISTS robotspace_schema_migrations(name text PRIMARY KEY,checksum char(64) NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())')
  for (const name of readdirSync(migrationDir).filter(n => /^\d+_/.test(n) && existsSync(path.join(migrationDir,n,'migration.sql'))).sort()) {
    if (stopBefore36 && name >= '36_') break
    if (only36 && !name.startsWith('36_')) continue
    if (startAt && name < startAt) continue
    const sql = readFileSync(path.join(migrationDir, name, 'migration.sql'),'utf8')
    const checksum = createHash('sha256').update(sql).digest('hex')
    const previous = await c.query('SELECT checksum FROM robotspace_schema_migrations WHERE name=$1',[name])
    if (previous.rowCount) { assert.equal(previous.rows[0].checksum,checksum); continue }
    await c.query('BEGIN')
    try {
      await c.query(sql)
      await c.query('INSERT INTO robotspace_schema_migrations(name,checksum) VALUES($1,$2)',[name,checksum])
      await c.query('COMMIT')
    } catch (e) { await c.query('ROLLBACK'); throw e }
  }
}
async function mustReject(c: Client, sql: string, values: unknown[] = []) {
  await assert.rejects(c.query(sql, values), 'Expected database to reject invalid mutation')
}
async function run() {
  const original = connection()
  const admin = new Client({ connectionString: original.href })
  await admin.connect()
  const names: string[] = []
  try {
    for (const mode of process.argv.includes('--fresh-only') ? ['fresh'] : ['fresh','clone']) {
      const name = 'robotspace_registry_test_' + randomUUID().replaceAll('-','')
      names.push(name)
      await admin.query('CREATE DATABASE "' + name + '"')
      const testUrl = new URL(original)
      testUrl.pathname = '/' + name
      const c = new Client({connectionString:testUrl.href})
      await c.connect()
      try {
        if (mode === 'clone') {
          const binary = process.env.REGISTRY_PG_DUMP ?? (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin/pg_dump.exe' : 'pg_dump')
          // Keep the dump in memory; do not print data, credentials or psql meta commands.
          const insertDump = spawnSync(binary, ['--no-owner','--no-privileges','--inserts'], {
            env: { ...process.env, PGHOST:original.hostname, PGPORT:original.port||'5432',
              PGUSER:decodeURIComponent(original.username), PGPASSWORD:decodeURIComponent(original.password), PGDATABASE:original.pathname.slice(1) },
            encoding:'utf8',maxBuffer:64*1024*1024,
          })
          if (insertDump.status !== 0) throw new Error('Clone dump failed')
          await c.query(insertDump.stdout.split('\n').filter(l => !l.startsWith('\\')).join('\n'))
          await c.query('SET search_path TO public')
        }
        if (mode === 'fresh') await migrations(c,true)
        const audit = {}
        for (const table of ['software_packages','software_releases','compatibility_claims','entities','field_assertions','audit_logs']) {
          Object.assign(audit,{[table]:(await c.query('SELECT count(*)::int AS n FROM '+table)).rows[0].n})
        }
        console.log(mode+' baseline counts:',JSON.stringify(audit))
        const project = randomUUID(), robot = randomUUID(), legacy = randomUUID()
        await c.query("INSERT INTO software_packages(id,canonical_name,ecosystem) VALUES($1,'Legacy SDK','ROS')",[project])
        await c.query("INSERT INTO software_releases(software_id,version) VALUES($1,'1.0')",[project])
        await c.query("INSERT INTO entities(id,entity_type,slug) VALUES($1,'ROBOT',$2)",[robot,'registry-fixture-'+robot])
        await c.query('INSERT INTO robots(entity_id) VALUES($1)',[robot])
        await c.query("INSERT INTO compatibility_claims(id,subject_type,subject_entity_id,object_type,object_entity_id,type,claim_status,evidence_url) VALUES($1,'SOFTWARE',$2,'ROBOT',$3,'SOFTWARE','VERIFIED','https://example.com/legacy')",[legacy,project,robot])
        const preserved = (await c.query('SELECT row_to_json(c) AS row FROM compatibility_claims c WHERE id=$1',[legacy])).rows[0].row
        const beforeEntities = (await c.query('SELECT id,slug FROM entities ORDER BY id')).rows
        const assertionId = randomUUID()
        await c.query("INSERT INTO field_assertions(id,entity_type,entity_id,field_key,normalized_value_json) VALUES($1,'ROBOT',$2,'fixture','{\"value\":1}')",[assertionId,robot])
        const auditId = (await c.query("INSERT INTO audit_logs(actor_type,action,target_type,target_id) VALUES('SYSTEM','registry-fixture','ROBOT',$1) RETURNING id",[robot])).rows[0].id

        // Rehearse an additive migration rollback before committing any schema changes.
        const sql = readFileSync(path.join(migrationDir,'36_registry_foundation/migration.sql'),'utf8')
        await c.query('BEGIN'); await c.query(sql); await c.query('ROLLBACK')
        assert.equal((await c.query("SELECT to_regclass('registry_users') AS t")).rows[0].t,null)
        await migrations(c,false,true); await migrations(c,false,true)
        const down = readFileSync(path.join(root,'packages/db/rollback/36_registry_foundation.sql'),'utf8')
        await c.query('BEGIN'); await c.query(down); await c.query('COMMIT')
        assert.equal((await c.query("SELECT to_regclass('registry_users') AS t")).rows[0].t,null)
        assert.deepEqual((await c.query('SELECT row_to_json(c) AS row FROM compatibility_claims c WHERE id=$1',[legacy])).rows[0].row,preserved)
        await migrations(c,false,mode === 'clone')
        if (mode === 'clone') await migrations(c,false,false,'37_')
        assert.equal((await c.query("SELECT to_regclass('registry_login_grants') AS t")).rows[0].t,'registry_login_grants')
        assert.equal((await c.query("SELECT to_regclass('registry_claim_attempts') AS t")).rows[0].t,'registry_claim_attempts')
        assert.deepEqual((await c.query('SELECT normalized_value_json FROM field_assertions WHERE id=$1',[assertionId])).rows[0].normalized_value_json,{value:1})
        assert.equal((await c.query('SELECT action FROM audit_logs WHERE id=$1',[auditId])).rows[0].action,'registry-fixture')
        for (const e of beforeEntities) assert.equal((await c.query('SELECT slug FROM entities WHERE id=$1',[e.id])).rows[0].slug,e.slug)
        const after = (await c.query('SELECT row_to_json(c) AS row FROM compatibility_claims c WHERE id=$1',[legacy])).rows[0].row
        for (const [key,value] of Object.entries(preserved)) assert.deepEqual(after[key],value)
        assert.equal((await c.query('SELECT entity_id FROM software_packages WHERE id=$1',[project])).rows[0].entity_id,project)
        assert.equal((await c.query('SELECT version FROM software_releases WHERE software_id=$1',[project])).rows[0].version,'1.0')
        assert.equal((await c.query('SELECT count(*)::int AS n FROM registry_evidence WHERE compatibility_id=$1',[legacy])).rows[0].n,1)
        assert.equal((await c.query("SELECT count(*)::int AS n FROM feature_flags WHERE key LIKE 'registry.%' AND enabled")).rows[0].n,0)
        const user = randomUUID()
        await c.query('INSERT INTO registry_users(id) VALUES($1)',[user])
        await mustReject(c,"INSERT INTO registry_accounts(user_id,provider,provider_account_id) VALUES($1,'github','123')",[randomUUID()])
        await c.query("INSERT INTO registry_accounts(user_id,provider,provider_account_id) VALUES($1,'github','123')",[user])
        await mustReject(c,"INSERT INTO registry_accounts(user_id,provider,provider_account_id) VALUES($1,'github','123')",[user])
        await mustReject(c,"UPDATE software_packages SET verification_status='VERIFIED' WHERE id=$1",[project])
        await mustReject(c,"DELETE FROM software_packages WHERE id=$1",[project])
        await mustReject(c,"INSERT INTO registry_evidence(url,kind) VALUES('https://example.com','COMMUNITY')")
        const adapter = new PrismaPg({connectionString:testUrl.href})
        const prisma = new PrismaClient({adapter})
        try {
          const repo = registryRepository(prisma)
          assert.equal(await repo.enabled('registry.read'),false)
          assert.equal(await repo.findPublishedProject('project-'+project),null)
          await assert.rejects(repo.createProject({userId:user,slug:'new-project',name:'Test',repositoryUrl:'https://github.com/test/repo'}),/disabled/)
          await c.query("UPDATE feature_flags SET enabled=true WHERE key IN ('registry.read','registry.write')")
          await c.query("INSERT INTO feature_flags(key,environment,enabled) VALUES('registry.write','staging',false)")
          await assert.rejects(repo.createProject({userId:user,slug:'staging',name:'Test',repositoryUrl:'https://github.com/test/repo',environment:'staging'}),/disabled/)
          const created = await repo.createProject({userId:user,slug:'new-project',name:'Test',repositoryUrl:'https://github.com/test/repo'})
          assert.equal(created.verification_status,'DISCOVERED')
          await c.query("UPDATE software_packages SET verification_status='SUGGESTED' WHERE id=$1",[created.id])
          await mustReject(c,"UPDATE software_packages SET verification_status='VERIFIED' WHERE id=$1",[created.id])
          await c.query("INSERT INTO registry_evidence(entity_id,url,kind) VALUES($1,'https://github.com/test/repo','REPOSITORY')",[created.id])
          await c.query("UPDATE software_packages SET verification_status='VERIFIED' WHERE id=$1",[created.id])
          await mustReject(c,"INSERT INTO repository_snapshots(project_id,stars,sync_status) VALUES($1,-1,'OK')",[created.id])
          assert.equal(await repo.findPublishedProject('new-project'),null)
          await c.query("UPDATE entities SET publication_status='PUBLISHED' WHERE id=$1",[created.id])
          assert.equal((await repo.findPublishedProject('new-project'))?.id,created.id)
          await assert.rejects(repo.proposeCompatibility({userId:user,projectId:created.id,robotId:robot,evidenceUrl:'https://example.com/result'}),/ownership/)
          const claim = (await c.query("INSERT INTO entity_claims(entity_id,claimant_id,proof_url) VALUES($1,$2,'https://github.com/test/repo') RETURNING id",[created.id,user])).rows[0].id
          await mustReject(c,"UPDATE entity_claims SET status='VERIFIED' WHERE id=$1",[claim])
          await c.query("UPDATE entity_claims SET status='VERIFIED',verification_method='fixture',checked_at=now() WHERE id=$1",[claim])
          await c.query("UPDATE entities SET publication_status='PUBLISHED' WHERE id=$1",[robot])
          const compat = await repo.proposeCompatibility({userId:user,projectId:created.id,robotId:robot,evidenceUrl:'https://example.com/result'})
          assert.equal(compat.claim_status,'SUGGESTED')
          await c.query("UPDATE compatibility_claims SET claim_status='VERIFIED' WHERE id=$1",[compat.id])
          await mustReject(c,"UPDATE compatibility_claims SET requirements='{\"firmware\":\"2\"}' WHERE id=$1",[compat.id])
          await mustReject(c,"UPDATE registry_changes SET action='tampered'")
          await mustReject(c,"UPDATE compatibility_claims SET project_id=NULL,robot_id=NULL WHERE id=$1",[compat.id])
          await mustReject(c,"UPDATE registry_evidence SET url='https://example.com/tampered'")
          await mustReject(c,"UPDATE entity_claims SET entity_id=$1 WHERE id=$2",[robot,claim])
          await c.query("UPDATE entity_claims SET status='REVOKED' WHERE id=$1",[claim])
          await mustReject(c,"UPDATE entity_claims SET status='VERIFIED' WHERE id=$1",[claim])
          await mustReject(c,"INSERT INTO compatibility_confirmations(compatibility_id,user_id,evidence_id,verdict) VALUES($1,$2,(SELECT id FROM registry_evidence WHERE compatibility_id=$3 LIMIT 1),'CONFIRMED')",[compat.id,user,legacy])
          await c.query("UPDATE registry_users SET status='SUSPENDED' WHERE id=$1",[user])
          await assert.rejects(repo.createProject({userId:user,slug:'suspended',name:'Test',repositoryUrl:'https://github.com/test/repo2'}),/Active/)
          const fixtureSlugs = await seedRegistryFixtures(prisma)
          assert.equal(fixtureSlugs.length, 3)
          assert.equal(await prisma.software_packages.count({ where: { verification_status: 'VERIFIED', canonical_name: { startsWith: 'Fixture ' } } }), 3)
          assert.equal(await prisma.compatibility_claims.count({ where: { claim_status: 'VERIFIED', project_id: { not: null } } }), 4)
          const serviceRobot = await prisma.entities.findUniqueOrThrow({ where: { slug: 'fixture-service-robot' } })
          const resource = await prisma.robot_resources.create({ data: { robot_entity_id: serviceRobot.id, resource_type: 'DOCS', title: 'Fixture documentation', url: 'https://example.com/fixture-service-robot/docs', evidence_url: 'https://example.com/fixture-service-robot', created_by: 'registry-test' } })
          await prisma.robot_resources.create({ data: { robot_entity_id: serviceRobot.id, resource_type: 'SDK', title: 'Rejected fixture SDK', url: 'https://example.com/fixture-service-robot/rejected-sdk', evidence_url: 'https://example.com/fixture-service-robot/rejected', verification_status: 'REJECTED', created_by: 'registry-test' } })
          await mustReject(c, "UPDATE robot_resources SET url='https://example.com/tampered' WHERE id=$1", [resource.id])
          await prisma.robot_resources.update({ where: { id: resource.id }, data: { verification_status: 'REJECTED' } })
          await mustReject(c, "UPDATE robot_resources SET verification_status='VERIFIED' WHERE id=$1", [resource.id])
          const visibleResource = await prisma.robot_resources.create({ data: { robot_entity_id: serviceRobot.id, resource_type: 'WEBSITE', title: 'Fixture website', url: 'https://example.com/fixture-service-robot', evidence_url: 'https://example.com/fixture-service-robot/about', created_by: 'registry-test' } })
          const fixtureProject = await prisma.entities.findUniqueOrThrow({ where: { slug: fixtureSlugs[0] } })
          await assert.rejects(prisma.robot_resources.create({ data: { robot_entity_id: fixtureProject.id, resource_type: 'DOCS', title: 'Wrong entity', url: 'https://example.com/wrong', evidence_url: 'https://example.com/wrong/evidence', created_by: 'registry-test' } }), /active robot entity/)
          const ecosystem = await getRobotEcosystem(prisma, serviceRobot.id)
          assert.deepEqual(ecosystem.resources.map(item => item.id), [visibleResource.id])
          assert.deepEqual(ecosystem.officialProjects, [])
          assert.deepEqual(ecosystem.communityProjects.map(item => item.name), ['Fixture Voice Skill'])
          assert.equal(ecosystem.maturity.verifiedResourceCount, 1)
          assert.equal(ecosystem.maturity.verifiedProjectCount, 1)
          if (mode === 'fresh') {
            const originalSecret = process.env.AUTH_SECRET
            process.env.AUTH_SECRET = `registry-test-${randomUUID()}-${randomUUID()}`
            try {
              const githubRepository = 'https://github.com/fixture/claim-sample'
              const importFetch: typeof fetch = async url => {
                const target = String(url)
                if (target.endsWith('/robotspace.yaml')) return new Response('version: 1\nname: Claim Sample\nproject_type: tool\nrobots:\n  - slug: fixture-mobile-robot\n')
                if (target.endsWith('/readme')) return new Response('{}')
                if (target.includes('/releases')) return Response.json([{ tag_name: 'v1.0', published_at: '2026-01-01T00:00:00Z' }])
                return Response.json({ id: 98765, name: 'claim-sample', description: 'Fixture', html_url: githubRepository, homepage: null, topics: [], default_branch: 'main', license: null, updated_at: '2026-01-01T00:00:00Z', stargazers_count: 0, forks_count: 0, open_issues_count: 0 })
              }
              const first = await importGitHubProject(prisma, githubRepository, importFetch)
              const second = await importGitHubProject(prisma, githubRepository, importFetch)
              assert.equal(first.project.id, second.project.id)
              assert.equal(second.project.verification_status, 'SUGGESTED')
              assert.equal(await prisma.compatibility_claims.count({ where: { project_id: first.project.id, claim_status: 'SUGGESTED' } }), 1)
              const projectEntity = await prisma.entities.findUniqueOrThrow({ where: { id: first.project.id } })
              assert.equal(projectEntity.publication_status, 'DRAFT')
              await prisma.feature_flags.upsert({ where: { key_environment: { key: 'registry.claims', environment: 'development' } }, create: { key: 'registry.claims', environment: 'development', enabled: true }, update: { enabled: true } })
              const manufacturer = await prisma.entities.create({ data: { entity_type: 'COMPANY', slug: 'fixture-manufacturer', publication_status: 'PUBLISHED' } })
              await prisma.companies.create({ data: { entity_id: manufacturer.id } })
              await prisma.company_public_projections.create({ data: { company_entity_id: manufacturer.id, canonical_name: 'Fixture Manufacturer', official_url: 'https://manufacturer.example', official_url_verified_at: new Date(), official_url_verification_method: 'ADMIN_CONFIRMED' } })
              await prisma.robot_company_relations.create({ data: { company_entity_id: manufacturer.id, robot_entity_id: serviceRobot.id, relation: 'MANUFACTURES', evidence_url: 'https://manufacturer.example/robots/service' } })
              const manufacturerUser = await prisma.registry_users.create({ data: {} })
              await prisma.registry_accounts.create({ data: { user_id: manufacturerUser.id, provider: 'github', provider_account_id: 'manufacturer-4567' } })
              const manufacturerOutsider = await prisma.registry_users.create({ data: {} })
              await prisma.registry_accounts.create({ data: { user_id: manufacturerOutsider.id, provider: 'github', provider_account_id: 'manufacturer-outsider' } })
              const forgedClaim = await prisma.entity_claims.create({ data: { entity_id: manufacturer.id, claimant_id: manufacturerOutsider.id, proof_url: 'https://manufacturer.example' } })
              await mustReject(c, "UPDATE entity_claims SET status='VERIFIED',verification_method='DNS_TXT_MANUFACTURER',checked_at=now() WHERE id=$1", [forgedClaim.id])
              const challenge = await beginManufacturerClaim(prisma, manufacturerUser.id, manufacturer.slug)
              assert.match(challenge.token ?? '', /^robotspace-claim=[a-f0-9]{48}$/)
              await assert.rejects(verifyManufacturerClaim(prisma, manufacturerUser.id, manufacturer.slug, async () => [['wrong-token']]), /does not match/)
              assert.equal((await prisma.entity_claims.findUniqueOrThrow({ where: { id: challenge.claim.id } })).status, 'PENDING')
              await verifyManufacturerClaim(prisma, manufacturerUser.id, manufacturer.slug, async () => [[challenge.token!]])
              assert.equal(await prisma.registry_roles.count({ where: { user_id: manufacturerUser.id, role: 'VERIFIED_MANUFACTURER' } }), 1)
              await assert.rejects(publishManufacturerStatement(prisma, manufacturerOutsider.id, { companySlug: manufacturer.slug, robotId: serviceRobot.id, type: 'SPEC', title: 'Forged reach', value: '900 mm', evidenceUrl: 'https://manufacturer.example/robots/service' }), /verified company claim/)
              await assert.rejects(publishManufacturerStatement(prisma, manufacturerUser.id, { companySlug: manufacturer.slug, robotId: robot, type: 'DOCS', title: 'Wrong robot', url: 'https://manufacturer.example/docs', evidenceUrl: 'https://manufacturer.example/proof' }), /not linked/)
              await assert.rejects(publishManufacturerStatement(prisma, manufacturerUser.id, { companySlug: manufacturer.slug, robotId: serviceRobot.id, type: 'DOCS', title: 'Wrong proof', url: 'https://manufacturer.example/docs', evidenceUrl: 'https://attacker.example/proof' }), /verified company domain/)
              const officialStatement = await publishManufacturerStatement(prisma, manufacturerUser.id, { companySlug: manufacturer.slug, robotId: serviceRobot.id, type: 'SPEC', title: 'Reach', value: '900 mm', evidenceUrl: 'https://manufacturer.example/robots/service' })
              assert.equal((await getManufacturerVoice(prisma, manufacturer.id, serviceRobot.id)).statements[0]?.id, officialStatement.id)
              await prisma.company_public_projections.update({ where: { company_entity_id: manufacturer.id }, data: { official_url: 'https://new-manufacturer.example', official_url_verified_at: new Date() } })
              assert.equal((await getManufacturerVoice(prisma, manufacturer.id, serviceRobot.id)).verified, false)
              await assert.rejects(publishManufacturerStatement(prisma, manufacturerUser.id, { companySlug: manufacturer.slug, robotId: serviceRobot.id, type: 'SPEC', title: 'Reach', value: '950 mm', evidenceUrl: 'https://new-manufacturer.example/robots/service' }), /verified company claim/)
              await prisma.company_public_projections.update({ where: { company_entity_id: manufacturer.id }, data: { official_url: 'https://manufacturer.example', official_url_verified_at: new Date() } })
              await mustReject(c, 'UPDATE manufacturer_statements SET title=$1 WHERE id=$2', ['Changed', officialStatement.id])
              await mustReject(c, 'DELETE FROM manufacturer_statements WHERE id=$1', [officialStatement.id])
              await revokeManufacturerClaim(prisma, manufacturerUser.id, challenge.claim.id)
              assert.equal((await getManufacturerVoice(prisma, manufacturer.id, serviceRobot.id)).verified, false)
              assert.equal(await prisma.manufacturer_statements.count({ where: { id: officialStatement.id } }), 1)
              for (const action of ['MANUFACTURER_CHALLENGE_CREATED', 'MANUFACTURER_CLAIM_VERIFIED', 'MANUFACTURER_CLAIM_REVOKED']) assert.equal(await prisma.registry_changes.count({ where: { claim_id: challenge.claim.id, action } }), 1)
              assert.equal(await prisma.registry_changes.count({ where: { entity_id: serviceRobot.id, action: 'MANUFACTURER_STATEMENT_PUBLISHED' } }), 1)
              await assert.rejects(publishManufacturerStatement(prisma, manufacturerUser.id, { companySlug: manufacturer.slug, robotId: serviceRobot.id, type: 'SPEC', title: 'Reach', value: '950 mm', evidenceUrl: 'https://manufacturer.example/robots/service' }), /verified company claim/)
              const claimant = await registerGitHubIdentity(prisma, '4567', 'temporary-test-token')
              const encryptedGrant = await prisma.registry_login_grants.findUniqueOrThrow({ where: { user_id: claimant } })
              assert.equal(encryptedGrant.ciphertext.includes(Buffer.from('temporary-test-token')), false)
              assert.ok(encryptedGrant.expires_at > new Date())
              const proofFetch: typeof fetch = async (url, init) => {
                assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer temporary-test-token')
                if (String(url).endsWith('/user')) return Response.json({ id: 4567 })
                return Response.json({ id: 98765, private: false, html_url: githubRepository, permissions: { admin: true } })
              }
              const verified = await claimProject(prisma, claimant, projectEntity.slug, proofFetch)
              assert.equal(verified.status, 'VERIFIED')
              assert.equal(await prisma.registry_login_grants.count({ where: { user_id: claimant } }), 0)
              assert.equal(await prisma.registry_roles.count({ where: { user_id: claimant, role: 'VERIFIED_DEVELOPER' } }), 1)
              await prisma.feature_flags.upsert({ where: { key_environment: { key: 'registry.write', environment: 'development' } }, create: { key: 'registry.write', environment: 'development', enabled: true }, update: { enabled: true } })
              const stranger = await prisma.registry_users.create({ data: {} })
              await assert.rejects(createDeveloperProfile(prisma, stranger.id, { handle: 'stranger', displayName: 'Stranger', bio: '' }), /Verify a project/)
              const profile = await createDeveloperProfile(prisma, claimant, { handle: 'fixture-developer', displayName: 'Fixture Developer', bio: 'Robotics' })
              assert.equal(profile.handle, 'fixture-developer')
              await assert.rejects(saveProjectMetadata(prisma, stranger.id, projectEntity.slug, { name: 'Hijacked', description: '', homepage: '', license: '', evidence: githubRepository }), /ownership/)
              assert.equal(await saveProjectMetadata(prisma, claimant, projectEntity.slug, { name: 'Claim Sample Updated', description: 'A robot tool', homepage: '', license: 'MIT', evidence: githubRepository }), 'UPDATED')
              assert.equal((await prisma.software_packages.findUniqueOrThrow({ where: { id: first.project.id } })).canonical_name, 'Claim Sample Updated')
              await prisma.entities.update({ where: { id: projectEntity.id }, data: { publication_status: 'PUBLISHED' } })
              assert.equal(await saveProjectMetadata(prisma, claimant, projectEntity.slug, { name: 'Moderated Name', description: 'A robot tool', homepage: '', license: 'MIT', evidence: githubRepository }), 'PENDING')
              const metadataCorrection = await prisma.registry_corrections.findFirstOrThrow({ where: { entity_id: projectEntity.id, user_id: claimant, status: 'PENDING' }, orderBy: { created_at: 'desc' } })
              assert.equal((await prisma.software_packages.findUniqueOrThrow({ where: { id: first.project.id } })).canonical_name, 'Claim Sample Updated')
              await moderateCorrection(prisma, metadataCorrection.id, 'ACCEPTED', 'test-admin')
              assert.equal((await prisma.software_packages.findUniqueOrThrow({ where: { id: first.project.id } })).canonical_name, 'Moderated Name')
              assert.equal(await saveProjectMetadata(prisma, claimant, projectEntity.slug, { name: 'Stale Proposal', description: 'A robot tool', homepage: '', license: 'MIT', evidence: githubRepository }), 'PENDING')
              const stale = await prisma.registry_corrections.findFirstOrThrow({ where: { entity_id: projectEntity.id, user_id: claimant, status: 'PENDING' }, orderBy: { created_at: 'desc' } })
              await prisma.software_packages.update({ where: { id: first.project.id }, data: { canonical_name: 'Newer Editorial Name' } })
              await assert.rejects(moderateCorrection(prisma, stale.id, 'ACCEPTED', 'test-admin'), /changed after this proposal/)
              assert.equal((await prisma.registry_corrections.findUniqueOrThrow({ where: { id: stale.id } })).status, 'PENDING')
              await moderateCorrection(prisma, stale.id, 'REJECTED', 'test-admin')
              await assert.rejects(suggestCompatibility(prisma, stranger.id, projectEntity.slug, 'fixture-service-robot', githubRepository), /ownership/)
              const suggestion = await suggestCompatibility(prisma, claimant, projectEntity.slug, 'fixture-service-robot', githubRepository)
              assert.equal(suggestion.claim_status, 'SUGGESTED')
              await moderateCompatibilitySuggestion(prisma, suggestion.id, 'ACCEPTED', 'test-admin')
              await assert.rejects(submitCompatibilityOpinion(prisma, claimant, suggestion.id, 'CONFIRMED', githubRepository), /independent account/)
              const confirmation = await submitCompatibilityOpinion(prisma, stranger.id, suggestion.id, 'CONFIRMED', githubRepository)
              assert.equal(confirmation.status, 'PENDING')
              await assert.rejects(submitCompatibilityOpinion(prisma, stranger.id, suggestion.id, 'DISPUTED', githubRepository))
              const challenger = await prisma.registry_users.create({ data: {} })
              const dispute = await submitCompatibilityOpinion(prisma, challenger.id, suggestion.id, 'DISPUTED', 'https://example.com/failed-test')
              const pendingReporter = await prisma.registry_users.create({ data: {} })
              const pendingReport = await submitCompatibilityOpinion(prisma, pendingReporter.id, suggestion.id, 'CONFIRMED', 'https://example.com/unmoderated-result')
              await moderateConfirmation(prisma, confirmation.id, 'ACCEPTED', 'test-admin')
              await moderateConfirmation(prisma, dispute.id, 'ACCEPTED', 'test-admin')
              await mustReject(c, "UPDATE compatibility_confirmations SET verdict='DISPUTED' WHERE id=$1", [confirmation.id])
              await mustReject(c, 'DELETE FROM compatibility_confirmations WHERE id=$1', [pendingReport.id])
              assert.equal((await prisma.compatibility_claims.findUniqueOrThrow({ where: { id: suggestion.id } })).claim_status, 'VERIFIED')
              await prisma.software_packages.update({ where: { id: first.project.id }, data: { verification_status: 'VERIFIED', last_verified_at: new Date() } })
              await prisma.feature_flags.upsert({ where: { key_environment: { key: 'registry.sync', environment: 'development' } }, create: { key: 'registry.sync', environment: 'development', enabled: true }, update: { enabled: true } })
              const githubSyncFetch: typeof fetch = async url => {
                const target = String(url)
                if (target.endsWith('/releases/latest')) return Response.json({ tag_name: 'v2.0.0', published_at: '2026-09-20T00:00:00Z' })
                return Response.json({ id: 98765, html_url: githubRepository, stargazers_count: 120, forks_count: 12, open_issues_count: 2, pushed_at: '2026-09-20T00:00:00Z' })
              }
              const firstSync = await syncGitHubProjects(prisma, { environment: 'development', fetcher: githubSyncFetch, now: new Date('2030-09-28T00:00:00Z'), force: true, projectIds: [first.project.id] })
              assert.deepEqual(firstSync, { enabled: true, attempted: 1, updated: 1, unchanged: 0, unavailable: 0, rateLimited: false })
              const syncedSnapshot = await prisma.repository_snapshots.findFirstOrThrow({ where: { project_id: first.project.id, sync_status: 'OK', fingerprint: { not: null } } })
              const secondSync = await syncGitHubProjects(prisma, { environment: 'development', fetcher: githubSyncFetch, now: new Date('2030-09-28T02:00:00Z'), force: true, projectIds: [first.project.id] })
              assert.deepEqual(secondSync, { enabled: true, attempted: 1, updated: 0, unchanged: 1, unavailable: 0, rateLimited: false })
              assert.ok((await prisma.repository_snapshots.findUniqueOrThrow({ where: { id: syncedSnapshot.id } })).checked_at > syncedSnapshot.checked_at)
              const unavailableSync = await syncGitHubProjects(prisma, { environment: 'development', fetcher: async () => new Response('', { status: 503 }), now: new Date('2030-09-28T03:00:00Z'), force: true, projectIds: [first.project.id] })
              assert.equal(unavailableSync.unavailable, 1)
              assert.equal((await prisma.repository_snapshots.findFirstOrThrow({ where: { project_id: first.project.id }, orderBy: { checked_at: 'desc' } })).sync_status, 'UNAVAILABLE')
              assert.equal((await prisma.repository_snapshots.findFirstOrThrow({ where: { project_id: first.project.id, sync_status: 'OK' }, orderBy: { checked_at: 'desc' } })).latest_release, 'v2.0.0')
              const rateLimitedSync = await syncGitHubProjects(prisma, { environment: 'development', fetcher: async () => new Response('', { status: 429, headers: { 'x-ratelimit-reset': '1790553600' } }), now: new Date('2030-09-28T04:00:00Z'), force: true, projectIds: [first.project.id] })
              assert.equal(rateLimitedSync.rateLimited, true)
              assert.equal((await prisma.repository_snapshots.findFirstOrThrow({ where: { project_id: first.project.id }, orderBy: { checked_at: 'desc' } })).sync_status, 'RATE_LIMITED')
              const rankingNow = new Date('2026-09-28T00:00:00Z')
              const ranked = rankRobotEcosystemProjects([
                { id: 'a', lastActivityAt: new Date('2026-09-25T00:00:00Z'), githubCheckedAt: new Date('2026-09-27T00:00:00Z'), stars: 120, forks: 12, confirmedCount: 1, disputedCount: 0 },
                { id: 'b', lastActivityAt: new Date('2025-01-01T00:00:00Z'), githubCheckedAt: null, stars: 0, forks: 0, confirmedCount: 0, disputedCount: 1 },
              ], rankingNow)
              assert.deepEqual(ranked.map(item => [item.id, item.ranking.rank]), [['a', 1], ['b', 2]])
              assert.equal(ranked[0].ranking.formulaVersion, 'robot-ecosystem-v1')
              assert.deepEqual(rankRobotEcosystemProjects(ranked.map(({ ranking: _ranking, ...item }) => item), rankingNow).map(item => item.ranking), ranked.map(item => item.ranking))
              process.env.DATABASE_URL = testUrl.href
              process.env.DIRECT_DATABASE_URL = testUrl.href
              const { getRegistryProject } = await import('../../../apps/web/src/lib/registry-public')
              const publicProject = await getRegistryProject(projectEntity.slug, prisma)
              const publicCompatibility = publicProject.project?.compatibility.find(item => item.id === suggestion.id)
              assert.equal(publicCompatibility?.communityTrust.status, 'DISPUTED')
              assert.equal(publicCompatibility?.communityTrust.confirmedCount, 1)
              assert.equal(publicCompatibility?.communityTrust.disputedCount, 1)
              assert.equal(publicCompatibility?.communityTrust.reports.length, 2)
              assert.equal(publicCompatibility?.communityTrust.reports.some(report => report.evidenceUrl.includes('unmoderated-result')), false)
              assert.equal(publicCompatibility?.evidence.some(source => source.url.includes('unmoderated-result')), false)
              assert.equal(publicProject.project?.latestRelease, 'v2.0.0')
              assert.equal(publicProject.project?.repositorySync.status, 'RATE_LIMITED')
              const enrichedEcosystem = await getRobotEcosystem(prisma, serviceRobot.id)
              assert.ok(enrichedEcosystem.communityProjects.some(item => item.name === 'Newer Editorial Name'))
              assert.deepEqual(enrichedEcosystem.contributors.map(item => item.handle), ['fixture-developer'])
              assert.equal(enrichedEcosystem.communityProjects.find(item => item.name === 'Newer Editorial Name')?.trustStatus, 'DISPUTED')
              assert.equal(enrichedEcosystem.communityProjects.find(item => item.name === 'Newer Editorial Name')?.ranking.formulaVersion, 'robot-ecosystem-v1')
              const correction = await submitCorrection(prisma, claimant, projectEntity.slug, 'Correct the description', githubRepository)
              assert.equal(correction.status, 'PENDING')
              await moderateCorrection(prisma, correction.id, 'ACCEPTED', 'test-admin')
              assert.equal(await prisma.registry_notifications.count({ where: { user_id: claimant } }), 4)
              assert.equal(await prisma.registry_reputation_events.aggregate({ where: { user_id: claimant }, _sum: { points: true } }).then(result => result._sum.points), 5)
              assert.equal((await prisma.developer_profiles.findUniqueOrThrow({ where: { user_id: claimant } })).reputation, 5)
              assert.equal(await prisma.registry_reputation_events.aggregate({ where: { user_id: stranger.id }, _sum: { points: true } }).then(result => result._sum.points), 1)
              await mustReject(c, "UPDATE registry_reputation_events SET points=99 WHERE user_id=$1", [claimant])
              await mustReject(c, "DELETE FROM registry_reputation_events WHERE user_id=$1", [claimant])
              assert.ok(await prisma.registry_changes.count({ where: { actor_id: claimant, action: 'PROJECT_METADATA_UPDATED' } }))
              await registerGitHubIdentity(prisma, '4567', 'temporary-test-token')
              const rechecked = await claimProject(prisma, claimant, projectEntity.slug, proofFetch)
              assert.equal(rechecked.id, verified.id)
              assert.equal(await prisma.entity_claims.count({ where: { entity_id: projectEntity.id, claimant_id: claimant } }), 1)
              await registerGitHubIdentity(prisma, '4567', 'temporary-test-token')
              await assert.rejects(claimProject(prisma, claimant, projectEntity.slug, async (url, init) => {
                if (String(url).endsWith('/user')) return proofFetch(url, init)
                return Response.json({ id: 98765, private: false, html_url: githubRepository, permissions: { admin: false } })
              }), /does not administer/)
              assert.equal((await prisma.entity_claims.findUniqueOrThrow({ where: { id: verified.id } })).status, 'REVOKED')
              assert.equal(await prisma.registry_roles.count({ where: { user_id: claimant, role: 'VERIFIED_DEVELOPER' } }), 0)
              await registerGitHubIdentity(prisma, '4567', 'temporary-test-token')
              const newClaim = await claimProject(prisma, claimant, projectEntity.slug, proofFetch)
              assert.notEqual(newClaim.id, verified.id)
              assert.equal(await prisma.registry_reputation_events.aggregate({ where: { user_id: claimant }, _sum: { points: true } }).then(result => result._sum.points), 5)
              await revokeClaim(prisma, claimant, newClaim.id)
              assert.equal((await prisma.entity_claims.findUniqueOrThrow({ where: { id: newClaim.id } })).status, 'REVOKED')
              await registerGitHubIdentity(prisma, '4567', 'temporary-test-token')
              await assert.rejects(claimProject(prisma, claimant, projectEntity.slug, async (url, init) => {
                if (String(url).endsWith('/user')) return proofFetch(url, init)
                return Response.json({ id: 98765, private: false, html_url: githubRepository })
              }), /needs review/)
              assert.equal(await prisma.entity_claims.count({ where: { entity_id: projectEntity.id, claimant_id: claimant, status: 'PENDING' } }), 1)
              await registerGitHubIdentity(prisma, '4567', 'temporary-test-token')
              await assert.rejects(claimProject(prisma, claimant, projectEntity.slug, proofFetch), /Too many claim attempts/)
              await assert.rejects(verifyGitHubControl('temporary-test-token', '4567', githubRepository, BigInt(98765), async url => String(url).endsWith('/user') ? Response.json({ id: 9999 }) : Response.json({ id: 98765, private: false, html_url: githubRepository, permissions: { admin: true } })), /does not match/)
            } finally {
              if (originalSecret === undefined) delete process.env.AUTH_SECRET
              else process.env.AUTH_SECRET = originalSecret
            }
          }
          await c.query('BEGIN')
          await assert.rejects(c.query(down),/Registry has new data/)
          await c.query('ROLLBACK')
        } finally { await prisma.$disconnect() }
        console.log(mode+': migration, repeatability, rollback rehearsal, preservation, foreign keys, evidence, status, history and repository checks PASS')
      } finally { await c.end() }
    }
  } finally {
    // Only UUID-named disposable databases created by this invocation can be dropped.
    for (const name of names) {
      assert.match(name,/^robotspace_registry_test_[0-9a-f]{32}$/)
      await admin.query('DROP DATABASE "'+name+'" WITH (FORCE)')
    }
    await admin.end()
  }
}
run().catch(e => { console.error(e instanceof Error ? e.message : 'Registry tests failed'); process.exitCode=1 })
