/**
 * Phase 4A: Encryption Service — AES-256-GCM with keyring
 * 
 * Keys NEVER stored in DB. Ciphertext stores key_id/version, nonce, auth tag.
 * Key rotation: add new key → batch re-encrypt → verify → retire old key.
 */

import crypto from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32 // bytes
const IV_LENGTH = 12  // bytes (recommended for GCM)
const TAG_LENGTH = 16 // bytes

export interface KeyringEntry {
  id: string
  key: string // base64-encoded raw key bytes
}

export interface Keyring {
  active: KeyringEntry
  previous: KeyringEntry[]
}

export interface EncryptedBlob {
  ciphertext: Buffer
  nonceAuthTag: Buffer
  keyVersion: string
}

// Global keyring instance — initialized at startup
let keyring: Keyring | null = null

/**
 * Load keyring from environment variable at startup
 */
export function loadKeyring(): Keyring {
  if (keyring) return keyring

  const raw = process.env.INTEGRATION_CREDENTIALS_KEYRING
  if (!raw) throw new Error('INTEGRATION_CREDENTIALS_KEYRING not set')

  try {
    const parsed = JSON.parse(raw) as Keyring
    // Validate structure
    if (!parsed.active?.id || !parsed.active?.key) {
      throw new Error('Keyring missing active key')
    }
    if (!Array.isArray(parsed.previous)) {
      parsed.previous = []
    }
    // Validate key length (32 bytes = 44 chars in base64)
    const activeKey = Buffer.from(parsed.active.key, 'base64')
    if (activeKey.length !== KEY_LENGTH) {
      throw new Error(`Active key must be ${KEY_LENGTH} bytes, got ${activeKey.length}`)
    }
    keyring = parsed
    console.log(`[encryption] Keyring loaded: active=${parsed.active.id}, previous=${parsed.previous.length}`)
    return parsed
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error('INTEGRATION_CREDENTIALS_KEYRING is not valid JSON')
    }
    throw err
  }
}

/**
 * Encrypt plaintext using ACTIVE key.
 * Returns IV, ciphertext, auth tag, and key version for storage.
 */
export function encrypt(plaintext: string): EncryptedBlob {
  const kr = loadKeyring()
  const key = Buffer.from(kr.active.key, 'base64')
  const iv = crypto.randomBytes(IV_LENGTH)

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  // Combine nonce (iv) + auth tag for storage
  const nonceAuthTag = Buffer.concat([iv, authTag])

  return {
    ciphertext: encrypted,
    nonceAuthTag,
    keyVersion: kr.active.id,
  }
}

/**
 * Decrypt ciphertext using the key specified by keyVersion.
 * Tries active key first, then previous keys.
 */
export function decrypt(ciphertext: Buffer, nonceAuthTag: Buffer, keyVersion: string): string {
  const kr = loadKeyring()

  // Extract IV and auth tag from combined buffer
  const iv = nonceAuthTag.subarray(0, IV_LENGTH)
  const authTag = nonceAuthTag.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)

  // Find the right key
  const entry = keyVersion === kr.active.id
    ? kr.active
    : kr.previous.find(k => k.id === keyVersion)

  if (!entry) {
    throw new Error(`Decryption key not found: version=${keyVersion}. Keys in ring: active=${kr.active.id}, previous=[${kr.previous.map(k => k.id).join(',')}]`)
  }

  const key = Buffer.from(entry.key, 'base64')

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
  decipher.setAuthTag(authTag)

  try {
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return decrypted.toString('utf8')
  } catch (err) {
    throw new Error(`Decryption failed with key version=${keyVersion}: authentication tag mismatch or key corrupted`)
  }
}

/** Decrypt credentials stored by the web admin as `enc:v1:key:nonce+tag:ciphertext`. */
export function decryptStoredCredential(value: string): string {
  const parts = value.split(':')
  if (parts.length !== 5 || parts[0] !== 'enc' || parts[1] !== 'v1') {
    throw new Error('AI credential is not encrypted with the current format')
  }
  const keyVersion = Buffer.from(parts[2], 'base64url').toString('utf8')
  const nonceAuthTag = Buffer.from(parts[3], 'base64url')
  const ciphertext = Buffer.from(parts[4], 'base64url')
  if (nonceAuthTag.length !== IV_LENGTH + TAG_LENGTH) throw new Error('AI credential nonce is invalid')
  return decrypt(ciphertext, nonceAuthTag, keyVersion)
}

/**
 * Re-encrypt ciphertext with the ACTIVE key (rotation step).
 * Decrypts with old key, re-encrypts with active key.
 */
export function reEncrypt(ciphertext: Buffer, nonceAuthTag: Buffer, oldKeyVersion: string): EncryptedBlob {
  const plaintext = decrypt(ciphertext, nonceAuthTag, oldKeyVersion)
  return encrypt(plaintext)
}

/**
 * Generate a new random key for key rotation.
 * Returns base64-encoded key string.
 */
export function generateKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('base64')
}

/**
 * Validate that a base64 key is the correct length
 */
export function validateKey(base64Key: string): boolean {
  try {
    const key = Buffer.from(base64Key, 'base64')
    return key.length === KEY_LENGTH
  } catch {
    return false
  }
}

/**
 * Validate the master keyring at startup.
 * Checks that:
 * - keyring is valid JSON
 * - active key exists and is 32 bytes
 * - all previous keys are 32 bytes
 * - key IDs are unique
 */
export function validateKeyring(): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  try {
    const kr = loadKeyring()

    // Check active
    const activeKey = Buffer.from(kr.active.key, 'base64')
    if (activeKey.length !== KEY_LENGTH) {
      errors.push(`Active key must be ${KEY_LENGTH} bytes`)
    }

    // Check previous
    for (const prev of kr.previous) {
      const prevKey = Buffer.from(prev.key, 'base64')
      if (prevKey.length !== KEY_LENGTH) {
        errors.push(`Previous key "${prev.id}" must be ${KEY_LENGTH} bytes`)
      }
    }

    // Check unique IDs
    const allIds = new Set([kr.active.id, ...kr.previous.map(k => k.id)])
    if (allIds.size !== 1 + kr.previous.length) {
      errors.push('Duplicate key IDs detected in keyring')
    }

    return { valid: errors.length === 0, errors }
  } catch (err) {
    return { valid: false, errors: [err instanceof Error ? err.message : 'Unknown error'] }
  }
}
