type OperationsEmail = {
  subject: string
  text: string
}

/**
 * Sends an operational notification without making a public form dependent on
 * SMTP availability. Credentials stay in EMAIL_TRANSPORT_URL on the server.
 */
export async function sendOperationsEmail(message: OperationsEmail) {
  const transportUrl = process.env.EMAIL_TRANSPORT_URL
  const recipient = process.env.SMTP_EMAIL
  if (!transportUrl || !recipient) return { sent: false, reason: 'SMTP is not configured' }

  try {
    const url = new URL(transportUrl)
    const nodemailer = await import('nodemailer')
    const transport = nodemailer.default.createTransport({
      host: url.hostname,
      port: Number(url.port) || (url.protocol === 'smtps:' ? 465 : 587),
      secure: url.protocol === 'smtps:',
      auth: { user: decodeURIComponent(url.username), pass: decodeURIComponent(url.password) },
    })
    await transport.sendMail({
      from: url.searchParams.get('from') ?? recipient,
      to: recipient,
      subject: message.subject,
      text: message.text,
    })
    return { sent: true }
  } catch (error) {
    console.error('[operations-email] Delivery failed:', error instanceof Error ? error.message : 'SMTP error')
    return { sent: false, reason: 'SMTP delivery failed' }
  }
}
