import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Readable } from 'node:stream'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, access, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PREFIX, storageConfig, backupObjectKey, downloadBackup, pruneBackups, assertPrivateStorage } from './backup/storage.mjs'

test('S3 configuration requires HTTPS and strict dated names', () => {
  const env = { S3_ENDPOINT: 'https://storage.example.test', S3_BUCKET: 'test', S3_ACCESS_KEY: 'test', S3_SECRET_KEY: 'test' }
  const store = storageConfig(env)
  assert.equal(store.objectUrl('a/b').href, 'https://storage.example.test/test/a/b')
  store.client.destroy()
  assert.throws(() => storageConfig({ ...env, S3_ENDPOINT: 'http://storage.example.test' }))
  assert.throws(() => storageConfig({}))
  assert.throws(() => backupObjectKey('../images/photo.jpg'))
  assert.equal(backupObjectKey('robotspace-20260929T120000Z.dump.enc'), PREFIX + 'robotspace-20260929T120000Z.dump.enc')
})

test('readback detects corruption and never overwrites an existing local file', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'robotspace-storage-test-'))
  const target = path.join(root, 'copy')
  const body = Buffer.from('encrypted fixture')
  let checksum = createHash('sha256').update(body).digest('hex')
  const store = { bucket: 'test', client: { send: async () => ({ Body: Readable.from(body), Metadata: { 'backup-format': 'rsbackup-v1', sha256: checksum } }) } }
  const name = 'robotspace-20260929T120000Z.dump.enc'
  try {
    await downloadBackup(store, name, target)
    assert.deepEqual(await readFile(target), body)
    await assert.rejects(downloadBackup(store, name, target))
    assert.deepEqual(await readFile(target), body)
    checksum = '0'.repeat(64)
    await assert.rejects(downloadBackup(store, name, path.join(root, 'bad')))
    await assert.rejects(access(path.join(root, 'bad')))
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('retention deletes only expired marked backups within own prefix across pages', async () => {
  const deleted = []
  const old = new Date('2026-07-01')
  const recent = new Date('2026-09-28')
  const key = day => `${PREFIX}robotspace-2026070${day}T120000Z.dump.enc`
  const store = { bucket: 'test', client: { send: async command => {
    switch (command.constructor.name) {
      case 'ListObjectsV2Command': return command.input.ContinuationToken
        ? { Contents: [{ Key: key(4), LastModified: old }] }
        : { IsTruncated: true, NextContinuationToken: 'next', Contents: [
          { Key: key(1), LastModified: old }, { Key: key(2), LastModified: recent },
          { Key: key(3), LastModified: old }, { Key: 'images/photo.jpg', LastModified: old },
          { Key: PREFIX + 'unknown.txt', LastModified: old } ] }
      case 'HeadObjectCommand': return { Metadata: command.input.Key === key(3) ? {} : { 'backup-format': 'rsbackup-v1' } }
      case 'DeleteObjectCommand': deleted.push(command.input.Key); return {}
      default: throw new Error('Unexpected command')
    }
  } } }
  assert.equal(await pruneBackups(store, new Date('2026-09-29')), 2)
  assert.deepEqual(deleted, [key(1), key(4)])
})

test('privacy probe fails closed for public/ambiguous access and removes only its canary', async () => {
  const originalFetch = globalThis.fetch
  const deleted = []
  const store = { bucket: 'test', objectUrl: key => new URL('https://example.test/' + key), client: { send: async command => {
    if (command.constructor.name === 'PutObjectCommand') assert.equal(command.input.ACL, 'private')
    if (command.constructor.name === 'DeleteObjectCommand') deleted.push(command.input.Key)
    return {}
  } } }
  try {
    for (const status of [200, 404, 500]) {
      globalThis.fetch = async () => new Response('', { status })
      await assert.rejects(assertPrivateStorage(store))
    }
    globalThis.fetch = async () => new Response('', { status: 403 })
    await assertPrivateStorage(store)
    assert.equal(deleted.length, 4)
    assert.ok(deleted.every(key => key.startsWith(PREFIX + 'privacy-check-')))
  } finally { globalThis.fetch = originalFetch }
})
