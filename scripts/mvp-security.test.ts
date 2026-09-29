import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path: string) => readFile(new URL(path, root), 'utf8')

test('request admin pages authorize before reads and forms never expose database errors', async () => {
  for (const section of ['quotes', 'submissions']) {
    const source = await read(`apps/web/src/app/admin/${section}/page.tsx`)
    assert.ok(source.indexOf("sessionKind !== 'admin'") < source.indexOf('await prisma.'))
    assert.match(source, /sessionKind !== 'admin'\) redirect\('\/admin\/login'\)/)
    assert.doesNotMatch(source, /dangerouslySetInnerHTML/)
  }
  const forms = await read('apps/web/src/app/public-form-actions.ts')
  assert.doesNotMatch(forms, /sendOperationsEmail|error instanceof Error \? error.message/)
  assert.match(forms, /error instanceof FormValidationError/)
  assert.match(forms, /const type = submissionType\(value\(formData, 'type'\)\)/)
  const submitPage = await read('apps/web/src/app/submit/page.tsx')
  assert.doesNotMatch(submitPage, /autonomous verification|href="\/terms"/)
})

test('every admin API handler checks its session before handler work', async () => {
  async function visit(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true })
    return (await Promise.all(entries.map(entry => entry.isDirectory() ? visit(join(directory, entry.name)) : Promise.resolve(entry.name === 'route.ts' ? [join(directory, entry.name)] : [])))).flat()
  }
  const { fileURLToPath } = await import('node:url')
  const routes = await visit(fileURLToPath(new URL('apps/web/src/app/api/admin/', root)))
  assert.ok(routes.length >= 22)
  for (const path of routes) {
    const source = await readFile(path, 'utf8')
    const handlers = [...source.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\([\s\S]*?\) \{\s*([^]*?)(?=\n\})/g)]
    assert.ok(handlers.length, path)
    for (const handler of handlers) assert.match(handler[2], /^const denied = await adminApiDenied\(\)\s+if \(denied\) return denied/, `${path} ${handler[1]}`)
  }
})

test('privacy does not expose a personal mailbox or claim automatic retention', async () => {
  const privacy = await read('apps/web/src/app/privacy/page.tsx')
  assert.doesNotMatch(privacy, /@gmail\.com|retained for 12 months|retained 30 days/)
  const layout = await read('apps/web/src/app/layout.tsx')
  assert.doesNotMatch(layout, /mc\.yandex\.ru|webvisor:true|fonts\.googleapis\.com/)
})

test('detail pages enforce publication and do not invent a verification date', async () => {
  for (const kind of ['robots', 'companies']) {
    const source = await read(`apps/web/src/app/${kind}/[slug]/page.tsx`)
    assert.match(source, /entity\.publication_status = 'PUBLISHED'/)
    assert.match(source, /entity\.archived_at IS NULL/)
  }
  assert.doesNotMatch(await read('apps/web/src/app/robots/[slug]/page.tsx'), /: 'Today'/)
})

test('password limiter fails closed without a signing secret', async () => {
  const previous = [process.env.AUTH_SECRET, process.env.NEXTAUTH_SECRET]
  delete process.env.AUTH_SECRET
  delete process.env.NEXTAUTH_SECRET
  try {
    const { allowAdminPasswordAttempt } = await import('../apps/web/src/lib/admin-login-limit')
    assert.equal(await allowAdminPasswordAttempt(new Request('https://robotspace.io/api/auth/callback/credentials')), false)
  } finally {
    if (previous[0] !== undefined) process.env.AUTH_SECRET = previous[0]
    if (previous[1] !== undefined) process.env.NEXTAUTH_SECRET = previous[1]
  }
})
