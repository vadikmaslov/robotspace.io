import { prisma } from '@robotspace/db'
import Link from 'next/link'
import { robotUrl } from '../../../lib/public-urls'
import { notFound } from 'next/navigation'
import { RobotImage } from '../../robots/robot-image'
import { getUnibotRobotImageMap } from '../../../lib/unibot-robot-images'
import { getManufacturerVoice } from '../../../lib/manufacturer-voice'
import { ManufacturerStatements } from '../../manufacturer/statements'
import Script from 'next/script'

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States', DE: 'Germany', JP: 'Japan', CH: 'Switzerland', DK: 'Denmark', CN: 'China',
  KR: 'South Korea', FR: 'France', GB: 'United Kingdom', IT: 'Italy', SE: 'Sweden', NL: 'Netherlands',
  CA: 'Canada', IL: 'Israel', IN: 'India', SG: 'Singapore', TW: 'Taiwan', ES: 'Spain', AU: 'Australia',
  NO: 'Norway', FI: 'Finland', AT: 'Austria', BE: 'Belgium', PL: 'Poland', CZ: 'Czechia', BR: 'Brazil',
  MX: 'Mexico', AE: 'United Arab Emirates', TR: 'Turkey', RU: 'Russia', BY: 'Belarus', KZ: 'Kazakhstan', UA: 'Ukraine',
}
const countryName = (c: string) => COUNTRY_NAMES[c] || c
const normalizeCompanySlug = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const name = slug.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  return { title: `${name} — Company Profile`, description: `Company profile, product catalog, and key facts for ${name}.`, alternates: { canonical: `/companies/${slug}` } }
}

