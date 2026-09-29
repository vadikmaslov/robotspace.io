import Link from 'next/link'
import { auth } from '../../../auth'
import { prisma } from '@robotspace/db'
import { createProfileAction, signInForRegistry } from '../../registry/actions'

export const metadata = { title: 'Create developer profile', robots: { index: false, follow: false } }
export default async function NewDeveloperPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const session = await auth()
  const id = session?.user?.sessionKind === 'registry' ? session.user.registryUserId : null
  const profile = id ? await prisma.developer_profiles.findUnique({ where: { user_id: id }, select: { handle: true } }) : null
  const verified = id ? await prisma.entity_claims.count({ where: { claimant_id: id, status: 'VERIFIED' } }) : 0
  const { result } = await searchParams
  return <main className="max-w-[720px] mx-auto px-6 py-12 space-y-6"><Link href="/registry" className="text-sm underline">Registry</Link><h1 className="text-3xl font-semibold">Your developer profile</h1>
    {profile ? <p>Your profile is ready: <Link className="underline" href={`/developers/${profile.handle}`}>@{profile.handle}</Link>.</p> : !id ? <form action={signInForRegistry}><input type="hidden" name="target" value="/developers/new" /><button className="rounded-md border px-4 py-2">Sign in with GitHub</button></form> : !verified ? <p>First <Link href="/projects/new" className="underline">add a project</Link> and verify that you administer its repository.</p> : <form action={createProfileAction} className="space-y-4">{result && <p role="status">Could not create the profile. Check the handle and try another one.</p>}<label className="block">Public handle<input name="handle" required minLength={3} maxLength={40} pattern="[a-z0-9][a-z0-9-]{2,39}" className="mt-2 block w-full rounded-md border p-3" /></label><label className="block">Display name<input name="displayName" required maxLength={100} className="mt-2 block w-full rounded-md border p-3" /></label><label className="block">Bio<textarea name="bio" maxLength={1000} className="mt-2 block w-full rounded-md border p-3" /></label><button className="rounded-md border px-4 py-2">Create profile</button></form>}
  </main>
}
