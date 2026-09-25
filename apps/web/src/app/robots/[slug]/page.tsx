import { prisma } from '@robotspace/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { RobotImage } from '../robot-image'
import { CompareButton } from '../compare-button'
import { getUnibotRobotImageMap } from '../../../lib/unibot-robot-images'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const name = slug.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  return { title: `${name} — Robot Specifications`, description: `Verified specifications, payload, reach, weight, and manufacturer details for ${name}.` }
}

export default async function RobotDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  let robot: any = null
  let manufacturer: any = null
  let unibotImageUrl: string | null = null
  let news: Array<{ title: string; published_at: Date; list_summary: string | null }> = []

  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT robot_public_projections.*, categories.name_en AS category_name
       FROM robot_public_projections
       LEFT JOIN categories ON categories.id = robot_public_projections.category_id
       WHERE replace(lower(trim(canonical_name)), ' ', '-') = $1
         AND lifecycle_status = 'ACTIVE'
       LIMIT 1`,
      slug,
    )
    robot = rows[0] ?? null
    if (robot) {
      news = await prisma.$queryRawUnsafe(`SELECT a.title,a.published_at,a.list_summary FROM entity_mentions m JOIN articles a ON a.id=m.article_id WHERE m.entity_id=$1::uuid AND COALESCE(a.publication_status,'PUBLISHED')='PUBLISHED' ORDER BY a.published_at DESC LIMIT 6`, robot.robot_entity_id)
      unibotImageUrl = (await getUnibotRobotImageMap([robot.unibot_id])).get(robot.unibot_id) ?? null
      // Find manufacturer via robot_company_relations
      const rels = await prisma.robot_company_relations.findMany({
        where: { robot_entity_id: robot.robot_entity_id, relation: 'MANUFACTURES' },
        take: 1,
      })
      if (rels.length > 0) {
        const rows = await prisma.$queryRawUnsafe<any[]>(`
          SELECT canonical_name, country_code, founded_year, image_url, summary
          FROM company_public_projections
          WHERE company_entity_id = $1::uuid
        `, rels[0].company_entity_id)
        if (rows.length > 0) manufacturer = rows[0]
      }
    }
  } catch (e) {
    console.error('[robot]', e)
  }

  if (!robot) notFound()
  const categoryName = robot.category_name || 'Other'

  const coreSpecs = [
    ['Payload', robot.payload_kg != null ? `${robot.payload_kg} kg` : null],
    ['Reach', robot.reach_mm != null ? `${robot.reach_mm} mm` : null],
    ['Weight', robot.weight_kg != null ? `${robot.weight_kg} kg` : null],
    ['Status', robot.lifecycle_status || 'Active'],
    ['Category', categoryName],
    ['Verified', robot.last_verified_at ? new Date(robot.last_verified_at).toISOString().slice(0, 10) : 'Today'],
  ].filter(([, v]) => v != null)
  const knownLabels = /^(payload|max(?:imum)?\s*(?:load|payload)|load\s*capacity|lifting\s*capacity|strength|carry(?:ing)?\s*capacity|reach|working\s*radius|maximum\s*reach|arm\s*length|weight|mass|net\s*weight)(?:\s*\[[^\]]+\])?$/i
  // Catalog product pages are evidence, not verified official URLs.  Do not
  // expose their copied Website/URL fields as a robot specification.
  const websiteLabel = /^(?:website|official\s*(?:website|url|site)|product\s*(?:page\s*)?url|url)$/i
  const extraSpecs = Object.entries(robot.extra_specs && typeof robot.extra_specs === 'object' ? robot.extra_specs : {})
    .filter(([label, value]) => typeof label === 'string' && typeof value === 'string' && !knownLabels.test(label) && !websiteLabel.test(label.trim()))
    .map(([label, value]) => [label, value] as [string, string])
  const specs = [...coreSpecs, ...extraSpecs]

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-8">
      <Link href="/robots" className="text-sm inline-block mb-6" style={{ color: 'var(--color-text-muted)' }}>
        ← Back to Robots
      </Link>

      {/* Hero */}
      <div className="grid grid-cols-1 md:grid-cols-[400px_1fr] gap-12 mb-8">
        <div className="w-full aspect-square rounded-xl border flex items-center justify-center overflow-hidden"
          style={{ background: '#fff', borderColor: 'var(--color-border-color)' }}>
          <RobotImage imageUrl={robot.image_url} unibotImageUrl={unibotImageUrl} fallbackUrl={manufacturer?.image_url || null} size="lg" />
        </div>

        <div className="flex flex-col justify-center">
          <span className="inline-block text-xs px-3 py-1 rounded-full border mb-3 w-fit"
            style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border-color)', background: 'var(--color-tag-bg)' }}>
            {categoryName}
          </span>

          <h1 className="text-4xl font-semibold tracking-tight" style={{ color: 'var(--color-text-heading)' }}>
            {robot.canonical_name}
          </h1>

          {manufacturer && (
            <div className="text-lg mt-1" style={{ color: 'var(--color-text-muted)' }}>
              by <Link href={`/companies/${manufacturer.canonical_name?.toLowerCase().replace(/\s+/g, '-')}`} className="hover:underline" style={{ color: 'var(--color-accent-b2b)' }}>{manufacturer.canonical_name}</Link>
            </div>
          )}

          <div className="flex gap-4 mt-4 text-sm items-center" style={{ color: 'var(--color-text-muted)' }}>
            {robot.last_verified_at && (
              <>Verified {new Date(robot.last_verified_at).toISOString().slice(0, 10)}</>
            )}
          </div>

          <div className="flex gap-2 mt-6">
            <Link href={`/quote?robot=${encodeURIComponent(robot.canonical_name)}`}
              className="px-5 py-2.5 rounded-md text-sm font-medium transition-opacity hover:opacity-90"
              style={{ background: 'var(--color-accent-cta)', color: 'var(--color-accent-cta-text)' }}>
              Request a Quote
            </Link>
            <CompareButton robotId={robot.id} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b" style={{ borderColor: 'var(--color-border-color)' }}>
        {['Overview', 'Specifications'].map((tab: string) => (
          <a key={tab} href={`#${tab.toLowerCase()}`}
            className="px-4 py-2.5 text-sm border-b-2 -mb-[1px] transition-colors"
            style={{ color: 'var(--color-text-heading)', borderColor: 'var(--color-accent-cta)', fontWeight: 510 }}>
            {tab}
          </a>
        ))}
      </div>

      {/* Overview */}
      <section id="overview" className="space-y-8 pb-8">
        <h2 className="text-xl font-medium" style={{ color: 'var(--color-text-heading)' }}>
          About {robot.canonical_name}
        </h2>
        <p style={{ color: 'var(--color-text-muted)', maxWidth: 700, lineHeight: 1.7 }}>
          {robot.summary || `${robot.canonical_name} is a ${categoryName.toLowerCase()} platform with verified specifications and data provenance.`}
        </p>

        {/* Manufacturer card */}
        {manufacturer && (
          <>
            <hr style={{ borderColor: 'var(--color-border-color)' }} />
            <h2 className="text-xl font-medium" style={{ color: 'var(--color-text-heading)' }}>Manufacturer</h2>
            <div className="flex items-start gap-4 p-5 rounded-xl"
              style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}>
              <div className="w-12 h-12 rounded-md border flex items-center justify-center text-2xl flex-shrink-0"
                style={{ background: '#fff', borderColor: 'var(--color-border-color)' }}>🏢</div>
              <div>
                <h3 className="text-sm font-medium" style={{ color: 'var(--color-text-heading)' }}>
                  <Link href={`/companies/${manufacturer.canonical_name?.toLowerCase().replace(/\s+/g, '-')}`} className="hover:underline">
                    {manufacturer.canonical_name}
                  </Link>
                </h3>
                {manufacturer.country_code && (
                  <div className="text-xs mt-1" style={{ color: 'var(--color-text-dim)' }}>
                    {manufacturer.country_code}{manufacturer.founded_year ? ` · Founded ${manufacturer.founded_year}` : ''}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </section>

      {/* Specifications */}
      <section id="specifications" className="pb-8">
        <h2 className="text-xl font-medium mb-6" style={{ color: 'var(--color-text-heading)' }}>Key Specifications</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {specs.map(([label, value]: any) => (
            <div key={label} className="p-4 rounded-xl" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}>
              <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-dim)' }}>{label}</div>
              <div className="text-sm font-mono" style={{ color: 'var(--color-text-body)' }}>{value}</div>
            </div>
          ))}
        </div>
      </section>

      {news.length > 0 && <section className="pb-8"><h2 className="text-xl font-medium mb-4" style={{ color: 'var(--color-text-heading)' }}>Mentioned in news</h2><div className="grid md:grid-cols-2 gap-4">{news.map(item => <Link key={item.title} href={`/insights/${item.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 80)}`} className="rounded-xl border p-4 hover:bg-[var(--color-bg-elevated)]" style={{ borderColor: 'var(--color-border-color)' }}><div className="text-xs" style={{ color: 'var(--color-text-dim)' }}>{new Date(item.published_at).toISOString().slice(0, 10)}</div><h3 className="mt-2 text-sm font-medium" style={{ color: 'var(--color-text-heading)' }}>{item.title}</h3>{item.list_summary && <p className="mt-2 text-sm line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>{item.list_summary}</p>}</Link>)}</div></section>}

      {/* Source disclosure */}
      <div className="text-center pt-8 border-t" style={{ borderColor: 'var(--color-border-color)' }}>
        <p className="text-xs" style={{ color: 'var(--color-text-dim)' }}>
          Data sourced from Wikidata · Last verified: {robot.last_verified_at ? new Date(robot.last_verified_at).toISOString().slice(0, 10) : 'Today'}
          {' · '}<Link href="/methodology" className="underline" style={{ color: 'var(--color-text-muted)' }}>Methodology</Link>
        </p>
      </div>
    </div>
  )
}