export default async function CompanyDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  let company: any = null
  let robots: any[] = []
  let news: Array<{ title: string; published_at: Date; list_summary: string | null }> = []
  let unibotImageMap = new Map<string, string>()

  try {
    // Use raw SQL to get image_url (Prisma client not regenerated yet)
    const companies = await prisma.$queryRawUnsafe<any[]>(`
      SELECT projection.id, projection.company_entity_id, projection.canonical_name, projection.status, projection.official_url,
             projection.country_code, projection.founded_year, projection.summary, projection.image_url, projection.last_verified_at,
             entity.slug
      FROM company_public_projections projection
      JOIN entities entity ON entity.id = projection.company_entity_id
      WHERE entity.publication_status = 'PUBLISHED' AND entity.archived_at IS NULL
        AND projection.status = 'ACTIVE'
    `)
    const normalizedSlug = normalizeCompanySlug(slug)
    company = companies.find((c: any) => c.slug === slug)
      ?? companies.find((c: any) => normalizeCompanySlug(c.canonical_name ?? '') === normalizedSlug)
    if (company) {
      news = await prisma.$queryRawUnsafe(`SELECT a.title,a.published_at,a.list_summary FROM entity_mentions m JOIN articles a ON a.id=m.article_id WHERE m.entity_id=$1::uuid AND COALESCE(a.publication_status,'PUBLISHED')='PUBLISHED' ORDER BY a.published_at DESC LIMIT 6`, company.company_entity_id)
      const rels = await prisma.robot_company_relations.findMany({
        where: { company_entity_id: company.company_entity_id },
      })
      const relatedIds = rels.map(r => r.robot_entity_id).filter((id): id is string => Boolean(id))
      const publicRobots = await prisma.entities.findMany({ where: { id: { in: relatedIds }, publication_status: 'PUBLISHED', archived_at: null }, select: { id: true } })
      const robotIds = publicRobots.map(robot => robot.id)
      if (robotIds.length > 0) {
        robots = await prisma.robot_public_projections.findMany({
          where: { robot_entity_id: { in: robotIds.filter((id): id is string => Boolean(id)) }, lifecycle_status: 'ACTIVE' },
        })
        const categoryIds = robots.map(robot => robot.category_id).filter((id): id is string => Boolean(id))
        const categories = categoryIds.length
          ? await prisma.categories.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name_en: true } })
          : []
        const categoryNames = new Map(categories.map(category => [category.id, category.name_en]))
        robots = robots.map(robot => ({ ...robot, category_name: categoryNames.get(robot.category_id) ?? 'Other' }))
        unibotImageMap = await getUnibotRobotImageMap(robots.map((robot: any) => robot.unibot_id))
      }
    }
  } catch {}

  if (!company) notFound()
  const voice = await getManufacturerVoice(prisma, company.company_entity_id).catch(() => ({ verified: false, statements: [] }))
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: company.canonical_name,
    url: `https://robotspace.io/companies/${company.slug}`,
    description: company.summary ?? undefined,
    foundingDate: company.founded_year ? String(company.founded_year) : undefined,
    address: company.country_code ? { '@type': 'PostalAddress', addressCountry: company.country_code } : undefined,
  }

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-8">
      <Script id="company-structured-data" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
      <Link href="/companies" className="text-sm inline-block mb-6" style={{ color: 'var(--color-text-muted)' }}>← Back to Companies</Link>

      {/* Hero */}
      <div className="flex items-start gap-8 mb-10">
        <div className="w-20 h-20 rounded-xl border flex items-center justify-center text-3xl flex-shrink-0 overflow-hidden"
          style={{ background: '#fff', borderColor: 'var(--color-border-color)' }}>
          {company.image_url ? (
            <img src={company.image_url} alt="" className="w-full h-full object-contain" />) : <span>🏢</span>}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-[40px] break-words font-semibold tracking-tight" style={{ color: 'var(--color-text-heading)' }}>{company.canonical_name}</h1>
          <div className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {countryName(company.country_code || '—')}{company.founded_year ? ` · Founded ${company.founded_year}` : ''}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 items-center text-sm">{voice.verified && <span className="rounded-full border px-3 py-1" style={{ borderColor: 'var(--color-accent-b2b)' }}>Verified manufacturer</span>}<Link href={`/manufacturer?company=${encodeURIComponent(company.slug)}`} className="underline">{voice.verified ? 'Manage manufacturer access' : 'Claim this company'}</Link></div>
          <div className="flex gap-4 mt-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            <span>Robots: <strong style={{ color: 'var(--color-text-heading)' }}>{robots.length}</strong></span>
            {company.official_url && <span>Website: <strong style={{ color: 'var(--color-text-heading)' }}>{new URL(company.official_url).hostname}</strong></span>}
          </div>
        </div>
      </div>

      <ManufacturerStatements voice={voice} />

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {[
          ['Robots', String(robots.length)],
          ['Categories', String(new Set(robots.map((r: any) => r.category_name).filter(Boolean)).size) || '1'],
          ['Founded', company.founded_year ? String(company.founded_year) : '—'],
          ['Verified', company.last_verified_at ? new Date(company.last_verified_at).toISOString().slice(0, 10) : '—'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl p-5" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}>
            <div className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
            <div className="font-mono text-2xl mt-1" style={{ color: 'var(--color-text-heading)' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Products tab */}
      <div className="rounded-xl p-6" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}>
        <h2 className="text-[22px] font-normal mb-6" style={{ color: 'var(--color-text-heading)' }}>Products</h2>
        {robots.length === 0 ? (
          <p style={{ color: 'var(--color-text-dim)' }}>No products linked yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {robots.map((r: any) => (
              <Link key={r.id} href={robotUrl(r.canonical_name)}
                className="p-4 rounded-lg border transition-colors hover:bg-[var(--color-bg-elevated)]"
                style={{ borderColor: 'var(--color-border-color)' }}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-md border overflow-hidden flex-shrink-0" style={{ borderColor: 'var(--color-border-color)' }}>
                    <RobotImage imageUrl={r.image_url} unibotImageUrl={unibotImageMap.get(r.unibot_id)} fallbackUrl={company.image_url || null} size="sm" />
                  </div>
                  <div>
                    <div className="text-sm font-medium" style={{ color: 'var(--color-text-heading)' }}>{r.canonical_name}</div>
                    <div className="text-xs" style={{ color: 'var(--color-text-dim)' }}>{r.category_name}</div>
                  </div>
                </div>
                <div className="flex gap-3 text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
                  {r.payload_kg && <span>{r.payload_kg} kg</span>}
                  {r.reach_mm && <span>{r.reach_mm} mm</span>}
                  {r.weight_kg && <span>{r.weight_kg} kg</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {news.length > 0 && <div className="mt-8 rounded-xl p-6" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}><h2 className="text-[22px] font-normal mb-4" style={{ color: 'var(--color-text-heading)' }}>Mentioned in news</h2><div className="grid md:grid-cols-2 gap-4">{news.map(item => <Link key={item.title} href={`/insights/${item.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 80)}`} className="rounded-lg border p-4 hover:bg-[var(--color-bg-elevated)]" style={{ borderColor: 'var(--color-border-color)' }}><div className="text-xs" style={{ color: 'var(--color-text-dim)' }}>{new Date(item.published_at).toISOString().slice(0, 10)}</div><h3 className="mt-2 text-sm font-medium" style={{ color: 'var(--color-text-heading)' }}>{item.title}</h3>{item.list_summary && <p className="mt-2 text-sm line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>{item.list_summary}</p>}</Link>)}</div></div>}

      {/* About */}
      {company.summary && (
        <div className="mt-8 rounded-xl p-6" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}>
          <h2 className="text-[22px] font-normal mb-4" style={{ color: 'var(--color-text-heading)' }}>About</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>{company.summary}</p>
        </div>
      )}
    </div>
  )
}
