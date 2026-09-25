/**
 * Seed demo robots with real specs, manufacturers, categories
 */

import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL! })

const ROBOTS = [
  { name: 'Atlas', slug: 'atlas', maker: 'Boston Dynamics', category: 'Humanoid', payload: 120, reach: 1800, weight: 89, dof: 28, speed: 2.5, repeat: null, desc: 'Full-body humanoid robot for dynamic mobility and manipulation.' },
  { name: 'Spot', slug: 'spot', maker: 'Boston Dynamics', category: 'Service', payload: 14, reach: null, weight: 32, dof: 12, speed: 1.6, repeat: null, desc: 'Agile mobile robot for industrial inspection and data collection.' },
  { name: 'Stretch', slug: 'stretch', maker: 'Boston Dynamics', category: 'Logistics', payload: 23, reach: 2100, weight: 24, dof: 7, speed: null, repeat: null, desc: 'Mobile case-handling robot for warehouse automation.' },
  { name: 'UR5e', slug: 'ur5e', maker: 'Universal Robots', category: 'Industrial', payload: 5, reach: 850, weight: 18.4, dof: 6, speed: null, repeat: 0.03, desc: 'Collaborative 6-axis robot arm for light assembly and pick-and-place.' },
  { name: 'UR10e', slug: 'ur10e', maker: 'Universal Robots', category: 'Industrial', payload: 12.5, reach: 1300, weight: 33.5, dof: 6, speed: null, repeat: 0.05, desc: 'Collaborative robot arm for heavy-duty tasks and packaging.' },
  { name: 'UR20', slug: 'ur20', maker: 'Universal Robots', category: 'Industrial', payload: 20, reach: 1750, weight: 64, dof: 6, speed: null, repeat: 0.05, desc: 'Next-gen collaborative robot with 20kg payload for palletizing and welding.' },
  { name: 'KUKA KR 1000 titan', slug: 'kuka-kr-1000-titan', maker: 'KUKA', category: 'Industrial', payload: 1000, reach: 3200, weight: 4700, dof: 6, speed: null, repeat: 0.1, desc: 'Heavy-duty 6-axis industrial robot for foundry and construction.' },
  { name: 'KUKA KR 6 R900', slug: 'kuka-kr-6-r900', maker: 'KUKA', category: 'Industrial', payload: 6, reach: 900, weight: 52, dof: 6, speed: null, repeat: 0.03, desc: 'Compact 6-axis industrial robot for arc welding and handling.' },
  { name: 'ABB IRB 6700', slug: 'abb-irb-6700', maker: 'ABB', category: 'Industrial', payload: 235, reach: 3050, weight: 1225, dof: 6, speed: null, repeat: 0.05, desc: 'High-performance industrial robot for spot welding and material handling.' },
  { name: 'ABB IRB 1200', slug: 'abb-irb-1200', maker: 'ABB', category: 'Industrial', payload: 7, reach: 900, weight: 54, dof: 6, speed: null, repeat: 0.025, desc: 'Compact flexible industrial robot for small parts assembly.' },
  { name: 'FANUC M-2000iA', slug: 'fanuc-m2000ia', maker: 'FANUC', category: 'Industrial', payload: 2300, reach: 3700, weight: 8900, dof: 6, speed: null, repeat: 0.1, desc: 'Worlds strongest 6-axis robot for heavy lifting applications.' },
  { name: 'Digit', slug: 'digit', maker: 'Agility Robotics', category: 'Humanoid', payload: 16, reach: null, weight: 45, dof: 16, speed: 1.5, repeat: null, desc: 'Bipedal robot for last-mile logistics and warehouse operations.' },
]

async function seed() {
  console.log('[seed] Seeding demo robots with specs...')

  for (const r of ROBOTS) {
    // Create entity
    const ent = await pool.query(
      `INSERT INTO entities (entity_type, slug, publication_status) VALUES ('ROBOT', $1, 'PUBLISHED') ON CONFLICT (slug) DO UPDATE SET publication_status = 'PUBLISHED' RETURNING id`,
      [r.slug]
    )
    const entityId = ent.rows[0].id

    // Create robot
    await pool.query(`INSERT INTO robots (entity_id) VALUES ($1) ON CONFLICT DO NOTHING`, [entityId])

    // Find manufacturer
    const mfr = await pool.query(
      `SELECT e.id FROM entities e WHERE e.slug = $1`,
      [r.maker.toLowerCase().replace(/\s+/g, '-')]
    )
    const mfrId = mfr.rows[0]?.id
    if (mfrId) {
      await pool.query(
        `INSERT INTO robot_company_relations (robot_entity_id, company_entity_id, relation) VALUES ($1, $2, 'MANUFACTURES') ON CONFLICT DO NOTHING`,
        [entityId, mfrId]
      )
    }

    // Create projection with specs
    await pool.query(
      `INSERT INTO robot_public_projections (robot_entity_id, canonical_name, lifecycle_status, payload_kg, reach_mm, weight_kg, summary, last_verified_at)
       VALUES ($1, $2, 'ACTIVE', $3, $4, $5, $6, now())
       ON CONFLICT (robot_entity_id) DO UPDATE SET canonical_name = $2, payload_kg = $3, reach_mm = $4, weight_kg = $5, summary = $6`,
      [entityId, r.name, r.payload || null, r.reach || null, r.weight || null, r.desc]
    )

    console.log(`  ✓ ${r.name} (${r.category})`)
  }

  console.log(`[seed] Done: ${ROBOTS.length} robots`)
  await pool.end()
}

seed().catch(e => { console.error(e); process.exit(1) })
