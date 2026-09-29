import assert from 'node:assert/strict'
import { test } from 'node:test'
import { catalogParams, catalogPageUrl, numberRange, escapedLike } from '../apps/web/src/lib/catalog-params'
import { robotUrl, articleSlug, decodeRouteSegment } from '../apps/web/src/lib/public-urls'
import { escapeXml } from '../apps/web/src/lib/svg-text'
import { readBoundedImage, MAX_IMAGE_BYTES } from '../apps/web/src/lib/image-security'

test('catalog ranges reject invalid, inverted and non-finite values', () => {
  for (const value of ['NaN', 'Infinity', '-1', '1e99', '1000001']) assert.ok(catalogParams({ payload_min: value }).error)
  assert.ok(catalogParams({ reach_min: '10', reach_max: '0' }).error)
  assert.equal(catalogParams({ payload_min: '0', payload_max: '0' }).error, null)
  assert.deepEqual(numberRange('0', '0'), { gte: 0, lte: 0 })
  assert.deepEqual(numberRange('', ''), {})
  assert.equal(catalogParams({ country: 'Germany', page: '1.5' }).values.country, 'DE')
  assert.equal(catalogParams({ page: 'Infinity', q: ['x', 'y'] }).page, 1)
})
test('pagination preserves filters and escapes query separators', () => {
  const params = catalogParams({ q: 'A&B #1', country: 'JP', category: 'industrial', payload_min: '0', reach_max: '500' }).values
  const url = new URL(catalogPageUrl('/robots', params, 2), 'https://robotspace.io')
  for (const [key, value] of Object.entries(params)) if (value) assert.equal(url.searchParams.get(key), value)
  assert.equal(url.searchParams.get('page'), '2')
  assert.equal(escapedLike('50%_'), '%50\\%\\_%')
})
test('routes encode reserved characters without changing existing names', () => {
  assert.equal(robotUrl(' IRB  6700 '), '/robots/irb-6700')
  assert.equal(robotUrl('Robot/#1'), '/robots/robot%2F%231')
  assert.equal(articleSlug('A'.repeat(100)).length, 80)
  assert.equal(decodeRouteSegment('jaka-%CF%80'), 'jaka-π')
  assert.equal(decodeRouteSegment('robot-%2B-1'), 'robot-+-1')
  assert.equal(decodeRouteSegment('bad-%ZZ'), null)
})
test('SVG text cannot introduce markup', () => {
  const value = escapeXml('</text><script>alert("x")</script>&')
  assert.equal(value.includes('<'), false)
  assert.ok(value.includes('&lt;script&gt;'))
})
test('image stream limit applies even without a Content-Length header', async () => {
  let cancelled = false
  const response = new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)) },
    cancel() { cancelled = true },
  }))
  await assert.rejects(readBoundedImage(response), /5 MB/)
  assert.equal(cancelled, true)
  assert.equal((await readBoundedImage(new Response(new Uint8Array(MAX_IMAGE_BYTES)))).length, MAX_IMAGE_BYTES)
})
