'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { prisma } from '@robotspace/db'
import { sendOperationsEmail } from '../lib/operations-email'

const WINDOW_MS = 60_000
const MAX_REQUESTS_PER_WINDOW = 5
const attempts = new Map<string, { count: number; startedAt: number }>()

function value(formData: FormData, key: string, max = 2_000) {
  return String(formData.get(key) ?? '').trim().slice(0, max)
}

async function guard(formData: FormData) {
  if (value(formData, 'website')) throw new Error('Spam detected')
  const requestHeaders = await headers()
  const ip = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const now = Date.now()
  const current = attempts.get(ip)
  if (!current || now - current.startedAt > WINDOW_MS) {
    attempts.set(ip, { count: 1, startedAt: now })
    return
  }
  if (current.count >= MAX_REQUESTS_PER_WINDOW) throw new Error('Too many requests. Please try again in a minute.')
  current.count += 1
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function sourceUrls(raw: string) {
  if (!raw) return []
  return raw.split(/[\s,]+/).filter(Boolean).map((item) => {
    const url = new URL(item)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Only HTTP(S) source URLs are allowed.')
    if (url.hostname === 'localhost' || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)) {
      throw new Error('Private source URLs are not allowed.')
    }
    return url.toString()
  })
}

export async function submitData(formData: FormData) {
  try {
    await guard(formData)
    const type = value(formData, 'type')
    const name = value(formData, 'name', 255)
    const email = value(formData, 'email', 255).toLowerCase()
    const urls = sourceUrls(value(formData, 'urls'))
    if (!['Add Robot', 'Add Company', 'Submit Update'].includes(type) || !name) throw new Error('Choose a submission type and provide a name.')
    if (email && !validEmail(email)) throw new Error('Enter a valid email address.')
    const submission = await prisma.submissions.create({
      data: { type, payload_json: { name }, submitter_email: email || null, source_urls: urls },
    })
    await sendOperationsEmail({
      subject: `[RobotSpace] New submission: ${type}`,
      text: [`Submission ID: ${submission.id}`, `Type: ${type}`, `Name: ${name}`, `Email: ${email || 'Not provided'}`, `Sources: ${urls.join(', ') || 'None'}`].join('\n'),
    })
  } catch (error) {
    redirect(`/submit?error=${encodeURIComponent(error instanceof Error ? error.message : 'Unable to submit data.')}`)
  }
  redirect('/submit?status=received')
}

export async function requestQuote(formData: FormData) {
  try {
    await guard(formData)
    const contactName = value(formData, 'name', 255)
    const email = value(formData, 'email', 255).toLowerCase()
    const companyName = value(formData, 'company', 255)
    const country = value(formData, 'country', 2).toUpperCase()
    const message = value(formData, 'message', 10_000)
    const robot = value(formData, 'robot', 255)
    if (!contactName || !validEmail(email) || !formData.get('consent')) throw new Error('Name, valid business email, and consent are required.')
    if (country && !/^[A-Z]{2}$/.test(country)) throw new Error('Country must be a two-letter ISO code.')
    const quote = await prisma.quote_requests.create({
      data: {
        contact_name: contactName, email, company_name: companyName || null, country: country || null,
        message: [robot && `Robot: ${robot}`, message].filter(Boolean).join('\n') || null,
        consent_version: 'privacy-2026-09-29', consent_timestamp: new Date(),
      },
    })
    await sendOperationsEmail({
      subject: '[RobotSpace] New quote request',
      text: [`Request ID: ${quote.id}`, `Contact: ${contactName}`, `Email: ${email}`, `Company: ${companyName || 'Not provided'}`, `Country: ${country || 'Not provided'}`, `Subject / robot: ${robot || 'Not provided'}`, '', message || 'No message'].join('\n'),
    })
  } catch (error) {
    redirect(`/quote?error=${encodeURIComponent(error instanceof Error ? error.message : 'Unable to send request.')}`)
  }
  redirect('/quote?status=received')
}
