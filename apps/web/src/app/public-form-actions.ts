'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { prisma } from '@robotspace/db'
import { submissionType } from '../lib/submission-type'

const WINDOW_MS = 60_000
const MAX_REQUESTS_PER_WINDOW = 5
const attempts = new Map<string, { count: number; startedAt: number }>()

class FormValidationError extends Error {}
function publicError(error: unknown) {
  return error instanceof FormValidationError ? error.message : 'Unable to save your request. Please try again later.'
}

function value(formData: FormData, key: string, max = 2_000) {
  return String(formData.get(key) ?? '').trim().slice(0, max)
}

async function guard(formData: FormData) {
  if (value(formData, 'website')) throw new FormValidationError('Spam detected')
  const requestHeaders = await headers()
  const ip = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const now = Date.now()
  const current = attempts.get(ip)
  if (!current || now - current.startedAt > WINDOW_MS) {
    attempts.set(ip, { count: 1, startedAt: now })
    return
  }
  if (current.count >= MAX_REQUESTS_PER_WINDOW) throw new FormValidationError('Too many requests. Please try again in a minute.')
  current.count += 1
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function sourceUrls(raw: string) {
  if (!raw) return []
  return raw.split(/[\s,]+/).filter(Boolean).map((item) => {
    let url: URL
    try { url = new URL(item) } catch { throw new FormValidationError('Enter a valid source URL.') }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new FormValidationError('Only HTTP(S) source URLs are allowed.')
    if (url.hostname === 'localhost' || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)) {
      throw new FormValidationError('Private source URLs are not allowed.')
    }
    return url.toString()
  })
}

export async function submitData(formData: FormData) {
  try {
    await guard(formData)
    const type = submissionType(value(formData, 'type'))
    const name = value(formData, 'name', 255)
    const email = value(formData, 'email', 255).toLowerCase()
    const urls = sourceUrls(value(formData, 'urls'))
    if (!type || !name) throw new FormValidationError('Choose a submission type and provide a name.')
    if (email && !validEmail(email)) throw new FormValidationError('Enter a valid email address.')
    // A database trigger queues the admin email atomically with this INSERT.
    await prisma.submissions.create({
      data: { type, payload_json: { name }, submitter_email: email || null, source_urls: urls },
    })
  } catch (error) {
    redirect(`/submit?error=${encodeURIComponent(publicError(error))}`)
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
    if (!contactName || !validEmail(email) || !formData.get('consent')) throw new FormValidationError('Name, valid business email, and consent are required.')
    if (country && !/^[A-Z]{2}$/.test(country)) throw new FormValidationError('Country must be a two-letter ISO code.')
    // Saving succeeds independently of SMTP availability; the outbox retries delivery.
    await prisma.quote_requests.create({
      data: {
        contact_name: contactName, email, company_name: companyName || null, country: country || null,
        message: [robot && `Robot: ${robot}`, message].filter(Boolean).join('\n') || null,
        consent_version: 'privacy-2026-09-29', consent_timestamp: new Date(),
      },
    })
  } catch (error) {
    redirect(`/quote?error=${encodeURIComponent(publicError(error))}`)
  }
  redirect('/quote?status=received')
}
