import { adminApiDenied } from '../../../../../lib/admin-api-auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@robotspace/db'
import { encryptCredential } from '../../../../../lib/credential-storage'

export async function POST(req: NextRequest) {
  const denied = await adminApiDenied()
  if (denied) return denied
  try {
    const body = await req.json()

    if (!body.display_name || !body.adapter_type || !body.api_key) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const provider = await prisma.ai_providers.create({
      data: {
        adapter_type: body.adapter_type,
        display_name: body.display_name,
        base_url: body.base_url || null,
      },
    })

    await prisma.ai_provider_credentials.create({
      data: {
        provider_id: provider.id,
        api_key_plain: encryptCredential(body.api_key),
        last_4: body.api_key.slice(-4),
        status: 'ACTIVE',
      },
    })

    return NextResponse.json({ success: true, id: provider.id }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
