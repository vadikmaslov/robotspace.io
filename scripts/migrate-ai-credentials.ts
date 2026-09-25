import { prisma } from '../packages/db/src/index'
import { encryptCredential, isEncryptedCredential } from '../apps/web/src/lib/credential-storage'

async function main() {
  const credentials = await prisma.ai_provider_credentials.findMany({
    where: { api_key_plain: { not: null } },
    select: { id: true, api_key_plain: true },
  })

  let migrated = 0
  let skipped = 0
  for (const credential of credentials) {
    if (!credential.api_key_plain || isEncryptedCredential(credential.api_key_plain)) {
      skipped++
      continue
    }

    await prisma.ai_provider_credentials.update({
      where: { id: credential.id },
      data: { api_key_plain: encryptCredential(credential.api_key_plain) },
    })
    migrated++
  }

  console.log(`AI credential migration complete: ${migrated} encrypted, ${skipped} already encrypted`)
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'AI credential migration failed')
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
