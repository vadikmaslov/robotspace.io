import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat, unlink } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { sha256 } from './crypto.mjs'
const require = createRequire(new URL('../../apps/web/package.json', import.meta.url))
const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3')
export const PREFIX = 'robotspace-backups/v1/'
const pattern = /^robotspace-\d{8}T\d{6}Z\.dump\.enc$/

export function storageConfig(env = process.env) {
  const endpoint = env.BACKUP_S3_ENDPOINT || env.S3_ENDPOINT
  const bucket = env.BACKUP_S3_BUCKET || env.S3_BUCKET
  const accessKeyId = env.BACKUP_S3_ACCESS_KEY_ID || env.S3_ACCESS_KEY_ID || env.S3_ACCESS_KEY
  const secretAccessKey = env.BACKUP_S3_SECRET_ACCESS_KEY || env.S3_SECRET_ACCESS_KEY || env.S3_SECRET_KEY
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) throw new Error('Backup S3 configuration is incomplete')
  const url = new URL(endpoint)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Backup endpoint must use HTTPS')
  const forcePathStyle = env.S3_FORCE_PATH_STYLE !== 'false'
  const client = new S3Client({ endpoint, region: env.BACKUP_S3_REGION || env.S3_REGION || 'us-east-1', forcePathStyle, credentials: { accessKeyId, secretAccessKey }, maxAttempts: 3 })
  function objectUrl(key) {
    const location = new URL(endpoint)
    if (!forcePathStyle) location.hostname = `${bucket}.${location.hostname}`
    location.pathname = `${location.pathname.replace(/\/$/, '')}/${forcePathStyle ? `${encodeURIComponent(bucket)}/` : ''}${key.split('/').map(encodeURIComponent).join('/')}`
    return location
  }
  return { client, bucket, objectUrl }
}
export async function assertPrivateStorage(store) {
  const key = `${PREFIX}privacy-check-${randomUUID()}`
  let created = false
  try {
    await store.client.send(new PutObjectCommand({ Bucket: store.bucket, Key: key, Body: 'RobotSpace privacy probe. No user data.', ACL: 'private', CacheControl: 'no-store' }))
    created = true
    await store.client.send(new HeadObjectCommand({ Bucket: store.bucket, Key: key }))
    const response = await fetch(store.objectUrl(key), { redirect: 'error', signal: AbortSignal.timeout(15000) })
    await response.body?.cancel()
    if (![401, 403].includes(response.status)) throw new Error('Anonymous backup read was not explicitly denied')
  } finally {
    if (created) await store.client.send(new DeleteObjectCommand({ Bucket: store.bucket, Key: key }))
  }
}
export function backupObjectKey(name) {
  if (!pattern.test(name)) throw new Error('Invalid backup filename')
  return PREFIX + name
}
export async function downloadBackup(store, name, target) {
  const response = await store.client.send(new GetObjectCommand({ Bucket: store.bucket, Key: backupObjectKey(name) }))
  if (response.Metadata?.['backup-format'] !== 'rsbackup-v1' || !/^[a-f0-9]{64}$/.test(response.Metadata?.sha256 ?? '')) {
    response.Body?.destroy()
    throw new Error('Missing backup integrity metadata')
  }
  // Reserve without overwriting a pre-existing local file.
  const { open } = await import('node:fs/promises')
  let handle
  try { handle = await open(target, 'wx', 0o600) }
  catch (error) { response.Body?.destroy(); throw error }
  try {
    await pipeline(response.Body, handle.createWriteStream())
    const checksum = await sha256(target)
    if (checksum !== response.Metadata.sha256) throw new Error('Downloaded backup checksum mismatch')
    return checksum
  } catch (error) {
    await handle.close().catch(() => undefined)
    await unlink(target).catch(() => undefined)
    throw error
  }
}
export async function uploadBackup(store, name, source, verifyTarget) {
  const checksum = await sha256(source)
  await store.client.send(new PutObjectCommand({ Bucket: store.bucket, Key: backupObjectKey(name), Body: createReadStream(source), ContentLength: (await stat(source)).size, ContentType: 'application/octet-stream', ACL: 'private', CacheControl: 'no-store', IfNoneMatch: '*', Metadata: { 'backup-format': 'rsbackup-v1', sha256: checksum } }))
  if (await downloadBackup(store, name, verifyTarget) !== checksum) throw new Error('Upload verification failed')
  await unlink(verifyTarget)
}
export async function pruneBackups(store, now = new Date()) {
  let continuation
  let deleted = 0
  do {
    const result = await store.client.send(new ListObjectsV2Command({ Bucket: store.bucket, Prefix: PREFIX, ContinuationToken: continuation }))
    for (const object of result.Contents ?? []) {
      if (!object.Key?.startsWith(PREFIX) || !pattern.test(object.Key.slice(PREFIX.length)) || !object.LastModified || now - object.LastModified <= 30 * 86400000) continue
      const head = await store.client.send(new HeadObjectCommand({ Bucket: store.bucket, Key: object.Key }))
      if (head.Metadata?.['backup-format'] !== 'rsbackup-v1') continue
      await store.client.send(new DeleteObjectCommand({ Bucket: store.bucket, Key: object.Key }))
      deleted++
    }
    continuation = result.IsTruncated ? result.NextContinuationToken : undefined
  } while (continuation)
  return deleted
}
