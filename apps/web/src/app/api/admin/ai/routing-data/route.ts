import { NextResponse } from 'next/server'
import { prisma } from '@robotspace/db'
import { AGENT_ROUTING_RULES } from '@robotspace/ai'

export async function GET() {
  try {
    const providers = await prisma.ai_providers.findMany({ where: { enabled: true } })
    let allModels: any[] = []
    for (const p of providers) {
      const m = await prisma.ai_models.findMany({ where: { provider_id: p.id, enabled: true } })
      allModels.push(...m.map(model => ({ ...model, provider_name: p.display_name })))
    }

    const routes = await prisma.ai_routes.findMany({ orderBy: [{ scope: 'asc' }, { rank: 'asc' }] })
    const simple = routes.filter(r => r.scope === 'SIMPLE_DEFAULT' && r.enabled)
    const complex = routes.filter(r => r.scope === 'COMPLEX_DEFAULT' && r.enabled)

    return NextResponse.json({ models: allModels, simple, complex, agentRules: AGENT_ROUTING_RULES })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
