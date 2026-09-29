import Link from 'next/link'
import { auth } from '../../../auth'
import { addProjectAction, signInForRegistry } from '../../registry/actions'

export const metadata = { title: 'Add a project', robots: { index: false, follow: false } }
export default async function AddProjectPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const session = await auth()
  const signedIn = session?.user?.sessionKind === 'registry'
  const { result } = await searchParams
  return <main className="max-w-[720px] mx-auto px-6 py-12 space-y-6"><Link href="/registry" className="text-sm underline">Registry</Link><h1 className="text-3xl font-semibold">Add a GitHub project</h1><p>Start with a public repository. RobotSpace imports its metadata as a draft; ownership and publication are separate checks.</p><Link href="/faq#add-project" className="text-sm underline">What happens after import?</Link>
    {result && <p role="status" className="rounded-lg border p-3">{result === 'ACCOUNT' ? 'Sign in with GitHub first.' : 'The repository could not be imported. Check the public URL and try again.'}</p>}
    {!signedIn ? <form action={signInForRegistry}><input type="hidden" name="target" value="/projects/new" /><button className="rounded-md border px-4 py-2">Sign in with GitHub</button></form> : <form action={addProjectAction} className="space-y-4"><label className="block">Public GitHub repository URL<input required type="url" name="repository" placeholder="https://github.com/owner/repo" className="mt-2 block w-full rounded-md border p-3" /></label><button className="rounded-md border px-4 py-2">Import draft project</button></form>}
  </main>
}
