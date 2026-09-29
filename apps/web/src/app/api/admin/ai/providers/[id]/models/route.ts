import { adminApiDenied } from '../../../../../../../lib/admin-api-auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@robotspace/db'
import { decryptCredential } from '../../../../../../../lib/credential-storage'
import { safeExternalFetch } from '../../../../../../../lib/safe-external-fetch'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await adminApiDenied()
  if (denied) return denied
  const { id } = await params

  try {
    // Get provider config
    const provider = await prisma.ai_providers.findUnique({ where: { id } })
    const cred = await prisma.ai_provider_credentials.findFirst({
      where: { provider_id: id },
      orderBy: { created_at: 'desc' },
    })

    if (!provider || !cred) {
      return NextResponse.json({ error: 'Provider or credentials not found' }, { status: 404 })
    }

    // Call provider's /models endpoint
    const baseUrl = provider.base_url || 'https://api.openai.com/v1'
    const apiKey = cred.api_key_plain

    if (!apiKey) {
      return NextResponse.json({ error: 'No API key' }, { status: 400 })
    }

    const endpoint = new URL('models', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString()
    const response = await safeExternalFetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${decryptCredential(apiKey)}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    })

    if (!response.ok) {
      return NextResponse.json({ error: `Provider returned ${response.status}` }, { status: 502 })
    }

    const data = await response.json() as { data?: Array<{ id: string }> }
    const models = (data.data || []).map((m: any) => ({ id: m.id, name: m.id }))

    return NextResponse.json({ models })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
