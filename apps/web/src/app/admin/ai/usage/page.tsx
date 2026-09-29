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
  const attempts = await prisma.$queryRaw<{ id: string; operation: string; state: string; billing_mode: string; charged_micros: bigint; created_at: Date; error_code: string | null }[]>`SELECT id, operation, state, billing_mode, charged_micros, created_at, error_code FROM ai_budget_attempts ORDER BY created_at DESC LIMIT 50`
  const alerts = await prisma.$queryRaw<{ id: string; reason: string; state: string; attempts: number; created_at: Date; sent_at: Date | null }[]>`SELECT id, reason, state, attempts, created_at, sent_at FROM ai_admin_alerts ORDER BY created_at DESC LIMIT 10`
  return <div className="space-y-8">
    <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text-heading)' }}>AI Usage</h1>
    <p>AI: {policy.enabled && process.env.AI_EMERGENCY_STOP !== 'true' ? 'SUBSCRIPTION ONLY' : 'STOPPED'}. Direct paid APIs are blocked, including fallback.</p>
    <p>Alibaba manages the subscription quota in Credits. Requests here are not reported as free or converted to USD. When quota exhaustion is reported, AI stops and an admin email is queued. After verifying quota renewal, enable Allow AI calls below.</p>
    <p className="text-sm">Existing in-flight requests may finish. Subscription renewal, top-ups and usage in other applications remain outside this guard. UTC USD ledger (inactive paid mode): daily ${usd(usage.daily)}, monthly ${usd(usage.monthly)}, unresolved ${usd(usage.unresolved)}.</p>
    <BudgetControls key={`${policy.enabled}-${policy.daily_micros}-${policy.monthly_micros}`} enabled={policy.enabled} daily={Number(policy.daily_micros)/1000000} monthly={Number(policy.monthly_micros)/1000000} models={models.map(m => ({ id: m.id, name: m.name }))} />
    <section className="space-y-2"><h2 className="text-xl">Admin email delivery</h2><p>Private server recipient. SENT means accepted by SMTP, not confirmed inbox delivery. Failed sends retry automatically.</p>{alerts.map(a => <p key={a.id} className="text-sm break-words">{a.created_at.toISOString()} | {a.reason} | {a.state} | attempts: {a.attempts}</p>)}</section>
    <section className="space-y-2"><h2 className="text-xl">Latest 50 attempts</h2>{attempts.map(a => <p key={a.id} className="text-sm break-words">{a.created_at.toISOString()} | {a.operation} | {a.state} | {a.billing_mode === 'SUBSCRIPTION' ? 'Subscription quota (not a USD estimate)' : `$${usd(a.charged_micros)}`} {a.error_code ?? ''}</p>)}</section>
  </div>
}
