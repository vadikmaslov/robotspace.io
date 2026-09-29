import { createRequire } from 'node:module'
import { deliverOne, alertMessage } from './alerts/delivery.mjs'
import { deliverRequest } from './alerts/request-delivery.mjs'
const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const { Client } = require('pg')
const nodemailer = require('nodemailer')
const client = new Client({ connectionString: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL, connectionTimeoutMillis: 10000, query_timeout: 15000 })
let transport
try {
  await client.connect()
  const recipient = process.env.AI_ALERT_EMAIL || process.env.SMTP_EMAIL
  if (process.env.EMAIL_TRANSPORT_URL && recipient) {
    const url = new URL(process.env.EMAIL_TRANSPORT_URL)
    if (!['smtp:', 'smtps:'].includes(url.protocol)) throw new Error('Invalid transport')
    transport = nodemailer.createTransport({
      host: url.hostname, port: Number(url.port) || (url.protocol === 'smtps:' ? 465 : 587), secure: url.protocol === 'smtps:', requireTLS: true,
      auth: { user: decodeURIComponent(url.username), pass: decodeURIComponent(url.password) },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
    })
    const send = async alert => {
      const info = await transport.sendMail({ ...alertMessage(alert), to: recipient, from: url.searchParams.get('from') || recipient })
      return info.accepted?.length === 1 && !info.rejected?.length
    }
    for (let i = 0; i < 5 && await deliverOne(client, send); i++) { /* bounded batch */ }
    const requestRecipient = process.env.OPERATIONS_ALERT_EMAIL || process.env.SMTP_EMAIL
    if (requestRecipient) {
      const sendRequest = async message => {
        const info = await transport.sendMail({ ...message, to: requestRecipient, from: url.searchParams.get('from') || requestRecipient })
        return info.accepted?.length === 1 && !info.rejected?.length
      }
      for (let i = 0; i < 5 && await deliverRequest(client, sendRequest); i++) { /* independent bounded batch */ }
    } else throw new Error('Operations recipient not configured')
  } else throw new Error('SMTP not configured')
  const result = await client.query("SELECT count(*)::int pending FROM ai_admin_alerts WHERE state <> 'SENT'")
  console.log(`AI alert delivery pass finished; pending: ${result.rows[0].pending}`)
  const requests = await client.query("SELECT count(*)::int pending FROM request_email_outbox WHERE state <> 'SENT'")
  console.log(`Request delivery pass finished; pending: ${requests.rows[0].pending}`)
} catch {
  console.error('Admin email delivery failed; queues retained. Check private SMTP/database settings.')
  process.exitCode = 1
} finally { transport?.close(); await client.end().catch(() => undefined) }
