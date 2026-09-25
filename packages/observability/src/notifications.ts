/**
 * Phase 5.5: Notifications Transport
 * Email delivery via SMTP/EMAIL_TRANSPORT_URL, templates, retry, audit
 */

import { prisma } from '@robotspace/db'
import { settingsService } from '@robotspace/db'
import { enqueue } from '@robotspace/worker/src/queue'

// ============================================================
// EMAIL TRANSPORT
// ============================================================

interface EmailMessage {
  to: string
  subject: string
  htmlBody: string
  textBody?: string
}

/**
 * Send a single email via the configured transport
 */
async function sendEmail(message: EmailMessage): Promise<{ ok: boolean; providerMsgId?: string; error?: string }> {
  const transportUrl = process.env.EMAIL_TRANSPORT_URL
  if (!transportUrl) {
    return { ok: false, error: 'EMAIL_TRANSPORT_URL not configured' }
  }

  try {
    // Parse SMTP URL: smtp://user:pass@host:port
    const url = new URL(transportUrl)
    const nodemailer = await import('nodemailer')

    const transport = nodemailer.default.createTransport({
      host: url.hostname,
      port: Number(url.port) || 587,
      secure: url.protocol === 'smtps:',
      auth: {
        user: decodeURIComponent(url.username),
        pass: decodeURIComponent(url.password),
      },
    })

    const info = await transport.sendMail({
      from: url.searchParams.get('from') ?? 'noreply@robotspace.io',
      to: message.to,
      subject: message.subject,
      html: message.htmlBody,
      text: message.textBody,
    })

    return { ok: true, providerMsgId: info.messageId }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'SMTP transport error',
    }
  }
}

// ============================================================
// NOTIFICATION DELIVERY
// ============================================================

const NOTIFICATION_TEMPLATES: Record<string, (params: Record<string, unknown>) => { subject: string; htmlBody: string }> = {
  ai_routes_exhausted: (params) => ({
    subject: '[RobotSpace] AI routes exhausted',
    htmlBody: `<p>All AI routes have been exhausted for operation: <strong>${params.operation as string}</strong>.</p>
               <p>Scope: ${params.scope as string}</p>
               <p>Last error: ${params.lastError as string}</p>`,
  }),
  all_providers_down: (params) => ({
    subject: '[RobotSpace] All AI providers down',
    htmlBody: `<p>All configured AI providers are currently down or unreachable.</p>
               <p>Affected providers: ${(params.providers as string[]).join(', ')}</p>`,
  }),
  source_critical_stop: (params) => ({
    subject: `[RobotSpace] Source "${params.sourceName as string}" critical failure`,
    htmlBody: `<p>Source <strong>${params.sourceName as string}</strong> has stopped beyond SLA.</p>
               <p>Status: ${params.status as string}</p>
               <p>Error: ${params.error as string}</p>`,
  }),
  data_integrity_failure: (params) => ({
    subject: '[RobotSpace] Data integrity failure',
    htmlBody: `<p>A data integrity check has failed.</p>
               <p>Details: ${params.details as string}</p>`,
  }),
  backup_failure: (params) => ({
    subject: '[RobotSpace] Backup failure',
    htmlBody: `<p>The scheduled backup has failed.</p>
               <p>Error: ${params.error as string}</p>`,
  }),
}

/**
 * Deliver a notification — enqueue to notifications queue, worker picks up
 */
export async function sendNotification(
  type: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  params: Record<string, unknown>,
): Promise<void> {
  const template = NOTIFICATION_TEMPLATES[type]
  if (!template) {
    console.error(`[notification] Unknown notification type: ${type}`)
    return
  }

  const { subject, htmlBody } = template(params)
  const recipients = await settingsService.getRecipients()
  const toEmail = recipients.notificationEmail

  // Create notification record
  const notification = await prisma.notifications.create({
    data: {
      type,
      severity,
      state: 'QUEUED',
      dedup_key: `${type}-${Date.now()}`,
      recipient_setting_key: 'notification',
      template_version: 'v1',
    },
  })

  // Send email
  const result = await sendEmail({
    to: toEmail,
    subject,
    htmlBody,
  })

  // Update notification status
  await prisma.notifications.update({
    where: { id: notification.id },
    data: {
      state: result.ok ? 'SENT' : 'FAILED',
      provider_msg_id: result.providerMsgId ?? undefined,
      sent_at: result.ok ? new Date() : undefined,
      error_timestamp: result.ok ? undefined : new Date(),
      attempt_count: 1,
    },
  })

  if (!result.ok) {
    // Retry via queue
    await enqueue('notifications', {
      idempotency_key: `notif-retry-${notification.id}`,
      policy_revision: 1,
      operation: type,
    })
  }
}
