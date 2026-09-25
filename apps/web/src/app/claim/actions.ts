'use server'

import { redirect } from 'next/navigation'
import { auth, signIn } from '../../auth'
import { prisma } from '@robotspace/db'
import { claimProject, ClaimError, revokeClaim } from '../../lib/registry-claims'

function projectSlug(formData: FormData) {
  const slug = formData.get('project')
  return typeof slug === 'string' && /^[a-z0-9][a-z0-9-]{0,254}$/.test(slug) ? slug : ''
}

export async function signInForClaim(formData: FormData) {
  const slug = projectSlug(formData)
  await signIn('github', { redirectTo: slug ? `/claim?project=${encodeURIComponent(slug)}` : '/claim' })
}

export async function submitProjectClaim(formData: FormData) {
  const slug = projectSlug(formData)
  if (!slug) redirect('/claim?result=PROJECT')
  const session = await auth()
  if (session?.user?.sessionKind !== 'registry' || !session.user.registryUserId) redirect(`/claim?project=${encodeURIComponent(slug)}&result=ACCOUNT`)
  let result = 'VERIFIED'
  try { await claimProject(prisma, session.user.registryUserId, slug) }
  catch (error) { result = error instanceof ClaimError ? error.code : 'GITHUB_ERROR' }
  redirect(`/claim?project=${encodeURIComponent(slug)}&result=${result}`)
}

export async function revokeProjectClaim(formData: FormData) {
  const claimId = formData.get('claim')
  const slug = projectSlug(formData)
  if (typeof claimId !== 'string' || !/^[0-9a-f-]{36}$/i.test(claimId)) redirect('/claim?result=PROJECT')
  const session = await auth()
  if (session?.user?.sessionKind !== 'registry' || !session.user.registryUserId) redirect('/claim?result=ACCOUNT')
  let result = 'REVOKED'
  try { await revokeClaim(prisma, session.user.registryUserId, claimId) }
  catch (error) { result = error instanceof ClaimError ? error.code : 'GITHUB_ERROR' }
  redirect(`/claim${slug ? `?project=${encodeURIComponent(slug)}&` : '?'}result=${result}`)
}
