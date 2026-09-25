/**
 * Phase 6.2: Wikimedia Commons API Adapter
 *
 * imageinfo/extmetadata for license-aware image discovery.
 * Per-file: author, credit, license URL, dimensions, MIME.
 * Per Commons policy: reuse only with correct attribution verification.
 */

import type { SourceAdapter, AdapterContext, SourceReference, FetchResult, ParsedRecord, Cursor } from '@robotspace/ingestion/src/adapter-sdk'
import { guardedFetch, validateSourceStatus } from '@robotspace/ingestion/src/adapter-sdk'

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php'
const COMMONS_USER_AGENT = 'RobotSpace-Bot/1.0 (https://robotspace.io)'

export const commonsAdapter: SourceAdapter = {
  async *discover(context: AdapterContext, cursor: Cursor | null): AsyncIterable<SourceReference> {
    await validateSourceStatus(context.sourceKey, context.policyRevision)

    // Search for robotics images in Commons
    const query = 'robot industrial OR humanoid OR service'
    const url = `${COMMONS_API}?action=query&list=search&srsearch=${encodeURIComponent(query)}&srnamespace=6&srlimit=100&format=json&origin=*`

    const result = await guardedFetch(context, url, {
      headers: { 'User-Agent': COMMONS_USER_AGENT },
    })

    const data = JSON.parse(result.body) as {
      query: { search: Array<{ title: string; timestamp: string }> }
    }

    for (const hit of data.query.search) {
      yield {
        externalId: hit.title.replace('File:', ''),
        canonicalUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(hit.title.replace('File:', ''))}`,
        sourceRevision: hit.timestamp,
      }
    }
  },

  async fetch(context: AdapterContext, reference: SourceReference): Promise<FetchResult> {
    const filename = reference.externalId
    const url = `${COMMONS_API}?action=query&titles=File:${encodeURIComponent(filename)}&prop=imageinfo&iiprop=extmetadata|url|size|mime|sha1&iiurlwidth=800&format=json`

    return guardedFetch(context, url, {
      headers: { 'User-Agent': COMMONS_USER_AGENT },
    })
  },

  async parse(context: AdapterContext, fetchResult: FetchResult): Promise<ParsedRecord[]> {
    const data = JSON.parse(fetchResult.body) as {
      query: { pages: Record<string, { imageinfo?: Array<{
        url: string
        descriptionurl: string
        mime: string
        size: number
        width: number
        height: number
        sha1: string
        extmetadata?: {
          Artist?: { value: string }
          Credit?: { value: string }
          LicenseUrl?: { value: string }
          LicenseShortName?: { value: string }
          Attribution?: { value: string }
          ImageDescription?: { value: string }
          Copyrighted?: { value: string }
        }
      }> }> }
    }

    const records: ParsedRecord[] = []
    for (const [, page] of Object.entries(data.query.pages)) {
      const ii = page.imageinfo?.[0]
      if (!ii) continue

      const meta = ii.extmetadata ?? {}

      records.push({
        externalId: ii.sha1,
        rawPayload: { ...ii, pageId: Object.keys(data.query.pages)[0] },
        fields: {
          image_url: { rawValue: ii.url, normalizedValue: ii.url, confidence: 0.90 },
          description_url: { rawValue: ii.descriptionurl, normalizedValue: ii.descriptionurl, confidence: 0.90 },
          mime_type: { rawValue: ii.mime, normalizedValue: ii.mime, confidence: 0.90 },
          width: { rawValue: ii.width, normalizedValue: ii.width, confidence: 0.90 },
          height: { rawValue: ii.height, normalizedValue: ii.height, confidence: 0.90 },
          sha1_hash: { rawValue: ii.sha1, normalizedValue: ii.sha1, confidence: 0.90 },
          author: { rawValue: meta.Artist?.value, normalizedValue: meta.Artist?.value?.toLowerCase(), confidence: 0.85 },
          license_url: { rawValue: meta.LicenseUrl?.value, normalizedValue: meta.LicenseUrl?.value, confidence: 0.85 },
          license_name: { rawValue: meta.LicenseShortName?.value, normalizedValue: meta.LicenseShortName?.value?.toLowerCase(), confidence: 0.85 },
          attribution: { rawValue: meta.Attribution?.value, normalizedValue: meta.Attribution?.value, confidence: 0.85 },
          is_copyrighted: { rawValue: meta.Copyrighted?.value === 'True', normalizedValue: meta.Copyrighted?.value === 'True', confidence: 0.85 },
        },
      })
    }

    return records
  },

  async checkpoint(): Promise<Cursor> {
    return { value: new Date().toISOString(), checkPointAt: new Date() }
  },
}
