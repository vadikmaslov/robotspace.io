// Read-only sitemap smoke check, two requests at a time. Not a load test.
const base = new URL(process.argv[2] ?? 'https://robotspace.io')
const response = await fetch(new URL('/sitemap.xml', base), { signal: AbortSignal.timeout(15000) })
if (!response.ok) throw new Error(`Sitemap: ${response.status}`)
const xml = await response.text()
const urls = [...new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1].replaceAll('&amp;', '&')))]
if (!urls.length) throw new Error('Empty sitemap')
let cursor = 0
let checked = 0
const failures = []
await Promise.all([0, 1].map(async () => {
  while (cursor < urls.length) {
    const url = urls[cursor++]
    if (new URL(url).origin !== base.origin) throw new Error('Unexpected sitemap origin')
    try {
      const result = await fetch(url, { signal: AbortSignal.timeout(15000) })
      await result.arrayBuffer()
      if (result.status !== 200) failures.push({ url, status: result.status })
    } catch { failures.push({ url, status: 'request failed' }) }
    checked++
    if (checked % 100 === 0) console.log(`Checked ${checked}/${urls.length}`)
  }
}))
console.log(JSON.stringify({ checked, failures }, null, 2))
process.exitCode = failures.length ? 1 : 0
