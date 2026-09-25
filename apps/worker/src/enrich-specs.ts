/**
 * Enhanced Wikidata ingestion — fetch specs (payload, reach, DOF, weight)
 * Uses entity data API for detailed claims
 */

import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL! })

async function ingest() {
  // Get robots without specs
  const { rows: robots } = await pool.query(
    `SELECT rp.robot_entity_id, rp.canonical_name
     FROM robot_public_projections rp
     LEFT JOIN field_assertions fa ON fa.entity_id = rp.robot_entity_id AND fa.field_key = 'payload_kg'
     WHERE fa.id IS NULL
     LIMIT 20`
  )

  console.log(`[worker] Enriching ${robots.length} robots with specs...`)

  for (const robot of robots) {
    const name = robot.canonical_name
    // Search Wikidata for this robot
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&format=json`
    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': 'RobotSpace-Bot/1.0' },
    })
    const searchData = await searchRes.json() as any
    const qid = searchData.search?.[0]?.id

    if (!qid) continue

    // Fetch entity data with claims
    const entityUrl = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`
    const entityRes = await fetch(entityUrl)
    const entityData = await entityRes.json() as any
    const claims = entityData.entities?.[qid]?.claims || {}

    // Extract specs
    const specMap: Record<string, any> = {
      'P2067': { key: 'payload_kg', parse: (v: any) => v.amount ? parseFloat(v.amount) : null },
      'P2048': { key: 'height_m', parse: (v: any) => v.amount ? parseFloat(v.amount) : null },
      'P2049': { key: 'width_m', parse: (v: any) => v.amount ? parseFloat(v.amount) : null },
      'P2052': { key: 'speed_ms', parse: (v: any) => v.amount ? parseFloat(v.amount) : null },
    }

    for (const [propId, spec] of Object.entries(specMap)) {
      const claim = claims[propId]
      if (!claim?.[0]) continue
      const value = spec.parse(claim[0].mainsnak?.datavalue?.value)
      if (value === null || value === undefined) continue

      // Create field assertion
      await pool.query(
        `INSERT INTO field_assertions (entity_type, entity_id, field_key, normalized_value_json, raw_value_json, source_id, observed_at, evidence_confidence, assertion_status)
         VALUES ('ROBOT', $1, $2, $3::jsonb, $4::jsonb, 'wikidata', now(), $5, 'ACCEPTED')
         ON CONFLICT DO NOTHING`,
        [robot.robot_entity_id, spec.key, JSON.stringify({ value }), JSON.stringify({ raw: value }), 0.65]
      )
    }

    // Update canonical field
    if (specMap['P2067']) {
      await pool.query(
        `UPDATE robot_public_projections SET last_verified_at = now() WHERE robot_entity_id = $1`,
        [robot.robot_entity_id]
      )
    }
  }

  console.log('[worker] Spec enrichment complete')
  await pool.end()
}

ingest().catch(e => { console.error(e); process.exit(1) })
