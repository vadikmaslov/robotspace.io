'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { auth, signIn } from '../../auth'
import { prisma } from '@robotspace/db'
import type { Session } from 'next-auth'
import { beginManufacturerClaim, ManufacturerError, publishManufacturerStatement, revokeManufacturerClaim, verifyManufacturerClaim } from '../../lib/manufacturer-voice'

function field(form: FormData, name: string) { const value = form.get(name); return typeof value === 'string' ? value : '' }
function companySlug(form: FormData) { const value = field(form, 'company'); return /^[a-z0-9][a-z0-9-]{0,254}$/.test(value) ? value : '' }
function userId(session: Session | null) { return session?.user?.sessionKind === 'registry' ? session.user.registryUserId : null }
function target(slug: string, result: string) { return `/manufacturer?company=${encodeURIComponent(slug)}&result=${encodeURIComponent(result)}` }

export async function signInForManufacturer(form: FormData) {
  const slug = companySlug(form)
  await signIn('github', { redirectTo: slug ? `/manufacturer?company=${encodeURIComponent(slug)}` : '/companies' })
}

export async function beginManufacturerClaimAction(form: FormData) {
  const slug = companySlug(form)
  if (!slug) redirect('/companies')
  const id = userId(await auth())
  if (!id) redirect(target(slug, 'ACCOUNT'))
  try { await beginManufacturerClaim(prisma, id, slug) }
  catch (error) { redirect(target(slug, error instanceof ManufacturerError ? error.code : 'ERROR')) }
  redirect(target(slug, 'CHALLENGE'))
}

export async function verifyManufacturerClaimAction(form: FormData) {
  const slug = companySlug(form)
  if (!slug) redirect('/companies')
  const id = userId(await auth())
  if (!id) redirect(target(slug, 'ACCOUNT'))
  try { await verifyManufacturerClaim(prisma, id, slug) }
  catch (error) { redirect(target(slug, error instanceof ManufacturerError ? error.code : 'ERROR')) }
  revalidatePath(`/companies/${slug}`)
  redirect(target(slug, 'VERIFIED'))
}

export async function revokeManufacturerClaimAction(form: FormData) {
  const slug = companySlug(form)
  const id = userId(await auth())
  if (!slug || !id) redirect('/companies')
  try { await revokeManufacturerClaim(prisma, id, field(form, 'claim')) }
  catch (error) { redirect(target(slug, error instanceof ManufacturerError ? error.code : 'ERROR')) }
  revalidatePath(`/companies/${slug}`)
  redirect(target(slug, 'REVOKED'))
}

export async function publishManufacturerStatementAction(form: FormData) {
  const slug = companySlug(form)
  if (!slug) redirect('/companies')
  const id = userId(await auth())
  if (!id) redirect(target(slug, 'ACCOUNT'))
  try { await publishManufacturerStatement(prisma, id, { companySlug: slug, robotId: field(form, 'robot') || undefined, type: field(form, 'type'), title: field(form, 'title'), value: field(form, 'value'), url: field(form, 'url'), evidenceUrl: field(form, 'evidence') }) }
  catch (error) { redirect(target(slug, error instanceof ManufacturerError ? error.code : 'ERROR')) }
  revalidatePath(`/companies/${slug}`)
  redirect(target(slug, 'PUBLISHED'))
}
