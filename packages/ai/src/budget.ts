import { randomUUID } from 'node:crypto'
import { prisma, type Prisma } from '@robotspace/db'
import type { GenerateRequest, GenerateResponse } from './adapter-interface'
import { boundedRequest, BudgetDenied, costMicros, validUsage } from './budget-math'

type Tx = Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw'>
type Policy = { enabled: boolean; daily_micros: bigint; monthly_micros: bigint }
type Price = { input_per_million: unknown; output_per_million: unknown }
export type Reservation = { id: string; micros: number; inputPrice: number; outputPrice: number; subscription?: boolean }

export async function queueStopAlert(tx: Tx, reason: string) {
  // One message per safe reason per UTC day, even across web/worker processes/restarts.
  await tx.$executeRaw`INSERT INTO ai_admin_alerts(dedup_key, reason)
    VALUES (${reason} || ':' || to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD'), ${reason}) ON CONFLICT (dedup_key) DO NOTHING`
}

// Shared row lock serializes reservations across web, workers and admin edits.
export async function reserveInTransaction(tx: Tx, modelId: string, operation: string, request: GenerateRequest, requestLimit?: number, subscription = false): Promise<Reservation> {
  const bounds = boundedRequest(request)
  const [policy] = await tx.$queryRaw<Policy[]>`SELECT * FROM ai_budget_policy WHERE id = 1 FOR UPDATE`
  if (!policy?.enabled || process.env.AI_EMERGENCY_STOP === 'true') throw new BudgetDenied('AI_DISABLED')
  if (subscription) {
    const id = randomUUID()
    await tx.$executeRaw`INSERT INTO ai_budget_attempts(id, model_id, operation, state, reserved_micros, charged_micros, input_per_million, output_per_million, billing_mode)
      VALUES (${id}::uuid, ${modelId}::uuid, ${operation.slice(0,100)}, 'RESERVED', 0, 0, 0, 0, 'SUBSCRIPTION')`
    return { id, micros: 0, inputPrice: 0, outputPrice: 0, subscription: true }
  }
  const [price] = await tx.$queryRaw<Price[]>`SELECT * FROM ai_budget_prices WHERE model_id = ${modelId}::uuid AND valid_until > now()`
  if (!price) throw new BudgetDenied('PRICE_MISSING_OR_EXPIRED')
  const inputPrice = Number(price.input_per_million), outputPrice = Number(price.output_per_million)
  const micros = Math.max(1, costMicros(bounds.input, bounds.output, inputPrice, outputPrice))
  if (requestLimit !== undefined && (!Number.isFinite(requestLimit) || requestLimit < 0 || micros > Math.floor(requestLimit * 1000000))) throw new BudgetDenied('REQUEST_BUDGET_EXCEEDED')
  const [spent] = await tx.$queryRaw<{ daily: bigint; monthly: bigint }[]>`
    SELECT COALESCE(SUM(charged_micros) FILTER (WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' OR state IN ('RESERVED','UNCERTAIN')),0)::bigint daily,
           COALESCE(SUM(charged_micros) FILTER (WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' OR state IN ('RESERVED','UNCERTAIN')),0)::bigint monthly
    FROM ai_budget_attempts`
  if (BigInt(micros) + spent.daily > policy.daily_micros || BigInt(micros) + spent.monthly > policy.monthly_micros) throw new BudgetDenied('AI_BUDGET_EXCEEDED')
  const id = randomUUID()
  await tx.$executeRaw`INSERT INTO ai_budget_attempts(id, model_id, operation, state, reserved_micros, charged_micros, input_per_million, output_per_million)
    VALUES (${id}::uuid, ${modelId}::uuid, ${operation.slice(0,100)}, 'RESERVED', ${micros}, ${micros}, ${inputPrice}, ${outputPrice})`
  return { id, micros, inputPrice, outputPrice }
}
export function reserveBudget(modelId: string, operation: string, request: GenerateRequest, requestLimit?: number, subscription = false) {
  return prisma.$transaction(tx => reserveInTransaction(tx, modelId, operation, request, requestLimit, subscription))
}
export async function settleInTransaction(tx: Tx, reservation: Reservation, response?: GenerateResponse, accepted = false, errorCode = 'PROVIDER_ERROR') {
  await tx.$queryRaw`SELECT id FROM ai_budget_policy WHERE id = 1 FOR UPDATE`
  const known = validUsage(response?.usage)
  const micros = reservation.subscription ? 0 : known ? costMicros(response!.usage.promptTokens, response!.usage.completionTokens, reservation.inputPrice, reservation.outputPrice) : reservation.micros
  const state = known ? (accepted ? 'SUCCEEDED' : 'REJECTED') : 'UNCERTAIN'
  const changed = await tx.$executeRaw`UPDATE ai_budget_attempts SET state = ${state}, charged_micros = ${micros},
    input_tokens = ${known ? response!.usage.promptTokens : null}, output_tokens = ${known ? response!.usage.completionTokens : null},
    error_code = ${accepted && known ? null : errorCode.slice(0,50)}, finished_at = now()
    WHERE id = ${reservation.id}::uuid AND state = 'RESERVED'`
  if (changed !== 1) throw new BudgetDenied('SETTLEMENT_CONFLICT')
  if (errorCode === 'QUOTA_EXHAUSTED') {
    await tx.$executeRaw`UPDATE ai_budget_policy SET enabled = false, updated_at = now() WHERE id = 1`
    await queueStopAlert(tx, 'SUBSCRIPTION_QUOTA_EXHAUSTED')
  }
  if (micros > reservation.micros) {
    await tx.$executeRaw`UPDATE ai_budget_policy SET enabled = false, updated_at = now() WHERE id = 1`
    await queueStopAlert(tx, 'AI_ACCOUNTING_REVIEW_REQUIRED')
    return false
  }
  return known
}
export function settleBudget(reservation: Reservation, response?: GenerateResponse, accepted = false, errorCode?: string) {
  return prisma.$transaction(tx => settleInTransaction(tx, reservation, response, accepted, errorCode))
}
