/**
 * V2 Wikidata ingestion — proper robot taxonomy
 * Includes: industrial, humanoid, service, medical, logistics, agricultural, space
 */

import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL! })

const ROBOT_CATEGORIES: Record<string, { qid: string; label: string }> = {
  industrial:  { qid: 'Q1758394', label: 'Industrial' },
  humanoid:    { qid: 'Q1156719', label: 'Humanoid' },
  service:     { qid: 'Q2923144', label: 'Service' },
  medical:     { qid: 'Q2424826', label: 'Medical' },
  logistics:   { qid: 'Q1632314', label: 'Logistics' },
  agriculture: { qid: 'Q977159',  label: 'Agriculture' },
  space:       { qid: 'Q6498786', label: 'Space' },
  military:    { qid: 'Q1058487', label: 'Defense' },
  education:   { qid: 'Q29880508', label: 'Education' },
  other:       { qid: 'Q11012',   label: 'Other' },
}

async function ingest() {
  console.log('[worker] V2 Wikidata ingestion — all robot types')

  // Clear old data
  await pool.query('DELETE FROM robots')
  await pool.query('DELETE FROM robot_public_projections')
  await pool.query('DELETE FROM entities WHERE entity_type = \'ROBOT\'')

  let total = 0

  for (const [slug, cat] of Object.entries(ROBOT_CATEGORIES)) {
    console.log(`[worker] Fetching: ${cat.label}...`)

    const query = `
      SELECT DISTINCT ?item ?itemLabel ?manufacturerLabel ?countryLabel WHERE {
        ?item wdt:P31/wdt:P279* wd:${cat.qid}.
        OPTIONAL { ?item wdt:P176 ?manufacturer. }
        OPTIONAL { ?item wdt:P17 ?country. }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
      LIMIT 30
    `

    const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`
    const res = await fetch(url, { headers: { 'User-Agent': 'RobotSpace-Bot/1.0' } })
    const data = await res.json() as any

    let catCount = 0
    for (const b of data.results?.bindings || []) {
      const qid = b.item?.value?.split('/').pop()
      const name = b.itemLabel?.value
      const manufacturer = b.manufacturerLabel?.value
      const country = b.countryLabel?.value

      if (!qid || !name) continue

      const robotSlug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

      try {
        // Create entity
        const ent = await pool.query(
          `INSERT INTO entities (entity_type, slug, publication_status) VALUES ('ROBOT', $1, 'PUBLISHED') ON CONFLICT (slug) DO NOTHING RETURNING id`,
          [robotSlug]
        )
        const entityId = ent.rows[0]?.id
        if (!entityId) continue

        // Create robot
        await pool.query(`INSERT INTO robots (entity_id) VALUES ($1) ON CONFLICT DO NOTHING`, [entityId])

        // Create manufacturer company if not exists
        if (manufacturer) {
          const mfrSlug = manufacturer.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
          const mfr = await pool.query(
            `INSERT INTO entities (entity_type, slug, publication_status) VALUES ('COMPANY', $1, 'PUBLISHED') ON CONFLICT (slug) DO NOTHING RETURNING id`,
            [mfrSlug]
          )
          const mfrId = mfr.rows[0]?.id
          if (mfrId) {
            await pool.query(`INSERT INTO companies (entity_id) VALUES ($1) ON CONFLICT DO NOTHING`, [mfrId])
            await pool.query(
              `INSERT INTO company_public_projections (company_entity_id, canonical_name) VALUES ($1, $2) ON CONFLICT (company_entity_id) DO NOTHING`,
              [mfrId, manufacturer]
            )
            // Link robot to manufacturer
            await pool.query(
              `INSERT INTO robot_company_relations (robot_entity_id, company_entity_id, relation) VALUES ($1, $2, 'MANUFACTURES') ON CONFLICT DO NOTHING`,
              [entityId, mfrId]
            )
          }
        }

        // Create projection
        await pool.query(
          `INSERT INTO robot_public_projections (robot_entity_id, canonical_name, lifecycle_status, official_url)
           VALUES ($1, $2, 'ACTIVE', $3)
           ON CONFLICT (robot_entity_id) DO NOTHING`,
          [entityId, name, `https://www.wikidata.org/wiki/${qid}`]
        )

        catCount++
        total++
      } catch (e: any) {
        if (e.code !== '23505') console.error(`  Error: ${name} — ${e.message}`)
      }
    }
    console.log(`[worker] ${cat.label}: ${catCount} robots`)
  }

  console.log(`[worker] Done: ${total} robots total`)
  await pool.end()
}

ingest().catch(e => { console.error(e); process.exit(1) })
