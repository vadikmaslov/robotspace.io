import { mkdtemp, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { readKey, encryptBackup, decryptBackup } from './backup/crypto.mjs'
import { storageConfig, assertPrivateStorage, uploadBackup, downloadBackup, pruneBackups, backupObjectKey } from './backup/storage.mjs'

const [command, input, output] = process.argv.slice(2)
const keyFile = process.env.BACKUP_ENCRYPTION_KEY_FILE || '/opt/robotspace/shared/backup-encryption.key'
let store
let work
try {
  store = storageConfig()
  if (command === 'probe') {
    await assertPrivateStorage(store)
    console.log('Backup S3 access: authenticated access OK; anonymous read denied; probe removed')
  } else if (command === 'upload') {
    const filename = path.basename(input ?? '')
    backupObjectKey(`${filename}.enc`)
    if (!(await stat(input)).isFile()) throw new Error('Input must be a dump file')
    const key = await readKey(keyFile)
    await assertPrivateStorage(store)
    work = await mkdtemp(path.join(path.dirname(input), '.s3-backup-'))
    const encrypted = path.join(work, 'backup.enc')
    await encryptBackup(input, encrypted, key)
    await uploadBackup(store, `${filename}.enc`, encrypted, path.join(work, 'verify.enc'))
    const pruned = await pruneBackups(store)
    console.log(`Encrypted backup uploaded and downloaded checksum verified; expired owned objects removed: ${pruned}`)
  } else if (command === 'restore' && input && output) {
    backupObjectKey(input)
    work = await mkdtemp(path.join(path.dirname(output), '.s3-restore-'))
    const encrypted = path.join(work, 'download.enc')
    await downloadBackup(store, input, encrypted)
    await decryptBackup(encrypted, output, await readKey(keyFile))
    console.log('Backup downloaded, checksum and AES-GCM authentication verified; decrypted file ready')
  } else throw new Error('Usage: backup-s3.mjs probe | upload <dump> | restore <object-name> <new-local-dump>')
} catch (error) {
  // SDK messages can include private endpoint/credential context: log only code.
  console.error(`S3 backup failed (${error?.name ?? 'Error'}, HTTP ${error?.$metadata?.httpStatusCode ?? 'n/a'}); inspect configuration and permissions`)
  process.exitCode = 1
} finally {
  store?.client.destroy()
  if (work) await rm(work, { recursive: true, force: true }) // freshly generated private temp directory only
}
