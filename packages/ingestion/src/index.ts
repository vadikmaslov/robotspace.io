/**
 * Phase 6: Adapter Registry
 * Maps source keys to adapter implementations.
 * All adapters implement SourceAdapter from ./adapter-sdk
 */

export type { SourceAdapter, AdapterContext, SourceReference, FetchResult, ParsedRecord, Cursor } from './adapter-sdk'
export { guardedFetch, validateSourceStatus, rejectOldRevisionPersistence, checkRawPolicy } from './adapter-sdk'

export { wikidataAdapter } from './adapters/wikidata'
export { commonsAdapter } from './adapters/commons'
export { rosAdapter } from './adapters/ros'
export { arxivAdapter } from './adapters/arxiv'
export { rssAdapter } from './adapters/rss'

import type { SourceAdapter } from './adapter-sdk'

/**
 * Registry maps source key → adapter implementation.
 * Usage: registry['wikidata'].discover(ctx, cursor)
 */
export const adapterRegistry: Record<string, SourceAdapter> = {
  wikidata:           require('./adapters/wikidata').wikidataAdapter,
  wikimedia_commons:  require('./adapters/commons').commonsAdapter,
  ros_robots:         require('./adapters/ros').rosAdapter,
  arxiv:              require('./adapters/arxiv').arxivAdapter,
  the_robot_report:   require('./adapters/rss').rssAdapter,
  ieee_spectrum:      require('./adapters/rss').rssAdapter,
}
