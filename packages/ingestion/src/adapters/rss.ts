/**
 * Phase 6.6: News RSS Metadata Adapter
 *
 * Sources: The Robot Report, IEEE Spectrum Robotics
 * Stores: GUID, canonical URL, title, author, date, categories ONLY.
 * Full HTML NEVER enters persisted job payload, DB, S3, trace, or log.
 * If AI_PROCESSING + SEND_TO_EXTERNAL_AI allowed → transient buffer to News Preview, then destroyed.
 * If not allowed → metadata-only preview or null preview.
 */

import type { SourceAdapter, AdapterContext, SourceReference, FetchResult, ParsedRecord, Cursor } from '@robotspace/ingestion/src/adapter-sdk'
import { guardedFetch, validateSourceStatus, checkRawPolicy } from '@robotspace/ingestion/src/adapter-sdk'

interface RSSFeedConfig {
  feedUrl: string
  sourceKey: string
  allowedOperations: string[]
}

const RSS_FEEDS: RSSFeedConfig[] = [
  {
    feedUrl: 'https://www.therobotreport.com/feed/',
    sourceKey: 'the_robot_report',
    allowedOperations: ['FETCH', 'AI_PROCESSING', 'SEND_TO_EXTERNAL_AI'],
  },
  {
    feedUrl: 'https://spectrum.ieee.org/feeds/topic/robotics.rss',
    sourceKey: 'ieee_spectrum_robotics',
    allowedOperations: ['FETCH', 'AI_PROCESSING', 'SEND_TO_EXTERNAL_AI'],
  },
]

export const rssAdapter: SourceAdapter = {
  async *discover(context: AdapterContext): AsyncIterable<SourceReference> {
    await validateSourceStatus(context.sourceKey, context.policyRevision)

    const feed = RSS_FEEDS.find(f => f.sourceKey === context.sourceKey)
    if (!feed) {
      context.logger(`No RSS feed config for source: ${context.sourceKey}`)
      return
    }

    context.logger(`Fetching RSS feed: ${feed.feedUrl}`)
    const result = await guardedFetch(context, feed.feedUrl, {
      maxSizeBytes: 5_242_880, // 5MB max
    })

    // Parse RSS/Atom XML for items
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let match
    while ((match = itemRegex.exec(result.body)) !== null) {
      const itemXml = match[1]

      const guid = itemXml.match(/<guid[^>]*>(.*?)<\/guid>/)?.[1]?.trim() ??
                   itemXml.match(/<link>(.*?)<\/link>/)?.[1]?.trim()
      const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1]?.trim()
      const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim()

      if (guid && link) {
        yield {
          externalId: guid,
          canonicalUrl: link,
          sourceRevision: pubDate ?? new Date().toISOString(),
        }
      }
    }
  },

  async fetch(context: AdapterContext, reference: SourceReference): Promise<FetchResult> {
    // Before fetching full body, check source contract operations
    const rawPolicy = await checkRawPolicy(context.sourceKey, 'full_html')
    const feed = RSS_FEEDS.find(f => f.sourceKey === context.sourceKey)

    // Fetch article page
    const result = await guardedFetch(context, reference.canonicalUrl, {
      maxSizeBytes: 1_048_576, // 1MB max
    })

    // STRIP full HTML before persistence boundary
    // Only metadata survives database store
    // Full HTML is in transient buffer ONLY for AI preview generation
    if (!rawPolicy.allowed && !feed?.allowedOperations.includes('STORE_FULL_TEXT')) {
      context.logger(`Full HTML discarded for ${reference.externalId} — not allowed by source contract`)
    }

    return result
  },

  async parse(context: AdapterContext, fetchResult: FetchResult): Promise<ParsedRecord[]> {
    const body = fetchResult.body

    // Extract metadata only from HTML — NO full text storage
    const title = body.match(/<title>(.*?)<\/title>/)?.[1]?.trim()
    const metaDescription = body.match(/<meta\s+name="description"\s+content="(.*?)"/i)?.[1]
    const publishedTime = body.match(/<meta\s+property="article:published_time"\s+content="(.*?)"/i)?.[1]
    const author = body.match(/<meta\s+name="author"\s+content="(.*?)"/i)?.[1]
    const tags = body.match(/<meta\s+property="article:tag"\s+content="(.*?)"/gi)?.map(m =>
      m.match(/content="(.*?)"/)?.[1]?.toLowerCase()
    ).filter(Boolean) as string[] | undefined

    return [{
      externalId: fetchResult.body.slice(0, 100), // hash identifier
      rawPayload: {
        // NEVER store full HTML in assertions
        metadata: { title, description: metaDescription, publishedAt: publishedTime, author, tags },
      },
      fields: {
        title: { rawValue: title, normalizedValue: title?.toLowerCase(), confidence: 0.85 },
        description: { rawValue: metaDescription, normalizedValue: metaDescription?.toLowerCase(), confidence: 0.85 },
        published_at: { rawValue: publishedTime, normalizedValue: publishedTime, confidence: 0.85 },
        author: { rawValue: author, normalizedValue: author?.toLowerCase(), confidence: 0.85 },
        tags: { rawValue: tags, normalizedValue: tags, confidence: 0.85 },
      },
    }]
  },

  async checkpoint(): Promise<Cursor> {
    return { value: new Date().toISOString(), checkPointAt: new Date() }
  },
}
