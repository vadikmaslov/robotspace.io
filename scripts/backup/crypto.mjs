import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { appendFile, open, readFile, stat, unlink } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'

const MAGIC = Buffer.from('RSBACKUP1')
const HEADER_SIZE = MAGIC.length + 12
export async function readKey(filename) {
  const info = await stat(filename)
  if (process.platform !== 'win32' && (info.mode & 0o077)) throw new Error('Backup key permissions must be 600')
  const key = await readFile(filename)
  if (key.length !== 32) throw new Error('Backup key must contain 32 bytes')
  return key
}
export async function sha256(filename) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filename)) hash.update(chunk)
  return hash.digest('hex')
}
export async function encryptBackup(source, target, key) {
  const nonce = randomBytes(12)
  const header = Buffer.concat([MAGIC, nonce])
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  cipher.setAAD(header)
  const handle = await open(target, 'wx', 0o600)
  try {
    await handle.writeFile(header)
    await handle.close()
    await pipeline(createReadStream(source), cipher, createWriteStream(target, { flags: 'a' }))
    await appendFile(target, cipher.getAuthTag())
  } catch (error) {
    await handle.close().catch(() => undefined)
    await unlink(target).catch(() => undefined)
    throw error
  }
}
export async function decryptBackup(source, target, key) {
  const handle = await open(source, 'r')
  let decipher
  let size
  try {
    size = (await handle.stat()).size
    if (size <= HEADER_SIZE + 16) throw new Error('Truncated backup')
    const header = Buffer.alloc(HEADER_SIZE)
    const tag = Buffer.alloc(16)
    await handle.read(header, 0, header.length, 0)
    await handle.read(tag, 0, tag.length, size - 16)
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Unknown backup format')
    decipher = createDecipheriv('aes-256-gcm', key, header.subarray(MAGIC.length))
    decipher.setAAD(header)
    decipher.setAuthTag(tag)
  } finally { await handle.close() }
  // Never expose unauthenticated plaintext as the requested destination.
  const temporary = `${target}.${randomBytes(8).toString('hex')}.partial`
  try {
    await pipeline(createReadStream(source, { start: HEADER_SIZE, end: size - 17 }), decipher, createWriteStream(temporary, { flags: 'wx', mode: 0o600 }))
    // link is no-clobber, unlike rename. Both files are in the same directory.
    const { link } = await import('node:fs/promises')
    await link(temporary, target)
  } finally { await unlink(temporary).catch(() => undefined) }
}
