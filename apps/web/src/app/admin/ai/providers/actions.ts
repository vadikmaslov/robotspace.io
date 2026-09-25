'use server'

import { prisma } from '@robotspace/db'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { encryptCredential } from '../../../../lib/credential-storage'

export async function saveProvider(formData: FormData) {
  const display_name = formData.get('display_name') as string
  const adapter_type = formData.get('adapter_type') as string
  const base_url = formData.get('base_url') as string || null
  const api_key = formData.get('api_key') as string

  if (!display_name || !adapter_type || !api_key) {
    throw new Error('Missing required fields')
  }

  try {
    const provider = await prisma.ai_providers.create({
      data: {
        adapter_type,
        display_name,
        base_url,
      },
    })

    await prisma.ai_provider_credentials.create({
      data: {
        provider_id: provider.id,
        api_key_plain: encryptCredential(api_key),
        last_4: api_key.slice(-4),
        status: 'ACTIVE',
      },
    })

    revalidatePath('/admin/ai/providers')
  } catch (e) {
    console.error('Failed to save provider:', e)
    throw new Error('Failed to save provider')
  }

  redirect('/admin/ai/providers')
}
