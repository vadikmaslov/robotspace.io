import { prisma } from '@robotspace/db'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  return { title: 'Robotics Market Data', description: 'Source-backed robotics market statistics with methodology and reporting-period disclosure.' }
}

type Observation = {
  key: string
  display_name: string
  value_numeric: string | number
  unit: string
  observed_at: Date | string
  evidence_url: string
  source_key: string
  reported_at?: Date | string | null
  dimensions_json: { country_code?: string; country_name?: string; geography?: string; flow?: string; estimated?: boolean; category?: string; indicator?: string; through_month?: number; reported_months?: string }
}

const SOURCE_NAMES: Record<string, string> = {
  'ifr-world-robotics': 'International Federation of Robotics',
  'a3-robot-statistics': 'Association for Advancing Automation',
  'eurostat-robot-adoption': 'Eurostat',
  'un-comtrade-industrial-robots': 'UN Comtrade',
}

function number(value: string | number) { return Number(value) }
function formatValue(value: string | number, unit: string) {
  const numeric = number(value)
  if (unit === 'USD') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 }).format(numeric)
  if (unit === 'percent') return `${numeric.toFixed(1)}%`
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(numeric)
}
function date(value: Date | string) { return new Date(value).toISOString().slice(0, 10) }

export default async function MarketPage() {
  let highlights: Observation[] = []
  let euAdoption: Observation[] = []
  let automationContext: Observation[] = []
  let exports: Observation[] = []
  let currentYearTrade: Observation[] = []
  let robots = 0
  let companies = 0
  let updatedAt: Date | string | null = null

  try {
    ;[highlights, euAdoption, automationContext, exports, currentYearTrade, robots, companies] = await Promise.all([
      prisma.$queryRawUnsafe<Observation[]>(`
        SELECT DISTINCT ON (definition.key) definition.key, definition.display_name, observation.value_numeric,
          observation.unit, COALESCE(source_record.last_seen_at, observation.observed_at) AS observed_at,
          observation.observed_at AS reported_at, observation.evidence_url, observation.source_key, observation.dimensions_json,
          source_record.last_seen_at
        FROM metric_definitions definition
        JOIN metric_observations observation ON observation.metric_id = definition.id
        LEFT JOIN source_records source_record ON source_record.id = observation.source_record_id
        WHERE definition.key IN ('industrial_robot_installations_world', 'industrial_robot_operational_stock_world', 'north_america_robot_orders', 'north_america_robot_order_value')
        ORDER BY definition.key, observation.observed_at DESC, observation.created_at DESC
      `),
      prisma.$queryRawUnsafe<Observation[]>(`
        SELECT definition.key, definition.display_name, observation.value_numeric, observation.unit, observation.observed_at,
          observation.evidence_url, observation.source_key, observation.dimensions_json
        FROM metric_definitions definition
        JOIN metric_observations observation ON observation.metric_id = definition.id
        WHERE definition.key = 'eu_enterprises_using_industrial_robots'
        ORDER BY observation.value_numeric DESC NULLS LAST
        LIMIT 10
      `),
      prisma.$queryRawUnsafe<Observation[]>(`
        SELECT * FROM (
          SELECT DISTINCT ON (observation.dimensions_json->>'country_code') definition.key, definition.display_name, observation.value_numeric, observation.unit, observation.observed_at,
            observation.evidence_url, observation.source_key, observation.dimensions_json
          FROM metric_definitions definition
          JOIN metric_observations observation ON observation.metric_id = definition.id
          WHERE definition.key = 'industrial_robot_trade_exports_ytd'
          ORDER BY observation.dimensions_json->>'country_code', observation.observed_at DESC, observation.created_at DESC
        ) latest_by_country
        ORDER BY value_numeric DESC NULLS LAST
        LIMIT 10
      `),
      prisma.$queryRawUnsafe<Observation[]>(`
        SELECT DISTINCT ON (definition.key) definition.key, definition.display_name, observation.value_numeric, observation.unit, observation.observed_at,
          observation.evidence_url, observation.source_key, observation.dimensions_json
        FROM metric_definitions definition
        JOIN metric_observations observation ON observation.metric_id = definition.id
        WHERE definition.key IN ('eu_enterprises_using_autonomous_robot_ai', 'eu_enterprises_using_ai_production_processes', 'eu_enterprises_using_ai_logistics')
          AND observation.dimensions_json->>'country_code' = 'EU27_2020'
        ORDER BY definition.key, observation.observed_at DESC, observation.created_at DESC
      `),
      prisma.$queryRawUnsafe<Observation[]>(`
        SELECT definition.key, definition.display_name, observation.value_numeric, observation.unit, observation.observed_at,
          observation.evidence_url, observation.source_key, observation.dimensions_json
        FROM metric_definitions definition
        JOIN metric_observations observation ON observation.metric_id = definition.id
        WHERE definition.key = 'industrial_robot_trade_exports'
          AND observation.observed_at = (SELECT max(observed_at) FROM metric_observations latest WHERE latest.metric_id = definition.id)
        ORDER BY observation.value_numeric DESC NULLS LAST
        LIMIT 10
      `),
      prisma.robot_public_projections.count(),
      prisma.company_public_projections.count(),
    ])
    updatedAt = [...highlights, ...euAdoption, ...automationContext, ...exports, ...currentYearTrade].map(item => item.reported_at || item.observed_at).sort().at(-1) ?? null
  } catch {}

  const highlightOrder = ['industrial_robot_installations_world', 'industrial_robot_operational_stock_world', 'north_america_robot_orders', 'north_america_robot_order_value']
  const orderedHighlights = highlightOrder.map(key => highlights.find(item => item.key === key)).filter((item): item is Observation => Boolean(item))

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-12">
      <h1 className="text-4xl font-semibold" style={{ color: 'var(--color-text-heading)' }}>Robotics Market Data</h1>
      <p className="mt-3 max-w-3xl" style={{ color: 'var(--color-text-muted)' }}>
        Direct observations from official statistical sources. Values retain their reporting period and source; they are not RobotSpace estimates, market share, funding, or forecasts.
      </p>

      {orderedHighlights.length === 0 ? (
        <div className="mt-8 rounded-xl p-6" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}>
          <h2 className="text-lg font-medium" style={{ color: 'var(--color-text-heading)' }}>Initial collection is in progress</h2>
          <p className="mt-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>The page will publish official observations only after their source contract, reporting period and methodology have been recorded.</p>
        </div>
      ) : (
        <>
          <section className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {orderedHighlights.map(item => (
              <article key={item.key} className="rounded-xl p-5" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}>
                <div className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>{item.display_name}</div>
                <div className="font-mono text-2xl mt-2" style={{ color: 'var(--color-text-heading)' }}>{formatValue(item.value_numeric, item.unit)}</div>
                <div className="mt-3 text-xs" style={{ color: 'var(--color-text-dim)' }}>{date(item.observed_at)} · <a href={item.evidence_url} target="_blank" rel="noreferrer" className="hover:underline">{SOURCE_NAMES[item.source_key] || item.source_key}</a></div>
                <div className="mt-1 text-xs" style={{ color: 'var(--color-text-dim)' }}>Reported period: {date(item.reported_at || item.observed_at).slice(0, 4)}</div>
              </article>
            ))}
          </section>

          {euAdoption.length > 0 && (
            <section className="mt-8 rounded-xl p-6" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}>
              <div className="flex items-baseline justify-between gap-4 flex-wrap"><div><h2 className="text-xl font-medium" style={{ color: 'var(--color-text-heading)' }}>Industrial-robot adoption in EU enterprises</h2><p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>Share of enterprises with 10+ employees reporting industrial-robot use.</p></div><span className="text-xs" style={{ color: 'var(--color-text-dim)' }}>Eurostat · 2022</span></div>
              <div className="mt-5 grid sm:grid-cols-2 gap-x-8 gap-y-3">
                {euAdoption.map(item => <div key={item.dimensions_json.country_code} className="flex items-center gap-3"><span className="w-8 font-mono text-xs" style={{ color: 'var(--color-text-dim)' }}>{item.dimensions_json.country_code}</span><div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-bg-elevated)' }}><div className="h-full rounded-full" style={{ width: `${Math.min(number(item.value_numeric) * 5, 100)}%`, background: 'var(--color-accent-cta)' }} /></div><span className="w-12 text-right font-mono text-sm" style={{ color: 'var(--color-text-heading)' }}>{formatValue(item.value_numeric, item.unit)}</span></div>)}
              </div>
              <p className="mt-5 text-xs" style={{ color: 'var(--color-text-dim)' }}><a href={euAdoption[0].evidence_url} target="_blank" rel="noreferrer" className="hover:underline">View the Eurostat dataset</a></p>
            </section>
          )}

          {automationContext.length > 0 && (
            <section className="mt-8 rounded-xl p-6" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}>
              <div><h2 className="text-xl font-medium" style={{ color: 'var(--color-text-heading)' }}>EU automation context</h2><p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>Direct Eurostat enterprise indicators. These are automation and AI-use measures, not installations or market-size estimates.</p></div>
              <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                {automationContext.map(item => <article key={item.key} className="rounded-lg p-4" style={{ background: 'var(--color-bg-elevated)' }}><div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{item.display_name}</div><div className="font-mono text-2xl mt-2" style={{ color: 'var(--color-text-heading)' }}>{formatValue(item.value_numeric, item.unit)}</div><div className="mt-2 text-xs" style={{ color: 'var(--color-text-dim)' }}>{date(item.observed_at).slice(0, 4)} В· EU-27 В· <a href={item.evidence_url} target="_blank" rel="noreferrer" className="hover:underline">Eurostat</a></div></article>)}
              </div>
            </section>
          )}

          {exports.length > 0 && (
            <section className="mt-8 rounded-xl overflow-hidden" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}>
              <div className="p-6"><h2 className="text-xl font-medium" style={{ color: 'var(--color-text-heading)' }}>Industrial-robot exports</h2><p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>Reported export value for HS 847950. This is a customs-trade proxy, not robot installations or market share.</p></div>
              <table className="w-full text-sm"><thead><tr style={{ borderTop: '1px solid var(--color-border-color)', borderBottom: '1px solid var(--color-border-color)' }}><th className="p-3 text-left text-xs uppercase" style={{ color: 'var(--color-text-dim)' }}>Country</th><th className="p-3 text-right text-xs uppercase" style={{ color: 'var(--color-text-dim)' }}>Export value</th><th className="p-3 text-right text-xs uppercase" style={{ color: 'var(--color-text-dim)' }}>Year</th></tr></thead><tbody>{exports.map(item => <tr key={item.dimensions_json.country_code} style={{ borderBottom: '1px solid var(--color-border-color)' }}><td className="p-3 font-medium" style={{ color: 'var(--color-text-heading)' }}>{item.dimensions_json.country_code}</td><td className="p-3 text-right font-mono" style={{ color: 'var(--color-text-heading)' }}>{formatValue(item.value_numeric, item.unit)}</td><td className="p-3 text-right text-xs" style={{ color: 'var(--color-text-muted)' }}>{date(item.observed_at).slice(0, 4)}{item.dimensions_json.estimated ? ' · estimate' : ''}</td></tr>)}</tbody></table>
              <p className="p-4 text-xs" style={{ color: 'var(--color-text-dim)' }}><a href={exports[0].evidence_url} target="_blank" rel="noreferrer" className="hover:underline">View UN Comtrade query</a></p>
            </section>
          )}

          {currentYearTrade.length > 0 && (
            <section className="mt-8 rounded-xl overflow-hidden" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}>
              <div className="p-6"><h2 className="text-xl font-medium" style={{ color: 'var(--color-text-heading)' }}>2026 industrial-robot trade — reported YTD</h2><p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>Sum of published monthly HS 847950 export values only. This is a partial period, not a full-year result, installations, or market share.</p></div>
              <table className="w-full text-sm"><thead><tr style={{ borderTop: '1px solid var(--color-border-color)', borderBottom: '1px solid var(--color-border-color)' }}><th className="p-3 text-left text-xs uppercase" style={{ color: 'var(--color-text-dim)' }}>Country</th><th className="p-3 text-right text-xs uppercase" style={{ color: 'var(--color-text-dim)' }}>Reported exports</th><th className="p-3 text-right text-xs uppercase" style={{ color: 'var(--color-text-dim)' }}>Through</th></tr></thead><tbody>{currentYearTrade.map(item => <tr key={item.dimensions_json.country_code} style={{ borderBottom: '1px solid var(--color-border-color)' }}><td className="p-3 font-medium" style={{ color: 'var(--color-text-heading)' }}>{item.dimensions_json.country_code}</td><td className="p-3 text-right font-mono" style={{ color: 'var(--color-text-heading)' }}>{formatValue(item.value_numeric, item.unit)}</td><td className="p-3 text-right text-xs" style={{ color: 'var(--color-text-muted)' }}>{item.dimensions_json.reported_months || date(item.observed_at)}</td></tr>)}</tbody></table>
              <p className="p-4 text-xs" style={{ color: 'var(--color-text-dim)' }}><a href={currentYearTrade[0].evidence_url} target="_blank" rel="noreferrer" className="hover:underline">View the latest UN Comtrade monthly query</a></p>
            </section>
          )}
        </>
      )}

      <section className="mt-8 grid grid-cols-2 md:grid-cols-3 gap-4">
        {[['Robots in catalog', String(robots)], ['Companies in catalog', String(companies)], ['Latest reported period', updatedAt ? date(updatedAt) : '—']].map(([label, value]) => <div key={label} className="rounded-xl p-5" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}><div className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>{label}</div><div className="font-mono text-xl mt-1" style={{ color: 'var(--color-text-heading)' }}>{value}</div></div>)}
      </section>

      <p className="mt-8 text-xs max-w-3xl" style={{ color: 'var(--color-text-dim)' }}>Methodology: every displayed number is stored with its formula version, source record, observation date and direct source URL. Funding, M&A, valuations and forecasts remain excluded until a separately approved licensed source is connected.</p>
    </div>
  )
}
