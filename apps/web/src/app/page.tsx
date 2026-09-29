import type { Metadata } from 'next'
import Link from 'next/link'
import { prisma } from '@robotspace/db'
import { publicRobotWhere, publicCompanyEntities } from '../lib/public-catalog'
import { robotUrl, articleSlug } from '../lib/public-urls'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Global Robotics Industry',
  description: 'Explore verified robotics companies, robots, specifications, insights, and integration options.',
  alternates: { canonical: '/' },
}

const sourceLabels: Record<string, string> = {
  the_robot_report: 'The Robot Report',
  ieee_spectrum_robotics: 'IEEE Spectrum',
  wikidata: 'Wikidata',
}

export default async function HomePage() {
  let robotCount = 0
  let companyCount = 0
  let newsCount = 0
  let articles: any[] = []
  let categories: any[] = []
  let featuredRobots: any[] = []
  const categoryNameById: Record<string, string> = {}

  try {
    const [publicRobots, publicCompanies] = await Promise.all([publicRobotWhere(), publicCompanyEntities()])
    const counts = await prisma.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM articles WHERE publication_status = 'PUBLISHED'`
    ;[robotCount, companyCount, newsCount, articles, categories, featuredRobots] = await Promise.all([
      prisma.robot_public_projections.count({ where: publicRobots }),
      prisma.company_public_projections.count({ where: { status: 'ACTIVE', company_entity_id: { in: publicCompanies.map(c => c.id) } } }),
      Promise.resolve(counts[0]?.count ?? 0),
      prisma.$queryRaw<any[]>`SELECT id, title, source_id, published_at FROM articles WHERE publication_status = 'PUBLISHED' ORDER BY published_at DESC LIMIT 5`,
      prisma.categories.findMany({ where: { is_active: true, parent_id: null, slug: { not: 'other' } }, orderBy: { sort_order: 'asc' }, take: 10 }),
      prisma.robot_public_projections.findMany({ where: { ...publicRobots, last_verified_at: { not: null } }, orderBy: { last_verified_at: 'desc' }, take: 4 }),
    ])
    for (const category of categories) categoryNameById[category.id] = category.name_en
  } catch {}

  return (
    <div>
      <section className="max-w-[1200px] mx-auto px-6 py-24 md:py-32 text-center">
        <h1 className="text-6xl md:text-7xl font-light leading-none tracking-tight mb-6" style={{ color: 'var(--color-text-heading)', letterSpacing: '-0.022em' }}>
          Explore the Global<br /><span style={{ color: 'var(--color-accent-cta)' }}>Robotics Industry</span>
        </h1>
        <p className="text-base mb-8 max-w-xl mx-auto" style={{ color: 'var(--color-text-muted)' }}>
          Your gateway to verified robotics data, companies, and industry insights.
        </p>
        <Link href="/robots" className="inline-block px-6 py-3 rounded-md text-sm font-medium" style={{ background: 'var(--color-accent-cta)', color: 'var(--color-accent-cta-text)' }}>Browse Robots</Link>
      </section>

      <section className="max-w-[1200px] mx-auto px-6 pb-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Robots" value={robotCount} detail="Catalog records" />
        <KpiCard label="Companies" value={companyCount} detail="Catalog companies" />
        <KpiCard label="News Articles" value={newsCount} detail="Published insights" />
        <KpiCard label="Categories" value={categories.length} detail="Active categories" />
      </section>

      <section className="max-w-[1200px] mx-auto px-6 py-16">
        <SectionTitle title="Recently Verified Robots" href="/robots" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {featuredRobots.length === 0 && <Empty message="No verified robot records are available yet." />}
          {featuredRobots.map((robot) => (
            <Link key={robot.id} href={robotUrl(robot.canonical_name)} className="rounded-xl p-5 transition-colors hover:bg-[var(--color-bg-elevated)]" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}>
              <div className="text-sm font-medium" style={{ color: 'var(--color-text-heading)' }}>{robot.canonical_name}</div>
              <div className="text-[13px] mt-1" style={{ color: 'var(--color-text-muted)' }}>{categoryNameById[robot.category_id] || 'Uncategorized'}</div>
              <div className="text-xs mt-4" style={{ color: 'var(--color-text-dim)' }}>{robot.last_verified_at ? `Verified ${new Date(robot.last_verified_at).toISOString().slice(0, 10)}` : 'Verification pending'}</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="max-w-[1200px] mx-auto px-6 py-16">
        <SectionTitle title="Latest News" href="/insights" />
        <div className="flex flex-col rounded-xl overflow-hidden border" style={{ borderColor: 'var(--color-border-color)' }}>
          {articles.length === 0 && <Empty message="No news articles are available yet." />}
          {articles.map((article, index) => (
            <Link key={article.id} href={`/insights/${slug(article.title)}`} className="flex items-center gap-4 px-5 py-3 border-b last:border-b-0 transition-colors" style={{ borderColor: 'var(--color-border-color)', background: index % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
              <span className="text-[11px] font-medium w-28 flex-shrink-0 font-mono tracking-tight" style={{ color: 'var(--color-accent-cta)' }}>{sourceLabels[article.source_id] || article.source_id || 'News'}</span>
              <span className="text-sm flex-1" style={{ color: 'var(--color-text-body)' }}>{article.title}</span>
              {article.published_at && <span className="text-xs flex-shrink-0 font-mono" style={{ color: 'var(--color-text-dim)' }}>{new Date(article.published_at).toISOString().slice(0, 10)}</span>}
            </Link>
          ))}
        </div>
      </section>

      <section className="max-w-[1200px] mx-auto px-6 py-24 text-center">
        <h2 className="text-3xl font-medium mb-4" style={{ color: 'var(--color-text-heading)' }}>Ready to find your robot?</h2>
        <p className="mb-8" style={{ color: 'var(--color-text-muted)' }}>Browse verified specifications, compare models, and request quotes.</p>
        <div className="flex gap-4 justify-center"><Link href="/robots" className="px-6 py-3 rounded-md text-sm font-medium" style={{ background: 'var(--color-accent-cta)', color: 'var(--color-accent-cta-text)' }}>Browse Robots</Link><Link href="/quote" className="px-6 py-3 rounded-md text-sm font-medium border" style={{ color: 'var(--color-text-body)', borderColor: 'var(--color-border-color)' }}>Request a Quote</Link></div>
      </section>
    </div>
  )
}

const slug = articleSlug
function SectionTitle({ title, href }: { title: string; href: string }) { return <div className="flex justify-between items-baseline mb-6"><h2 className="text-2xl font-normal tracking-tight" style={{ color: 'var(--color-text-heading)' }}>{title}</h2><Link href={href} className="text-sm" style={{ color: 'var(--color-text-muted)' }}>View all</Link></div> }
function Empty({ message }: { message: string }) { return <div className="col-span-full px-6 py-8 text-center text-sm rounded-xl" style={{ background: 'var(--color-bg-card)', color: 'var(--color-text-dim)' }}>{message}</div> }
function KpiCard({ label, value, detail }: { label: string; value: number; detail: string }) { return <div className="rounded-xl p-6" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}><div className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>{label}</div><div className="font-mono text-[32px] mt-1" style={{ color: 'var(--color-text-heading)' }}>{value.toLocaleString()}</div><div className="mt-2 text-[13px]" style={{ color: 'var(--color-text-muted)' }}>{detail}</div></div> }
