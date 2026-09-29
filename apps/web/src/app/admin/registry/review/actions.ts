'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '../../../../auth'
import { prisma } from '@robotspace/db'
import { moderateCompatibilitySuggestion, moderateConfirmation, moderateCorrection } from '../../../../lib/registry-moderation'

function id(form: FormData, name: string) { const value = form.get(name); if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value)) throw new Error('Invalid submission'); return value }
function decision(form: FormData) { const value = form.get('decision'); if (value !== 'ACCEPTED' && value !== 'REJECTED') throw new Error('Invalid decision'); return value }
async function admin() { const session = await auth(); if (session?.user?.sessionKind !== 'admin') throw new Error('Administrator session required'); return session.user?.email ?? 'admin' }

export async function reviewCorrection(form: FormData) {
  const actor = await admin()
  await moderateCorrection(prisma, id(form, 'correction'), decision(form), actor)
  revalidatePath('/admin/registry/review')
}

export async function reviewConfirmation(form: FormData) {
  const actor = await admin()
  await moderateConfirmation(prisma, id(form, 'confirmation'), decision(form), actor)
  revalidatePath('/admin/registry/review')
}

export async function reviewCompatibilitySuggestion(form: FormData) {
  const actor = await admin()
  await moderateCompatibilitySuggestion(prisma, id(form, 'compatibility'), decision(form), actor)
  revalidatePath('/admin/registry/review')
}
