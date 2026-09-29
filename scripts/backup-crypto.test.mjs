import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { encryptBackup, decryptBackup, sha256 } from './backup/crypto.mjs'

test('encrypted backup round trip, tamper detection, wrong key and no overwrite', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'robotspace-backup-test-'))
  const file = name => path.join(root, name)
  try {
    const plaintext = randomBytes(2 * 1024 * 1024)
    const key = randomBytes(32)
    await writeFile(file('source'), plaintext)
    await encryptBackup(file('source'), file('encrypted'), key)
    assert.notDeepEqual(await readFile(file('encrypted')), plaintext)
    await decryptBackup(file('encrypted'), file('restored'), key)
    assert.equal(await sha256(file('source')), await sha256(file('restored')))
    await assert.rejects(decryptBackup(file('encrypted'), file('wrong'), randomBytes(32)))
    await assert.rejects(access(file('wrong')))
    await assert.rejects(decryptBackup(file('encrypted'), file('restored'), key))
    assert.deepEqual(await readFile(file('restored')), plaintext)
    const damaged = await readFile(file('encrypted'))
    damaged[100] ^= 1
    await writeFile(file('damaged'), damaged)
    await assert.rejects(decryptBackup(file('damaged'), file('bad'), key))
    await assert.rejects(access(file('bad')))
    await assert.rejects(encryptBackup(file('source'), file('encrypted'), key))
  } finally { await rm(root, { recursive: true, force: true }) }
})
