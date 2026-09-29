import { adminApiDenied } from '../../../../../lib/admin-api-auth'
import { prisma } from '@robotspace/db'

export async function POST(request: Request) {
  const denied = await adminApiDenied()
  if (denied) return denied
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return Response.json({ error: 'Invalid request' }, { status: 400 })
  if (body.action === 'policy') {
    const { daily, monthly, enabled } = body
    if (typeof enabled !== 'boolean' || ![daily, monthly].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1000)) return Response.json({ error: 'Limits must be USD amounts between 0 and 1000' }, { status: 400 })
    await prisma.$executeRaw`UPDATE ai_budget_policy SET enabled = ${enabled}, daily_micros = ${Math.floor(daily * 1000000)}, monthly_micros = ${Math.floor(monthly * 1000000)}, updated_at = now() WHERE id = 1`
    return Response.json({ ok: true })
  }
  if (body.action === 'price') {
    const { modelId, input, output, source } = body
    if (typeof modelId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(modelId) || ![input, output].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0.000001 && n <= 10000) || typeof source !== 'string' || source.length > 1000) return Response.json({ error: 'Invalid model or tariff' }, { status: 400 })
    try { const url = new URL(source); if (url.protocol !== 'https:' || url.username || url.password) throw new Error() }
    catch { return Response.json({ error: 'Pricing source must be an HTTPS URL without credentials' }, { status: 400 }) }
    if (!await prisma.ai_models.findUnique({ where: { id: modelId } })) return Response.json({ error: 'Unknown model' }, { status: 404 })
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM ai_budget_policy WHERE id = 1 FOR UPDATE`
      await tx.$executeRaw`INSERT INTO ai_budget_prices(model_id, input_per_million, output_per_million, source_url, verified_at, valid_until)
        VALUES (${modelId}::uuid, ${input}, ${output}, ${source}, now(), now() + interval '30 days')
        ON CONFLICT (model_id) DO UPDATE SET input_per_million = EXCLUDED.input_per_million, output_per_million = EXCLUDED.output_per_million, source_url = EXCLUDED.source_url, verified_at = now(), valid_until = now() + interval '30 days'`
    })
    return Response.json({ ok: true })
  }
  return Response.json({ error: 'Unknown action' }, { status: 400 })
}
