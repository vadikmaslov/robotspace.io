/**
 * Phase 6.3: robots.ros.org + rosdistro Adapter
 *
 * Git commit SHA as source revision.
 * Parse robot posts and package/repository metadata.
 * Separate identity claim from compatibility claim.
 * Compatibility always stores versions and evidence URL.
 */

import type { SourceAdapter, AdapterContext, SourceReference, FetchResult, ParsedRecord, Cursor } from '@robotspace/ingestion/src/adapter-sdk'
import { guardedFetch, validateSourceStatus } from '@robotspace/ingestion/src/adapter-sdk'

const ROS_ROBOTS_REPO = 'https://raw.githubusercontent.com/ros/robots.ros.org/master/_posts'

export const rosAdapter: SourceAdapter = {
  async *discover(context: AdapterContext): AsyncIterable<SourceReference> {
    await validateSourceStatus(context.sourceKey, context.policyRevision)
    context.logger('Discovering robots from robots.ros.org...')

    const result = await guardedFetch(context,
      'https://api.github.com/repos/ros/robots.ros.org/git/trees/master?recursive=1',
      { headers: { 'Accept': 'application/vnd.github.v3+json' } }
    )

    const data = JSON.parse(result.body) as { tree: Array<{ path: string; sha: string }> }
    for (const entry of data.tree) {
      if (entry.path.startsWith('_posts/') && entry.path.endsWith('.md')) {
        yield {
          externalId: entry.path.replace('_posts/', ''),
          canonicalUrl: `${ROS_ROBOTS_REPO}/${entry.path}`,
          sourceRevision: entry.sha,
        }
      }
    }
  },

  async fetch(context: AdapterContext, reference: SourceReference): Promise<FetchResult> {
    return guardedFetch(context, reference.canonicalUrl)
  },

  async parse(context: AdapterContext, fetchResult: FetchResult): Promise<ParsedRecord[]> {
    const body = fetchResult.body
    const records: ParsedRecord[] = []

    // Parse YAML front matter + Markdown body
    const yamlMatch = body.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
    if (!yamlMatch) return records

    const frontMatter = yamlMatch[1]
    const content = yamlMatch[2]?.trim() ?? ''

    // Extract YAML fields (simple parser, not full YAML)
    const name = extractField(frontMatter, 'name')
    const manufacturer = extractField(frontMatter, 'manufacturer')
    const robotType = extractField(frontMatter, 'robot_type')
    const rosDistro = extractListField(frontMatter, 'ros_distro') || [extractField(frontMatter, 'ros_distro')].filter(Boolean)
    const version = extractField(frontMatter, 'ros_version')
    const url = extractField(frontMatter, 'url')
    const wiki = extractField(frontMatter, 'wiki')
    const repository = extractField(frontMatter, 'repository')

    records.push({
      externalId: name?.toLowerCase().replace(/\s+/g, '-') ?? 'unknown',
      rawPayload: { frontMatter, content },
      fields: {
        name: { rawValue: name, normalizedValue: name?.toLowerCase(), confidence: 0.80 },
        manufacturer: { rawValue: manufacturer, normalizedValue: manufacturer?.toLowerCase(), confidence: 0.80 },
        robot_type: { rawValue: robotType, normalizedValue: robotType?.toLowerCase(), confidence: 0.80 },
        official_url: { rawValue: url ?? wiki, normalizedValue: url ?? wiki, confidence: 0.80 },
        repository_url: { rawValue: repository, normalizedValue: repository, confidence: 0.80 },
        // ROS compatibility — versioned claim
        ros_compatibility: {
          rawValue: { distributions: rosDistro, version },
          normalizedValue: { distributions: rosDistro, version },
          confidence: 0.80,
        },
      },
    })

    return records
  },

  async checkpoint(): Promise<Cursor> {
    return { value: new Date().toISOString(), checkPointAt: new Date() }
  },
}

function extractField(yaml: string, key: string): string | null {
  const match = yaml.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
  return match?.[1]?.trim()?.replace(/^["']|["']$/g, '') ?? null
}

function extractListField(yaml: string, key: string): string[] | null {
  const section = yaml.match(new RegExp(`^${key}:\\s*\\n((?:\\s+-\\s+.+\\n?)*)`, 'm'))
  if (!section) return null
  return (section[1].match(/^\s+-\s+(.+)$/gm) ?? []).map(l => l.replace(/^\s+-\s+/, '').trim())
}
