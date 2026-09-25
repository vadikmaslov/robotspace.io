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
import { registerGitHubIdentity } from '../../../apps/web/src/lib/registry-identity'
import { claimProject, revokeClaim, verifyGitHubControl } from '../../../apps/web/src/lib/registry-claims'

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
          const compat = await repo.proposeCompatibility({userId:user,projectId:created.id,robotId:robot,evidenceUrl:'https://example.com/result'})
          assert.equal(compat.claim_status,'SUGGESTED')
          await c.query("UPDATE compatibility_claims SET claim_status='VERIFIED' WHERE id=$1",[compat.id])
          await mustReject(c,"UPDATE compatibility_claims SET requirements='{\"firmware\":\"2\"}' WHERE id=$1",[compat.id])
          await mustReject(c,"UPDATE registry_changes SET action='tampered'")
          await mustReject(c,"UPDATE compatibility_claims SET project_id=NULL,robot_id=NULL WHERE id=$1",[compat.id])
          await mustReject(c,"UPDATE registry_evidence SET url='https://example.com/tampered'")
          const claim = (await c.query("INSERT INTO entity_claims(entity_id,claimant_id,proof_url) VALUES($1,$2,'https://github.com/test/repo') RETURNING id",[created.id,user])).rows[0].id
          await mustReject(c,"UPDATE entity_claims SET status='VERIFIED' WHERE id=$1",[claim])
          await c.query("UPDATE entity_claims SET status='VERIFIED',verification_method='fixture',checked_at=now() WHERE id=$1",[claim])
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
