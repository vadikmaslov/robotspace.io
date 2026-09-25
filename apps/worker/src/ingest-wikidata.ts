/**
 * Simplified Worker — data ingestion loop
 * 1. Creates source record in DB
 * 2. Calls Wikidata API
 * 3. Parses robots
 * 4. Inserts into entities, robots, robot_public_projections
 * 5. No Prisma client dependency — raw SQL via pg
 */

import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL! })

async function ingestWikidata() {
  console.log('[worker] Starting Wikidata ingestion...')

  // Check/create source
  const sourceQuery = `
    INSERT INTO sources (key, source_type, status, legal_status, tier)
    VALUES ('wikidata', 'SPARQL', 'ACTIVE', 'ALLOWED', 'B')
    ON CONFLICT (key) DO UPDATE SET status = 'ACTIVE'
    RETURNING key
  `
  const source = await pool.query(sourceQuery)
  console.log('[worker] Source registered:', source.rows[0].key)

  // Fetch robotics items from Wikidata SPARQL
  const sparqlQuery = `
    SELECT DISTINCT ?item ?itemLabel ?manufacturerLabel WHERE {
      ?item wdt:P31/wdt:P279* wd:Q11012.
      ?item wdt:P176 ?manufacturer.
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    LIMIT 50
  `
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparqlQuery)}`
  console.log('[worker] Fetching Wikidata...')
  const response = await fetch(url, {
    headers: { 'User-Agent': 'RobotSpace-Bot/1.0 (https://robotspace.io)' },
  })
  const data = await response.json() as any

  let inserted = 0
  for (const binding of data.results?.bindings || []) {
    const qid = binding.item?.value?.split('/').pop()
    const name = binding.itemLabel?.value
    const manufacturer = binding.manufacturerLabel?.value

    if (!qid || !name) continue

    // Create entity
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    try {
      const entity = await pool.query(
        `INSERT INTO entities (entity_type, slug, publication_status)
         VALUES ('ROBOT', $1, 'PUBLISHED')
         ON CONFLICT (slug) DO UPDATE SET publication_status = 'PUBLISHED'
         RETURNING id`,
        [slug]
      )

      // Create robot
      await pool.query(
        `INSERT INTO robots (entity_id) VALUES ($1) ON CONFLICT (entity_id) DO NOTHING`,
        [entity.rows[0].id]
      )

      // Create public projection
      await pool.query(
        `INSERT INTO robot_public_projections (robot_entity_id, canonical_name, lifecycle_status)
         VALUES ($1, $2, 'ACTIVE')
         ON CONFLICT (robot_entity_id) DO UPDATE SET canonical_name = $2`,
        [entity.rows[0].id, name]
      )

      inserted++
    } catch (e: any) {
      if (e.code !== '23505') console.error('[worker] Error inserting', name, e.message)
    }
  }

  console.log(`[worker] Done: ${inserted} robots inserted`)
  await pool.end()
}

ingestWikidata().catch(e => { console.error(e); process.exit(1) })
