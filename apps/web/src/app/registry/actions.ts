'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { auth, signIn } from '../../auth'
import { prisma } from '@robotspace/db'
import type { Session } from 'next-auth'
import { addGitHubProject, createDeveloperProfile, saveProjectMetadata, submitCompatibilityOpinion, submitCorrection, suggestCompatibility } from '../../lib/registry-community'

function field(form: FormData, name: string) { const value = form.get(name); return typeof value === 'string' ? value : '' }
function slug(value: string) { return /^[a-z0-9][a-z0-9-]{0,254}$/.test(value) ? value : '' }
function uuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : '' }
function userId(session: Session | null) { return session?.user?.sessionKind === 'registry' ? session.user.registryUserId : null }

export async function signInForRegistry(form: FormData) {
  const target = field(form, 'target')
  const allowed = target === '/projects/new' || target === '/developers/new' || target.startsWith('/corrections/new?') || target.startsWith('/compatibility/new?robot=') || /^\/compatibility\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target) || /^\/projects\/[a-z0-9-]+\/manage$/.test(target)
  await signIn('github', { redirectTo: allowed ? target : '/registry' })
}

export async function addProjectAction(form: FormData) {
  const id = userId(await auth())
  if (!id) redirect('/projects/new?result=ACCOUNT')
  let projectSlug = ''
  try { projectSlug = await addGitHubProject(prisma, id, field(form, 'repository')) }
  catch { redirect('/projects/new?result=ERROR') }
  redirect(`/claim?project=${encodeURIComponent(projectSlug)}`)
}

export async function createProfileAction(form: FormData) {
  const id = userId(await auth())
  if (!id) redirect('/developers/new?result=ACCOUNT')
  let handle = ''
  try { const profile = await createDeveloperProfile(prisma, id, { handle: field(form, 'handle'), displayName: field(form, 'displayName'), bio: field(form, 'bio') }); handle = profile.handle }
  catch { redirect('/developers/new?result=ERROR') }
  redirect(`/developers/${handle}`)
}

export async function saveProjectAction(form: FormData) {
  const projectSlug = slug(field(form, 'project'))
  if (!projectSlug) redirect('/registry')
  const id = userId(await auth())
  if (!id) redirect(`/projects/${projectSlug}/manage?result=ACCOUNT`)
  let result: 'UPDATED' | 'PENDING' = 'PENDING'
  try { result = await saveProjectMetadata(prisma, id, projectSlug, { name: field(form, 'name'), description: field(form, 'description'), homepage: field(form, 'homepage'), license: field(form, 'license'), evidence: field(form, 'evidence') }) }
  catch { redirect(`/projects/${projectSlug}/manage?result=ERROR`) }
  revalidatePath(`/projects/${projectSlug}`)
  redirect(`/projects/${projectSlug}/manage?result=${result}`)
}

export async function suggestCompatibilityAction(form: FormData) {
  const projectSlug = slug(field(form, 'project'))
  if (!projectSlug) redirect('/registry')
  const id = userId(await auth())
  if (!id) redirect(`/projects/${projectSlug}/manage?result=ACCOUNT`)
  try { await suggestCompatibility(prisma, id, projectSlug, slug(field(form, 'robot')), field(form, 'evidence')) }
  catch { redirect(`/projects/${projectSlug}/manage?result=ERROR`) }
  redirect(`/projects/${projectSlug}/manage?result=COMPATIBILITY_PENDING`)
}

export async function suggestCompatibilityFromRobotAction(form: FormData) {
  const projectSlug = slug(field(form, 'project'))
  const robotSlug = slug(field(form, 'robot'))
  if (!projectSlug || !robotSlug) redirect('/registry')
  const id = userId(await auth())
  if (!id) redirect(`/compatibility/new?robot=${robotSlug}&result=ACCOUNT`)
  try { await suggestCompatibility(prisma, id, projectSlug, robotSlug, field(form, 'evidence')) }
  catch { redirect(`/compatibility/new?robot=${robotSlug}&result=ERROR`) }
  redirect(`/compatibility/new?robot=${robotSlug}&result=PENDING`)
}

export async function submitCorrectionAction(form: FormData) {
  const entity = slug(field(form, 'entity'))
  if (!entity) redirect('/registry')
  const id = userId(await auth())
  if (!id) redirect(`/corrections/new?entity=${entity}&result=ACCOUNT`)
  try { await submitCorrection(prisma, id, entity, field(form, 'description'), field(form, 'evidence')) }
  catch { redirect(`/corrections/new?entity=${entity}&result=ERROR`) }
  redirect(`/corrections/new?entity=${entity}&result=PENDING`)
}

export async function confirmCompatibilityAction(form: FormData) {
  const compatibility = uuid(field(form, 'compatibility'))
  const verdict = field(form, 'verdict')
  if (!compatibility || (verdict !== 'CONFIRMED' && verdict !== 'DISPUTED')) redirect('/registry')
  const id = userId(await auth())
  if (!id) redirect(`/compatibility/${compatibility}?result=ACCOUNT`)
  try { await submitCompatibilityOpinion(prisma, id, compatibility, verdict, field(form, 'evidence')) }
  catch { redirect(`/compatibility/${compatibility}?result=ERROR`) }
  redirect(`/compatibility/${compatibility}?result=PENDING`)
}

export async function markNotificationRead(form: FormData) {
  const id = userId(await auth())
  if (!id) redirect('/registry')
  const notification = uuid(field(form, 'notification'))
  if (notification) await prisma.registry_notifications.updateMany({ where: { id: notification, user_id: id, read_at: null }, data: { read_at: new Date() } })
  revalidatePath('/notifications')
}
