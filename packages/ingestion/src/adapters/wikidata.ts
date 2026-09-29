/**
 * Phase 6.1: Wikidata SPARQL Source Adapter
 *
 * SPARQL discovery with identifying User-Agent.
 * QID + revision as stable identity.
 * Extracts: labels, aliases, manufacturer relation, country, dates, official URL, Commons reference.
 * 
 * Confidence caps:
 * - Identity/basic relation: 0.65
 * - Technical specification: 0.45 (never published alone)
 * 
 * Freshness SLA: 7 days
 * Rate limit: backoff on 429
 */

import type { SourceAdapter, AdapterContext, SourceReference, FetchResult, ParsedRecord, Cursor } from '@robotspace/ingestion/src/adapter-sdk'
import { guardedFetch, validateSourceStatus, checkRawPolicy } from '@robotspace/ingestion/src/adapter-sdk'

const WIKIDATA_SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql'
const WIKIDATA_USER_AGENT = 'RobotSpace-Bot/1.0 (https://robotspace.io)'

// P31 (instance of) values for robotics-related items
const ROBOT_INSTANCE_IDS = [
  'Q11012',     // robot
  'Q1758394',   // industrial robot
  'Q1156719',   // humanoid robot
  'Q1632314',   // autonomous robot
  'Q2923144',   // service robot
  'Q1058487',   // military robot
  'Q2424826',   // medical robot
  'Q977159',    // agricultural robot
]

// SPARQL property IDs for data extraction
const SPARQL_PROPS = {
  label: 'rdfs:label',
  description: 'schema:description',
  instanceOf: 'wdt:P31',
  manufacturer: 'wdt:P176',
  country: 'wdt:P17',
  officialWebsite: 'wdt:P856',
  commonsCategory: 'wdt:P373',
  image: 'wdt:P18',
  inception: 'wdt:P571',       // date founded/introduced
  mass: 'wdt:P2067',
  width: 'wdt:P2049',
  height: 'wdt:P2048',
}

// ============================================================
// ADAPTER IMPLEMENTATION
// ============================================================

export const wikidataAdapter: SourceAdapter = {
  async *discover(context: AdapterContext, cursor: Cursor | null): AsyncIterable<SourceReference> {
    await validateSourceStatus(context.sourceKey, context.policyRevision)
    context.logger('Discovering robots from Wikidata SPARQL...')

    const instanceFilter = ROBOT_INSTANCE_IDS.map(id => `wd:${id}`).join(' | ')

    const query = `
      SELECT DISTINCT ?item WHERE {
        ?item wdt:P31/wdt:P279* ?instance .
        VALUES ?instance { ${instanceFilter} }
        ?item wdt:P176 ?manufacturer .
      }
      LIMIT 500
    `

    const result = await guardedFetch(context, `${WIKIDATA_SPARQL_ENDPOINT}?format=json&query=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': WIKIDATA_USER_AGENT },
    })

    const data = JSON.parse(result.body) as {
      results: { bindings: Array<{ item: { value: string } }> }
    }

    for (const binding of data.results.bindings) {
      const qid = binding.item.value.split('/').pop()!
      yield {
        externalId: qid,
        canonicalUrl: `https://www.wikidata.org/wiki/${qid}`,
        sourceRevision: 'latest', // Wikidata doesn't expose revision in SPARQL
      }
    }

    context.logger(`Discovered ${data.results.bindings.length} robots via SPARQL`)
  },

  async fetch(context: AdapterContext, reference: SourceReference): Promise<FetchResult> {
    await validateSourceStatus(context.sourceKey, context.policyRevision)

    const qid = reference.externalId
    const url = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`

    return guardedFetch(context, url, {
      headers: { 'User-Agent': WIKIDATA_USER_AGENT },
      maxSizeBytes: 10_485_760, // 10MB max for entity JSON
    })
  },

  async parse(context: AdapterContext, fetchResult: FetchResult): Promise<ParsedRecord[]> {
    const entityData = JSON.parse(fetchResult.body) as {
      entities: Record<string, {
        id: string
        type: string
        labels: Record<string, { value: string; language: string }>
        descriptions: Record<string, { value: string; language: string }>
        aliases: Record<string, Array<{ value: string; language: string }>>
        claims: Record<string, Array<{ mainsnak: { datavalue: { value: unknown; type: string } }; qualifiers?: Record<string, Array<{ datavalue: { value: unknown } }>> }>>
      }>
    }

    const records: ParsedRecord[] = []

    for (const [qid, entity] of Object.entries(entityData.entities)) {
      const fields: Record<string, any> = {}

      // Label (English preferred, fallback to any)
      const label = entity.labels?.en?.value
        ?? entity.labels?.[Object.keys(entity.labels ?? {})[0] ?? '']?.value
        ?? entity.id

      fields.name = {
        rawValue: label,
        normalizedValue: label?.toLowerCase().trim(),
        confidence: 0.65,
      }

      // Aliases (all languages merged)
      const aliases: string[] = []
      for (const [, aliasList] of Object.entries(entity.aliases ?? {})) {
        for (const alias of aliasList) {
          aliases.push(alias.value)
        }
      }
      fields.aliases = {
        rawValue: aliases,
        normalizedValue: aliases.map(a => a.toLowerCase().trim()),
        confidence: 0.65,
      }

      // Manufacturer (P176)
      const manufacturerClaim = entity.claims?.P176
      if (manufacturerClaim?.[0]) {
        const mfrQid = (manufacturerClaim[0].mainsnak.datavalue?.value as any)?.id
        fields.manufacturer_qid = {
          rawValue: mfrQid,
          normalizedValue: mfrQid,
          confidence: 0.65,
        }
      }

      // Country (P17)
      const countryClaim = entity.claims?.P17
      if (countryClaim?.[0]) {
        const countryQid = (countryClaim[0].mainsnak.datavalue?.value as any)?.id
        fields.country_qid = {
          rawValue: countryQid,
          normalizedValue: countryQid,
          confidence: 0.65,
        }
      }

      // Official website (P856)
      const websiteClaim = entity.claims?.P856
      if (websiteClaim?.[0]) {
        const url = (websiteClaim[0].mainsnak.datavalue?.value as any)
        fields.official_url = {
          rawValue: url,
          normalizedValue: url,
          confidence: 0.65,
        }
      }

      // Image (P18) — Commons filename
      const imageClaim = entity.claims?.P18
      if (imageClaim?.[0]) {
        const filename = (imageClaim[0].mainsnak.datavalue?.value as any)
        fields.commons_image = {
          rawValue: filename,
          normalizedValue: filename?.replace(/ /g, '_'),
          confidence: 0.65,
        }
      }

      // Technical specs (LOW confidence — never published alone)
      const massClaim = entity.claims?.P2067
      if (massClaim?.[0]) {
        const mass = (massClaim[0].mainsnak.datavalue?.value as any)?.amount
        const unit = (massClaim[0].mainsnak.datavalue?.value as any)?.unit
        fields.payload_kg = {
          rawValue: { amount: mass, unit },
          normalizedValue: mass ? parseFloat(mass) : null,
          confidence: 0.45, // Wikidata technical spec — low confidence
        }
      }

      records.push({
        externalId: qid,
        rawPayload: entityData,
        fields,
      })
    }

    return records
  },

  async checkpoint(): Promise<Cursor> {
    return {
      value: new Date().toISOString(),
      checkPointAt: new Date(),
    }
  },
}
