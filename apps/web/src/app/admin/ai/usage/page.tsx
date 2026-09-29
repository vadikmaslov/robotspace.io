import { prisma } from '@robotspace/db'
import { auth } from '../../../../auth'
import { redirect } from 'next/navigation'
import BudgetControls from './controls'

export const dynamic = 'force-dynamic'
const usd = (micros: bigint) => (Number(micros) / 1000000).toFixed(6)
export default async function AdminAIUsagePage() {
  if ((await auth())?.user?.sessionKind !== 'admin') redirect('/admin/login')
  const [policy] = await prisma.$queryRaw<{ enabled: boolean; daily_micros: bigint; monthly_micros: bigint }[]>`SELECT * FROM ai_budget_policy WHERE id = 1`
  const [usage] = await prisma.$queryRaw<{ daily: bigint; monthly: bigint; unresolved: bigint }[]>`
    SELECT COALESCE(SUM(charged_micros) FILTER (WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' OR state IN ('RESERVED','UNCERTAIN')),0)::bigint daily,
      COALESCE(SUM(charged_micros) FILTER (WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' OR state IN ('RESERVED','UNCERTAIN')),0)::bigint monthly,
      COALESCE(SUM(charged_micros) FILTER (WHERE state IN ('RESERVED','UNCERTAIN')),0)::bigint unresolved FROM ai_budget_attempts`
  const models = await prisma.$queryRaw<{ id: string; name: string; input: string | null; output: string | null; valid_until: Date | null }[]>`
    SELECT m.id, concat(p.display_name, ' / ', m.remote_model_id) name, b.input_per_million::text input, b.output_per_million::text output, b.valid_until
    FROM ai_models m LEFT JOIN ai_providers p ON p.id = m.provider_id LEFT JOIN ai_budget_prices b ON b.model_id = m.id ORDER BY name`
  const attempts = await prisma.$queryRaw<{ id: string; operation: string; state: string; charged_micros: bigint; created_at: Date; error_code: string | null }[]>`SELECT id, operation, state, charged_micros, created_at, error_code FROM ai_budget_attempts ORDER BY created_at DESC LIMIT 50`
  return <div className="space-y-8">
    <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text-heading)' }}>AI Usage</h1>
    <p>AI: {policy.enabled && process.env.AI_EMERGENCY_STOP !== 'true' ? 'enabled for priced models' : 'STOPPED'}. Limits use UTC calendar days/months.</p>
    <p>Daily budget used/reserved: ${usd(usage.daily)} / ${usd(policy.daily_micros)}. Monthly: ${usd(usage.monthly)} / ${usd(policy.monthly_micros)}.</p>
    <p>Unresolved reservations: ${usd(usage.unresolved)}. These remain charged against the budget until reviewed, including after a restart or month boundary.</p>
    <p className="text-sm">Conservative application estimates, not provider invoices. Historical requests before this guard had no reliable cost accounting and are excluded. Missing/expired tariffs block a model. Subscription fees and usage outside RobotSpace are not covered. Stopping prevents new reservations; already admitted calls may finish.</p>
    <BudgetControls key={`${policy.enabled}-${policy.daily_micros}-${policy.monthly_micros}`} enabled={policy.enabled} daily={Number(policy.daily_micros)/1000000} monthly={Number(policy.monthly_micros)/1000000} models={models.map(m => ({ id: m.id, name: m.name }))} />
    <section className="space-y-2"><h2 className="text-xl">Tariffs</h2>{models.map(m => <p key={m.id} className="break-words">{m.name}: {m.valid_until && m.valid_until > new Date() ? `$${m.input} input / $${m.output} output per 1M; valid until ${m.valid_until.toISOString()}` : 'BLOCKED: tariff missing or expired'}</p>)}</section>
    <section className="space-y-2"><h2 className="text-xl">Latest 50 attempts</h2>{attempts.map(a => <p key={a.id} className="text-sm break-words">{a.created_at.toISOString()} | {a.operation} | {a.state} | ${usd(a.charged_micros)} {a.error_code ?? ''}</p>)}</section>
  </div>
}
