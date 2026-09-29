import { randomUUID } from 'node:crypto'

export async function deliverOne(client, send) {
  const token = randomUUID()
  const { rows: [alert] } = await client.query(`WITH candidate AS (
    SELECT id FROM ai_admin_alerts WHERE state <> 'SENT' AND next_attempt_at <= now()
      AND (lease_until IS NULL OR lease_until < now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE ai_admin_alerts a SET state='SENDING', lease_token=$1, lease_until=now()+interval '2 minutes', attempts=attempts+1
      FROM candidate c WHERE a.id=c.id RETURNING a.id,a.reason,a.created_at,a.attempts`, [token])
  if (!alert) return false
  let sent = false
  try { sent = await send(alert) }
  catch { /* Never log SMTP errors, recipients, credentials or provider payloads. */ }
  if (sent) {
    await client.query("UPDATE ai_admin_alerts SET state='SENT', sent_at=now(), lease_until=NULL, lease_token=NULL, last_error=NULL WHERE id=$1 AND lease_token=$2", [alert.id, token])
  } else {
    const delay = Math.min(3600, 60 * 2 ** Math.min(alert.attempts - 1, 6))
    await client.query("UPDATE ai_admin_alerts SET state='QUEUED', next_attempt_at=now()+$3*interval '1 second', lease_until=NULL, lease_token=NULL, last_error='SMTP_NOT_ACCEPTED' WHERE id=$1 AND lease_token=$2", [alert.id, token, delay])
  }
  return true
}

export function alertMessage(alert) {
  const reasons = {
    SUBSCRIPTION_QUOTA_EXHAUSTED: 'Квота Alibaba Token Plan исчерпана. Новые AI-запросы остановлены. После обновления квоты включите Allow AI calls в админке.',
    SUBSCRIPTION_AUTH_FAILED: 'Alibaba отклонила ключ подписки. Проверьте срок подписки и закрытые настройки ключа.',
    SUBSCRIPTION_RATE_LIMITED: 'Alibaba временно ограничила частоту запросов. Текущая задача остановлена, следующие запуски смогут повторить попытку.',
    SUBSCRIPTION_ROUTE_UNAVAILABLE: 'Не удалось выполнить задачу через разрешенную подписку. Проверьте маршруты и состояние Alibaba.',
    AI_ACCOUNTING_REVIEW_REQUIRED: 'AI остановлен из-за расхождения учета. Проверьте журнал расходов перед возобновлением.',
    DELIVERY_TEST: 'Это проверка доставки уведомлений RobotSpace. Для этого письма исчерпание квоты не имитировалось и рабочий AI не останавливался.',
  }
  return {
    subject: alert.reason === 'DELIVERY_TEST' ? '[RobotSpace] Проверка уведомлений AI' : '[RobotSpace] Требуется внимание: AI-подписка',
    text: `${reasons[alert.reason] ?? 'Требуется проверка AI в админке.'}\n\nПереход на платные API запрещен.\nhttps://robotspace.io/admin/ai/usage\n\nВремя события: ${new Date(alert.created_at).toISOString()}\nID: ${alert.id}\nАдрес администратора хранится только в закрытых настройках.`,
    messageId: `<robotspace-ai-${alert.id}@robotspace.io>`,
  }
}
