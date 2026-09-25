/**
 * Phase 6.4: arXiv Atom API Adapter
 *
 * Respect: 1 request per 3 seconds, single connection.
 * arXiv ID/version as stable identity.
 * Metadata: title, authors, abstract, categories, license.
 * PDF not downloaded by default.
 */

import type { SourceAdapter, AdapterContext, SourceReference, FetchResult, ParsedRecord, Cursor } from '@robotspace/ingestion/src/adapter-sdk'
import { guardedFetch, validateSourceStatus, checkRawPolicy } from '@robotspace/ingestion/src/adapter-sdk'

const ARXIV_API = 'https://export.arxiv.org/api/query'

export const arxivAdapter: SourceAdapter = {
  async *discover(context: AdapterContext, cursor: Cursor | null): AsyncIterable<SourceReference> {
    await validateSourceStatus(context.sourceKey, context.policyRevision)
    context.logger('Discovering robotics papers from arXiv...')

    const query = `cat:cs.RO&sortBy=submittedDate&sortOrder=descending&max_results=100`
    const result = await guardedFetch(context, `${ARXIV_API}?search_query=${encodeURIComponent(query)}`)

    // Parse Atom XML for entry IDs
    const ids = [...result.body.matchAll(/<id>(.*?)<\/id>/g)].map(m => m[1])
    const versions = [...result.body.matchAll(/<arxiv:version[^>]*>(\d+)<\/arxiv:version>/g)].map(m => m[1])

    for (let i = 0; i < ids.length; i++) {
      const arxivId = ids[i].replace('http://arxiv.org/abs/', '')
      yield {
        externalId: arxivId,
        canonicalUrl: `https://arxiv.org/abs/${arxivId}`,
        sourceRevision: versions[i] ?? '1',
      }
    }

    context.logger(`Discovered ${ids.length} papers`)
  },

  async fetch(context: AdapterContext, reference: SourceReference): Promise<FetchResult> {
    // Rate limit: 1 req/3s
    await new Promise(r => setTimeout(r, 3000))
    return guardedFetch(context, `${ARXIV_API}?id_list=${reference.externalId}`)
  },

  async parse(context: AdapterContext, fetchResult: FetchResult): Promise<ParsedRecord[]> {
    const body = fetchResult.body
    const records: ParsedRecord[] = []

    // Simple Atom XML parsing
    const title = body.match(/<title>(.*?)<\/title>/)?.[1]?.trim()
    const summary = body.match(/<summary>(.*?)<\/summary>/)?.[1]?.trim()
    const published = body.match(/<published>(.*?)<\/published>/)?.[1]
    const updated = body.match(/<updated>(.*?)<\/updated>/)?.[1]
    const authors = [...body.matchAll(/<name>(.*?)<\/name>/g)].map(m => m[1])
    const categories = [...body.matchAll(/category term="(.*?)"/g)].map(m => m[1])
    const doi = body.match(/<arxiv:doi>(.*?)<\/arxiv:doi>/)?.[1]
    const license = body.match(/<arxiv:license>(.*?)<\/arxiv:license>/)?.[1]
    const arxivId = body.match(/<id>(.*?)<\/id>/)?.[1]?.replace('http://arxiv.org/abs/', '')

    records.push({
      externalId: arxivId ?? 'unknown',
      rawPayload: { body },
      fields: {
        title: { rawValue: title, normalizedValue: title?.toLowerCase(), confidence: 0.95 },
        abstract: { rawValue: summary, normalizedValue: summary?.toLowerCase(), confidence: 0.93 },
        authors: { rawValue: authors, normalizedValue: authors.map(a => a.toLowerCase()), confidence: 0.95 },
        published_at: { rawValue: published, normalizedValue: published, confidence: 0.95 },
        updated_at: { rawValue: updated, normalizedValue: updated, confidence: 0.95 },
        categories: { rawValue: categories, normalizedValue: categories.map(c => c.toLowerCase()), confidence: 0.93 },
        doi: { rawValue: doi, normalizedValue: doi?.toLowerCase(), confidence: 0.97 },
        license_url: { rawValue: license, normalizedValue: license, confidence: 0.90 },
        arxiv_id: { rawValue: arxivId, normalizedValue: arxivId, confidence: 0.97 },
      },
    })

    return records
  },

  async checkpoint(): Promise<Cursor> {
    return { value: new Date().toISOString(), checkPointAt: new Date() }
  },
}
