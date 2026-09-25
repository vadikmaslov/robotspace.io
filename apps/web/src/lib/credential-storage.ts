import crypto from 'node:crypto'

const PREFIX = 'enc:v1'
const KEY_LENGTH = 32
const IV_LENGTH = 12
const TAG_LENGTH = 16

type Keyring = {
  active: { id: string; key: string }
  previous: Array<{ id: string; key: string }>
}

/** Stores API credentials encrypted with the deployment keyring. */
export function encryptCredential(plaintext: string): string {
  const keyring = getKeyring()
  const key = decodeKey(keyring.active.key)
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_LENGTH })
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const nonceAuthTag = Buffer.concat([iv, cipher.getAuthTag()])

  return [
    PREFIX,
    Buffer.from(keyring.active.id, 'utf8').toString('base64url'),
    nonceAuthTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':')
}

export function decryptCredential(value: string): string {
  const parts = value.split(':')
  if (parts.length !== 5 || `${parts[0]}:${parts[1]}` !== PREFIX) {
    throw new Error('AI credential is not encrypted. Run the credential migration before using this provider.')
  }

  try {
    const keyVersion = Buffer.from(parts[2], 'base64url').toString('utf8')
    const keyring = getKeyring()
    const entry = keyring.active.id === keyVersion
      ? keyring.active
      : keyring.previous.find(candidate => candidate.id === keyVersion)
    if (!entry) throw new Error('Credential key version is not in the configured keyring')

    const nonceAuthTag = Buffer.from(parts[3], 'base64url')
    if (nonceAuthTag.length !== IV_LENGTH + TAG_LENGTH) throw new Error('Invalid encrypted credential')
    const decipher = crypto.createDecipheriv('aes-256-gcm', decodeKey(entry.key), nonceAuthTag.subarray(0, IV_LENGTH), { authTagLength: TAG_LENGTH })
    decipher.setAuthTag(nonceAuthTag.subarray(IV_LENGTH))
    return Buffer.concat([decipher.update(Buffer.from(parts[4], 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    throw new Error('AI credential cannot be decrypted with the configured keyring')
  }
}

export function isEncryptedCredential(value: string): boolean {
  return value.startsWith(`${PREFIX}:`)
}

function getKeyring(): Keyring {
  const raw = process.env.INTEGRATION_CREDENTIALS_KEYRING
  if (!raw) throw new Error('INTEGRATION_CREDENTIALS_KEYRING is not set')

  try {
    const keyring = JSON.parse(raw) as Keyring
    if (!keyring.active?.id || !keyring.active?.key || !Array.isArray(keyring.previous)) throw new Error('Invalid keyring')
    decodeKey(keyring.active.key)
    keyring.previous.forEach(entry => decodeKey(entry.key))
    return keyring
  } catch {
    throw new Error('INTEGRATION_CREDENTIALS_KEYRING is invalid')
  }
}

function decodeKey(value: string): Buffer {
  const key = Buffer.from(value, 'base64')
  if (key.length !== KEY_LENGTH) throw new Error(`Credential key must be ${KEY_LENGTH} bytes`)
  return key
}
