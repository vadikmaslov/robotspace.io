'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '../../../../auth'
import { prisma } from '@robotspace/db'
import { robotResourceTypes, type RobotResourceType } from '../../../../lib/robot-ecosystem'

function field(form: FormData, name: string) { const value = form.get(name); return typeof value === 'string' ? value.trim() : '' }
function uuid(value: string) { return /^[0-9a-f-]{36}$/i.test(value) ? value : '' }
function httpsUrl(value: string) {
  try { const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password || url.port || url.href.length > 2000) throw new Error(); return url.href }
  catch { throw new Error('Credential-free HTTPS URL required') }
}
async function adminEmail() { const session = await auth(); if (session?.user?.sessionKind !== 'admin') throw new Error('Administrator session required'); return session.user?.email ?? 'admin' }

export async function addRobotResource(form: FormData) {
  const actor = await adminEmail()
  const robotId = uuid(field(form, 'robot'))
  const type = field(form, 'type') as RobotResourceType
  const title = field(form, 'title')
  if (!robotId || !robotResourceTypes.includes(type) || !title || title.length > 255) throw new Error('Invalid resource')
  const url = httpsUrl(field(form, 'url'))
  const evidenceUrl = httpsUrl(field(form, 'evidence'))
  await prisma.$transaction(async tx => {
    const robot = await tx.entities.findFirst({ where: { id: robotId, entity_type: 'ROBOT', archived_at: null }, select: { id: true } })
    if (!robot) throw new Error('Robot not found')
    const resource = await tx.robot_resources.create({ data: { robot_entity_id: robotId, resource_type: type, title, url, evidence_url: evidenceUrl, created_by: actor } })
    await tx.audit_logs.create({ data: { actor_type: 'ADMIN', actor_id: actor, action: 'robot_resource_verified', target_type: 'ROBOT_RESOURCE', target_id: resource.id, safe_diff_json: { robotId, type, title } } })
  })
  revalidatePath(`/admin/robots/${robotId}`)
  revalidatePath('/robots')
}

export async function rejectRobotResource(form: FormData) {
  const actor = await adminEmail()
  const robotId = uuid(field(form, 'robot'))
  const resourceId = uuid(field(form, 'resource'))
  if (!robotId || !resourceId) throw new Error('Invalid resource')
  await prisma.$transaction(async tx => {
    const resource = await tx.robot_resources.findFirst({ where: { id: resourceId, robot_entity_id: robotId, verification_status: 'VERIFIED' } })
    if (!resource) throw new Error('Resource is no longer verified')
    await tx.robot_resources.update({ where: { id: resource.id }, data: { verification_status: 'REJECTED' } })
    await tx.audit_logs.create({ data: { actor_type: 'ADMIN', actor_id: actor, action: 'robot_resource_rejected', target_type: 'ROBOT_RESOURCE', target_id: resource.id, safe_diff_json: { before: 'VERIFIED', after: 'REJECTED' } } })
  })
  revalidatePath(`/admin/robots/${robotId}`)
  revalidatePath('/robots')
}
