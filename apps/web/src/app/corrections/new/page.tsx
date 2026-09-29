import Link from 'next/link'
import { auth } from '../../../auth'
import { prisma } from '@robotspace/db'
import { signInForRegistry, submitCorrectionAction } from '../../registry/actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Suggest a correction', robots: { index: false, follow: false } }
export default async function NewCorrectionPage({ searchParams }: { searchParams: Promise<{ entity?: string; result?: string }> }) {
  const { entity: requested, result } = await searchParams
  const slug = requested && /^[a-z0-9][a-z0-9-]{0,254}$/.test(requested) ? requested : ''
  const entity = slug ? await prisma.entities.findFirst({ where: { slug, entity_type: { in: ['PROJECT', 'ROBOT'] }, archived_at: null }, select: { id: true, entity_type: true } }) : null
  const session = await auth()
  const signedIn = session?.user?.sessionKind === 'registry'
  return <main className="max-w-[760px] mx-auto px-6 py-12 space-y-6"><Link href="/registry" className="text-sm underline">Registry</Link><h1 className="text-3xl font-semibold">Suggest a correction</h1>{!entity ? <p>Choose a project or robot first.</p> : <><p>For {entity.entity_type.toLowerCase()} <strong>{slug}</strong>. Add an HTTPS source so moderators can verify the suggestion.</p><Link href="/faq#corrections" className="text-sm underline">What evidence and review mean</Link>{result && <p role="status" className="rounded-lg border p-3">{result === 'PENDING' ? 'Submitted for moderation.' : result === 'ACCOUNT' ? 'Sign in with GitHub first.' : 'Could not submit. Check your evidence link and try again.'}</p>}{!signedIn ? <form action={signInForRegistry}><input type="hidden" name="target" value={`/corrections/new?entity=${slug}`} /><button className="rounded-md border px-4 py-2">Sign in with GitHub</button></form> : <form action={submitCorrectionAction} className="space-y-3"><input type="hidden" name="entity" value={slug} /><label className="block">What should be corrected?<textarea name="description" required maxLength={2000} className="mt-1 block w-full rounded-md border p-2" /></label><label className="block">Evidence URL<input type="url" name="evidence" required className="mt-1 block w-full rounded-md border p-2" /></label><button className="rounded-md border px-4 py-2">Submit correction</button></form>}
    </>}
  </main>
}
