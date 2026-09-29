import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { pilotMetricsSql, pilotTeamIds } from '../apps/web/src/lib/pilot-metrics'

async function main() {
  const db = new Client({ connectionString: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL })
  const schema = `pilot_test_${randomUUID().replaceAll('-', '')}`
  await db.connect()
  let created = false
  try {
    assert.deepEqual(pilotTeamIds('1, 1,2'), ['1', '2'])
    assert.deepEqual(pilotTeamIds(undefined), [])
    assert.throws(() => pilotTeamIds('1,invalid'))
    await db.query(`CREATE SCHEMA "${schema}"`)
    created = true
    const tables = ['pilot_robot_cohort', 'registry_users', 'registry_accounts', 'registry_roles', 'entities', 'robot_public_projections', 'software_packages', 'compatibility_claims', 'entity_claims', 'registry_changes', 'developer_profiles', 'compatibility_confirmations']
    for (const table of tables) await db.query(`CREATE TABLE "${schema}".${table} (LIKE public.${table} INCLUDING ALL)`)
    await db.query(`SET search_path TO "${schema}"`)
    const since = new Date('2026-01-01T00:00:00Z')
    const at = (day: number) => new Date(since.getTime() + day * 86400000)
    const metrics = async (days = 30, now = at(100)) => (await db.query(pilotMetricsSql, [['1'], days, now])).rows[0]
    assert.equal((await metrics()).projects, 0, 'empty cohort')
    async function user(github: string | null) {
      const id = randomUUID()
      await db.query('INSERT INTO registry_users(id) VALUES ($1)', [id])
      if (github) await db.query("INSERT INTO registry_accounts(user_id,provider,provider_account_id) VALUES ($1,'github',$2)", [id, github])
      return id
    }
    const owner = await user('1'), outside = await user('2'), moderator = await user('3'), unknown = await user(null)
    await db.query("INSERT INTO registry_roles(user_id,role) VALUES ($1,'MODERATOR')", [moderator])
    async function entity(type: string, published = true) {
      const id = randomUUID()
      await db.query('INSERT INTO entities(id,entity_type,slug,publication_status) VALUES ($1,$2,$3,$4)', [id, type, id, published ? 'PUBLISHED' : 'DRAFT'])
      return id
    }
    const company = await entity('COMPANY'), robot = await entity('ROBOT'), otherRobot = await entity('ROBOT')
    await db.query('INSERT INTO pilot_robot_cohort(robot_entity_id,added_at) VALUES ($1,$2)', [robot, since])
    for (const id of [robot, otherRobot]) await db.query("INSERT INTO robot_public_projections(robot_entity_id,canonical_name,manufacturer_entity_id) VALUES ($1,'Robot',$2)", [id, company])
    async function project(claimant: string, published = true, target = robot, day = 1) {
      const id = await entity('PROJECT', published)
      const packageId = id // registry_project_same_id is enforced by the real schema.
      await db.query("INSERT INTO software_packages(id,entity_id,canonical_name,ecosystem) VALUES ($1,$2,'Project','OTHER')", [packageId, id])
      await db.query("INSERT INTO entity_claims(entity_id,claimant_id,status,proof_url,verification_method,checked_at,created_at) VALUES ($1,$2,'VERIFIED','https://example.test/proof','GITHUB',$3,$3)", [id, claimant, at(day)])
      const link = await compatibility(packageId, target, claimant, day)
      return { id, packageId, link }
    }
    async function compatibility(project: string, target: string, author: string, day = 1) {
      const id = randomUUID()
      await db.query("INSERT INTO compatibility_claims(id,project_id,robot_id,created_by,subject_type,subject_entity_id,object_type,object_entity_id,type,claim_status,created_at,subject_version_range) VALUES ($1,$2,$3,$4,'PROJECT',$2,'ROBOT',$3,'SOFTWARE','VERIFIED',$5,$6)", [id, project, target, author, at(day), id])
      return id
    }
    const first = await project(outside)
    await compatibility(first.packageId, robot, outside)
    await compatibility(first.packageId, robot, outside)
    await project(owner)
    await project(moderator)
    await project(outside, false)
    await project(outside, true, otherRobot)
    await project(outside, true, robot, -1)
    await project(outside, true, robot, 30) // Upper bound is exclusive.
    assert.equal((await metrics()).projects, 1)
    assert.equal((await metrics()).covered, 0, 'three duplicate links are not three projects')
    await project(outside)
    await project(outside)
    assert.equal((await metrics()).projects, 3)
    assert.equal((await metrics()).covered, 1)
    assert.equal((await metrics(60)).projects, 4, '30-day boundary enters 60-day window')
    await project(outside, true, robot, 60)
    assert.equal((await metrics(60)).projects, 4)
    assert.equal((await metrics(90)).projects, 5, '60-day boundary enters 90-day window')
    assert.equal((await metrics(90, at(1))).projects, 0, 'future events not counted')
    const profile = await entity('DEVELOPER')
    await db.query("INSERT INTO developer_profiles(user_id,entity_id,handle) VALUES ($1,$2,'tester')", [outside, profile])
    for (const actor of [outside, outside, owner, moderator, null, unknown]) await db.query("INSERT INTO registry_changes(entity_id,actor_id,action,created_at) VALUES ($1,$2,'PROJECT_METADATA_UPDATED',$3)", [first.id, actor, at(2)])
    await db.query("INSERT INTO registry_changes(entity_id,actor_id,action,created_at) VALUES ($1,$2,'PROJECT_METADATA_UPDATED',$3)", [otherRobot, outside, at(2)])
    let result = await metrics()
    assert.equal(result.external_actions, 2)
    assert.equal(result.team_actions, 3)
    assert.equal(result.unknown_actions, 1)
    assert.equal(result.developers, 1, 'events do not multiply people')
    const reviewer = await user('6')
    for (const actor of [reviewer, owner, moderator, outside]) await db.query("INSERT INTO compatibility_confirmations(compatibility_id,user_id,evidence_id,verdict,status,created_at) VALUES ($1,$2,$3,'CONFIRMED','PENDING',$4)", [first.link, actor, randomUUID(), at(2)])
    const duplicate = await compatibility(first.packageId, robot, outside)
    await db.query("INSERT INTO compatibility_confirmations(compatibility_id,user_id,evidence_id,verdict,status,created_at) VALUES ($1,$2,$3,'CONFIRMED','ACCEPTED',$4)", [duplicate, reviewer, randomUUID(), at(2)])
    assert.equal((await metrics()).reports, 1, 'same person/project/robot and self reports excluded')
    await db.query("UPDATE compatibility_confirmations SET status='WITHDRAWN' WHERE user_id=$1", [reviewer])
    assert.equal((await metrics()).reports, 0)
    await db.query("INSERT INTO entity_claims(entity_id,claimant_id,status,proof_url,verification_method,checked_at,created_at) VALUES ($1,$2,'VERIFIED','https://example.test/proof','DNS_TXT_MANUFACTURER',$3,$3)", [company, outside, at(1)])
    assert.equal((await metrics()).manufacturers, 1)
    await db.query("UPDATE registry_users SET status='SUSPENDED' WHERE id=$1", [outside])
    assert.equal((await metrics()).projects, 0, 'suspended users are not external participants')
    await db.query("UPDATE registry_users SET status='ACTIVE' WHERE id=$1", [outside])
    await db.query('UPDATE entities SET archived_at=now() WHERE id=$1', [first.id])
    result = await metrics()
    assert.equal(result.projects, 2)
    assert.equal(result.covered, 0)
    await db.query("UPDATE entities SET publication_status='DRAFT' WHERE id=$1", [robot])
    assert.equal((await metrics()).projects, 0, 'hidden cohort robot does not contribute')
    console.log('Pilot metrics: real table constraints, exclusions, cohort, unique projects/people, privacy states and windows passed')
  } finally {
    if (created && /^pilot_test_[0-9a-f]{32}$/.test(schema)) await db.query(`DROP SCHEMA "${schema}" CASCADE`)
    await db.end()
  }
}
main().catch(error => { console.error('Pilot metrics fixture test failed:', error instanceof Error ? error.message : 'Unknown error'); process.exitCode = 1 })
