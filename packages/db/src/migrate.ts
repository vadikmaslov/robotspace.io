import crypto from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'

const migrationsDirectory = fileURLToPath(new URL('../migrations/', import.meta.url))

export async function runMigrations() {
  const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL
  if (!connectionString) throw new Error('DIRECT_DATABASE_URL or DATABASE_URL is required for migrations')

  const client = new Client({ connectionString })
  await client.connect()

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS robotspace_schema_migrations (
        name text PRIMARY KEY,
        checksum char(64) NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    const entries = await readdir(migrationsDirectory, { withFileTypes: true })
    const migrations = entries
      .filter(entry => entry.isDirectory() && /^\d+_/.test(entry.name))
      .map(entry => entry.name)
      .sort()

    for (const name of migrations) {
      const filename = path.join(migrationsDirectory, name, 'migration.sql')
      const sql = await readFile(filename, 'utf8')
      const checksum = crypto.createHash('sha256').update(sql).digest('hex')
      const previous = await client.query<{ checksum: string }>(
        'SELECT checksum FROM robotspace_schema_migrations WHERE name = $1',
        [name],
      )

      if (previous.rowCount) {
        if (previous.rows[0].checksum !== checksum) {
          throw new Error(`Migration checksum changed after application: ${name}`)
        }
        console.log(`Migration ${name}: already applied`)
        continue
      }

      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query(
          'INSERT INTO robotspace_schema_migrations (name, checksum) VALUES ($1, $2)',
          [name, checksum],
        )
        await client.query('COMMIT')
        console.log(`Migration ${name}: applied`)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
  } finally {
    await client.end()
  }
}

runMigrations().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Migration failed')
  process.exitCode = 1
})
