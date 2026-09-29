import { auth } from '../auth'

/** Defense in depth: handlers must not depend on middleware execution. */
export async function adminApiDenied(): Promise<Response | null> {
  const session = await auth()
  return session?.user?.sessionKind === 'admin'
    ? null
    : Response.json({ error: 'Unauthorized' }, { status: 401 })
}
