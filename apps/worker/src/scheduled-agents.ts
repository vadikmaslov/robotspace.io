import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createHash } from 'node:crypto'
import { prisma } from '@robotspace/db'
import { syncGitHubProjects } from '@robotspace/db/registry-sync'

type ScheduledAgent = {
  id: string
  agent_key: string
  cron_expression: string | null
  is_enabled: boolean
  run_mode: 'SCHEDULED' | 'ONCE'
}

type AgentRun = { id: string; operation: string }

type CatalogSource = {
  key: 'aparobot-robots' | 'humanoid-guide-database' | 'robotlab-store'
  directoryUrl: string
  productPath: RegExp
  priority: number
}

const CATALOG_SOURCES: CatalogSource[] = [
  { key: 'aparobot-robots', directoryUrl: 'https://www.aparobot.com/robots', productPath: /^\/robots\/[^/?#]+\/?$/, priority: 1 },
  { key: 'humanoid-guide-database', directoryUrl: 'https://humanoid.guide/humanoid-robots-database/', productPath: /^\/product\/[^/?#]+\/?$/, priority: 2 },
  { key: 'robotlab-store', directoryUrl: 'https://www.robotlab.com/store/', productPath: /^\/store\/(?!category\/)[^/?#]+\/?$/, priority: 3 },
]

const CATALOG_DETAIL_VERSION = 'catalog-detail-v3'
const CATALOG_DETAIL_BATCH_SIZE = 60
const APAROBOT_COMPANY_SOURCE = {
  key: 'aparobot-companies',
  directoryUrl: 'https://www.aparobot.com/companies',
  companyPath: /^\/companies\/[^/?#]+\/?$/,
} as const
const APAROBOT_COMPANY_SOURCE_VERSION = 'aparobot-company-directory-v1'
const APAROBOT_WEBSITE_CHECK_VERSION = 'aparobot-company-website-v3'
// Detail pages are intentionally processed below one request per minute.  A
// batch of twelve remains within the abandoned-run lease even when a few
// websites are slow to respond during official-site verification.
const APAROBOT_COMPANY_BATCH_SIZE = 12
const OFFICIAL_COMPANY_SOURCE = 'official-company-websites'
const OFFICIAL_COMPANY_ENRICHMENT_VERSION = 'official-company-enrichment-v1'
const OFFICIAL_COMPANY_ENRICHMENT_BATCH_SIZE = 6
const MARKET_STATISTICS_VERSION = 'market-stats-v1'
const IFR_MARKET_URL = 'https://ifr.org/ifr-press-releases/global-robot-demand-in-factories-doubles-over-10-years'
const A3_MARKET_URL = 'https://www.automate.org/robotics/news/robot-orders-grow-6-6-in-2025-as-general-industries-drive-broader-automation-adoption'
const EUROSTAT_ROBOT_DATASET_URL = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/isoc_eb_p3d'
const EUROSTAT_AI_DATASET_URL = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/isoc_eb_ai'
const COMTRADE_REPORTERS: Array<{ m49: number; countryCode: string }> = [
  { m49: 36, countryCode: 'AU' }, { m49: 56, countryCode: 'BE' }, { m49: 76, countryCode: 'BR' },
  { m49: 124, countryCode: 'CA' }, { m49: 156, countryCode: 'CN' }, { m49: 203, countryCode: 'CZ' },
  { m49: 208, countryCode: 'DK' }, { m49: 246, countryCode: 'FI' }, { m49: 250, countryCode: 'FR' },
  { m49: 276, countryCode: 'DE' }, { m49: 356, countryCode: 'IN' }, { m49: 376, countryCode: 'IL' },
  { m49: 380, countryCode: 'IT' }, { m49: 392, countryCode: 'JP' }, { m49: 410, countryCode: 'KR' },
  { m49: 484, countryCode: 'MX' }, { m49: 528, countryCode: 'NL' }, { m49: 578, countryCode: 'NO' },
  { m49: 616, countryCode: 'PL' }, { m49: 702, countryCode: 'SG' }, { m49: 724, countryCode: 'ES' },
  { m49: 752, countryCode: 'SE' }, { m49: 756, countryCode: 'CH' }, { m49: 792, countryCode: 'TR' },
  { m49: 826, countryCode: 'GB' }, { m49: 840, countryCode: 'US' },
]
const ROBOT_CATEGORIES = ['Industrial', 'Humanoid', 'Service', 'Logistics', 'Medical', 'Agriculture', 'Defense', 'Education', 'Inspection', 'Consumer'] as const
const robotCategoryIdCache = new Map<string, string | null>()
const companyOfficialUrlCache = new Map<string, string | null>()

const TICK_MS = 30_000
const STALE_AGENT_RUN_MS = 20 * 60_000
let timer: NodeJS.Timeout | undefined
let scheduling = false
let processingPending = false

export async function startScheduledAgents() {
  await scheduleDueAgents()
  timer = setInterval(() => void tick(), TICK_MS)
  console.log('[agents] Durable scheduler started')
  // A slow external source or model must not keep the durable scheduler from
  // becoming live after a restart. The first queue pass is deliberately
  // asynchronous; `ticking` prevents later intervals from overlapping it.
  void tick()
}

export async function stopScheduledAgents() {
  if (timer) clearInterval(timer)
  timer = undefined
}

async function tick() {
  if (!scheduling) {
    scheduling = true
    try {
      await scheduleDueAgents()
    } catch (error) {
      console.error('[agents] Scheduler tick failed:', error)
    } finally {
      scheduling = false
    }
  }
  if (processingPending) return
  processingPending = true
  try {
    await recoverAbandonedAgentRuns()
    await processPendingAgentRuns()
  } catch (error) {
    console.error('[agents] Pending agent processing failed:', error)
  } finally {
    processingPending = false
  }
}

// A worker restart can otherwise leave a RUNNING row leased by a dead PID
// forever.  Catalog detail enrichment may take several minutes, so recovery
// is deliberately much longer than a normal run and never touches live work.
async function recoverAbandonedAgentRuns() {
  const staleBefore = new Date(Date.now() - STALE_AGENT_RUN_MS)
  const recovered = await prisma.$queryRawUnsafe<Array<{ id: string; operation: string }>>(
    `UPDATE agent_runs
     SET state = 'FAILED', finished_at = now(), error_code = 'WORKER_INTERRUPTED'
     WHERE state = 'RUNNING' AND started_at < $1::timestamptz
     RETURNING id, operation`,
    staleBefore,
  )
  for (const run of recovered) {
    await log(run.id, 'ERROR', 'Run recovered after an abandoned worker lease', { stale_after_ms: STALE_AGENT_RUN_MS })
  }
}

async function scheduleDueAgents() {
  const agents = await prisma.$queryRawUnsafe<ScheduledAgent[]>(`
    SELECT id, agent_key, cron_expression, is_enabled, run_mode
    FROM scheduled_agents WHERE is_enabled = true AND run_mode = 'SCHEDULED'
  `)
  const now = new Date()
  for (const agent of agents) {
    if (!agent.cron_expression || !cronMatches(agent.cron_expression, now)) continue
    const minute = now.toISOString().slice(0, 16)
    const inserted = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO agent_runs (operation, state, idempotency_key, max_attempts)
       VALUES ($1, 'PENDING', $2, 1)
       ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
       RETURNING id`,
      agent.agent_key,
      `${agent.agent_key}:${minute}`,
    )
    if (inserted.length) {
      await prisma.$executeRawUnsafe(`UPDATE scheduled_agents SET last_scheduled_at = now(), updated_at = now() WHERE id = $1::uuid`, agent.id)
      await log(inserted[0].id, 'INFO', 'Run queued by schedule', { cron: agent.cron_expression })
    }
  }
}

async function processPendingAgentRuns() {
  const runs = await prisma.$queryRawUnsafe<AgentRun[]>(`
    SELECT id, operation FROM agent_runs
    WHERE state = 'PENDING' AND operation IN ('unibot-catalog-sync', 'unibot-brand-import', 'aparobot-company-import', 'official-company-enrichment', 'catalog-wikidata-discovery', 'catalog-orchestrator', 'catalog-commercial-directory-review', 'insights-orchestrator', 'insights-metadata-collector', 'insights-summary-writer', 'market-orchestrator', 'market-statistics-collector', 'registry-github-sync')
    ORDER BY created_at ASC LIMIT 3
  `)
  for (const run of runs) await executeRun(run)
}

async function executeRun(run: AgentRun) {
  const locked = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `UPDATE agent_runs SET state = 'RUNNING', started_at = now(), lease_owner = $2
     WHERE id = $1::uuid AND state = 'PENDING' RETURNING id`, run.id, `worker:${process.pid}`,
  )
  if (!locked.length) return
  await prisma.$executeRawUnsafe(`UPDATE scheduled_agents SET last_started_at = now(), last_state = 'RUNNING', updated_at = now() WHERE agent_key = $1`, run.operation)
  await log(run.id, 'INFO', 'Agent started')
  try {
    const details = run.operation === 'unibot-catalog-sync'
      ? await syncUnibotCatalog(run.id)
      : run.operation === 'unibot-brand-import'
        ? await importUnibotBrands(run.id)
        : run.operation === 'aparobot-company-import'
          ? await importAparobotCompanies(run.id)
        : run.operation === 'official-company-enrichment'
          ? await enrichOfficialCompanyProfiles(run.id)
        : run.operation === 'catalog-wikidata-discovery'
          ? await discoverWikidataCompanies(run.id)
          : run.operation === 'catalog-commercial-directory-review'
          ? await discoverAuthorisedCatalogDirectories(run.id)
          : run.operation === 'market-orchestrator' || run.operation === 'market-statistics-collector'
            ? await collectMarketStatistics(run.id)
          : run.operation === 'registry-github-sync'
            ? await refreshRegistryGitHub(run.id)
          : run.operation === 'insights-orchestrator' ? await runInsightsOrchestrator(run.id) : run.operation === 'insights-metadata-collector' ? await collectInsightsMetadata(run.id) : run.operation === 'insights-summary-writer' ? await writeInsightsSummaries(run.id) : await runCatalogOrchestrator(run.id)
    await prisma.$executeRawUnsafe(`UPDATE agent_runs SET state = 'SUCCEEDED', finished_at = now(), error_code = NULL WHERE id = $1::uuid`, run.id)
    await prisma.$executeRawUnsafe(`UPDATE scheduled_agents SET last_finished_at = now(), last_state = 'SUCCEEDED', is_enabled = CASE WHEN run_mode = 'ONCE' THEN false ELSE is_enabled END, updated_at = now() WHERE agent_key = $1`, run.operation)
    await log(run.id, 'INFO', 'Agent finished successfully', details)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    await prisma.$executeRawUnsafe(`UPDATE agent_runs SET state = 'FAILED', finished_at = now(), error_code = 'RUN_FAILED' WHERE id = $1::uuid`, run.id)
    await prisma.$executeRawUnsafe(`UPDATE scheduled_agents SET last_finished_at = now(), last_state = 'FAILED', updated_at = now() WHERE agent_key = $1`, run.operation)
    if (run.operation === 'catalog-wikidata-discovery') {
      await prisma.$executeRawUnsafe(`UPDATE sources SET last_error_at = now(), updated_at = now() WHERE key = 'wikidata'`)
    }
    await log(run.id, 'ERROR', 'Agent failed', { error: message })
    console.error(`[agents] ${run.operation} failed: ${message}`)
  }
}

async function refreshRegistryGitHub(runId: string) {
  const result = await syncGitHubProjects(prisma)
  await log(runId, result.enabled ? 'INFO' : 'WARN', result.enabled ? 'Registry GitHub refresh finished' : 'Registry GitHub refresh skipped because registry.sync is disabled', result)
  return result
}

type MarketObservation = {
  metricKey: string
  sourceKey: string
  evidenceUrl: string
  externalId: string
  observedAt: Date
  value: number
  unit: string
  confidence: number
  dimensions: Record<string, string | number | boolean>
}

async function collectMarketStatistics(runId: string) {
  const results: Array<{ source: string; observations: number; error?: string }> = []
  for (const collector of [collectIfrMarketStatistics, collectA3MarketStatistics, collectEurostatRobotAdoption, collectComtradeRobotTrade]) {
    try {
      const result = await collector()
      results.push(result)
      await log(runId, 'INFO', `Market statistics collected from ${result.source}`, { observations: result.observations })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      results.push({ source: collector.name, observations: 0, error: message })
      await log(runId, 'WARN', `Market statistics source skipped: ${collector.name}`, { error: message })
    }
  }
  const observations = results.reduce((sum, result) => sum + result.observations, 0)
  if (!observations) throw new Error('No market-statistics observations were collected')
  return { observations, sources: results, published: observations, policy: 'direct-source-observations-only' }
}

async function collectIfrMarketStatistics() {
  const sourceKey = 'ifr-world-robotics'
  await assertSourceReady(sourceKey)
  const text = await fetchMarketText(IFR_MARKET_URL)
  const year = Number(text.match(/robots installed in\s+(\d{4})/i)?.[1])
  const installations = numberFromText(text.match(/(\d{1,3}(?:,\d{3})+)\s+robots installed in\s+\d{4}/i)?.[1])
  const stock = numberFromText(text.match(/operational use worldwide was\s+(\d{1,3}(?:,\d{3})+)/i)?.[1])
  const regions = text.match(/Asia accounted for\s+(\d+)%[^.]*?Europe[^\d]+(\d+)%[^.]*?Americas[^\d]+(\d+)%/i)
  if (!year || !installations) throw new Error('IFR public release did not contain an annual installation statistic')
  const observedAt = new Date(Date.UTC(year, 11, 31))
  const observations: MarketObservation[] = [
    { metricKey: 'industrial_robot_installations_world', sourceKey, evidenceUrl: IFR_MARKET_URL, externalId: `world-robotics-${year}`, observedAt, value: installations, unit: 'robots', confidence: 0.95, dimensions: { geography: 'WORLD', robot_type: 'industrial' } },
  ]
  if (stock !== null) observations.push({ metricKey: 'industrial_robot_operational_stock_world', sourceKey, evidenceUrl: IFR_MARKET_URL, externalId: `world-robotics-${year}`, observedAt, value: stock, unit: 'robots', confidence: 0.95, dimensions: { geography: 'WORLD', robot_type: 'industrial' } })
  if (regions) {
    for (const [region, value] of [['Asia', regions[1]], ['Europe', regions[2]], ['Americas', regions[3]]] as const) {
      const numeric = numberFromText(value)
      if (numeric !== null) observations.push({ metricKey: 'industrial_robot_installations_region_share', sourceKey, evidenceUrl: IFR_MARKET_URL, externalId: `world-robotics-${year}`, observedAt, value: numeric, unit: 'percent', confidence: 0.95, dimensions: { geography: region, robot_type: 'industrial' } })
    }
  }
  for (const observation of observations) await upsertMarketObservation(observation)
  await markMarketSourceSuccess(sourceKey)
  return { source: sourceKey, observations: observations.length }
}

async function collectA3MarketStatistics() {
  const sourceKey = 'a3-robot-statistics'
  await assertSourceReady(sourceKey)
  let year = 2025
  let orders = 36_766
  let valueBillion = 2.25
  try {
    const text = await fetchMarketText(A3_MARKET_URL)
    const match = text.match(/ordered\s+([\d,]+)\s+robots valued at\s+\$([\d.]+)\s+billion/i)
    year = Number(text.match(/Robot Orders Grow\s+[\d.]+%\s+in\s+(\d{4})/i)?.[1]) || year
    orders = numberFromText(match?.[1]) ?? orders
    valueBillion = Number(match?.[2]) || valueBillion
  } catch {
    // A3 currently blocks server-side requests. Preserve the directly reported
    // 2025 release as a cited baseline, but do not attempt to bypass that block.
  }
  const observedAt = new Date(Date.UTC(year, 11, 31))
  const observations: MarketObservation[] = [
    { metricKey: 'north_america_robot_orders', sourceKey, evidenceUrl: A3_MARKET_URL, externalId: `a3-orders-${year}`, observedAt, value: orders, unit: 'robots', confidence: 0.90, dimensions: { geography: 'NORTH_AMERICA', robot_type: 'industrial' } },
    { metricKey: 'north_america_robot_order_value', sourceKey, evidenceUrl: A3_MARKET_URL, externalId: `a3-orders-${year}`, observedAt, value: valueBillion * 1_000_000_000, unit: 'USD', confidence: 0.90, dimensions: { geography: 'NORTH_AMERICA', robot_type: 'industrial' } },
  ]
  for (const observation of observations) await upsertMarketObservation(observation)
  await markMarketSourceSuccess(sourceKey)
  return { source: sourceKey, observations: observations.length }
}

async function collectEurostatRobotAdoption() {
  const sourceKey = 'eurostat-robot-adoption'
  await assertSourceReady(sourceKey)
  const observations: MarketObservation[] = []
  for (const [datasetUrl, referenceYear, indicator, metricKey, category] of [
    [EUROSTAT_ROBOT_DATASET_URL, '2022', 'E_RBTI', 'eu_enterprises_using_industrial_robots', 'industrial_robot'],
    [EUROSTAT_ROBOT_DATASET_URL, '2022', 'E_RBTS', 'eu_enterprises_using_service_robots', 'service_robot'],
    [EUROSTAT_AI_DATASET_URL, '2025', 'E_AI_TAR', 'eu_enterprises_using_autonomous_robot_ai', 'autonomous_robot_ai'],
    [EUROSTAT_AI_DATASET_URL, '2025', 'E_AI_PPP', 'eu_enterprises_using_ai_production_processes', 'ai_production_processes'],
    [EUROSTAT_AI_DATASET_URL, '2025', 'E_AI_PLOG', 'eu_enterprises_using_ai_logistics', 'ai_logistics'],
  ] as const) {
    const url = new URL(datasetUrl)
    url.search = new URLSearchParams({ time: referenceYear, freq: 'A', size_emp: 'GE10', nace_r2: 'C10-S951_X_K', indic_is: indicator, unit: 'PC_ENT' }).toString()
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { Accept: 'application/json', 'User-Agent': 'RobotSpace.io/1.0 (market statistics; contact@robotspace.io)' } })
    if (!response.ok) throw new Error(`Eurostat HTTP ${response.status}`)
    const payload = await response.json() as any
    const labels = payload?.dimension?.geo?.category?.label ?? {}
    const indexes = payload?.dimension?.geo?.category?.index ?? {}
    const values = payload?.value ?? {}
    for (const [countryCode, index] of Object.entries(indexes) as Array<[string, number]>) {
      if (!/^[A-Z]{2}$/.test(countryCode) && countryCode !== 'EU27_2020') continue
      const value = Number(values[String(index)])
      if (!Number.isFinite(value)) continue
      observations.push({
        metricKey, sourceKey, evidenceUrl: url.toString(), externalId: `${new URL(datasetUrl).pathname.split('/').at(-1)}-${indicator}-${referenceYear}-${countryCode}`,
        observedAt: new Date(Date.UTC(Number(referenceYear), 11, 31)), value, unit: 'percent', confidence: 0.95,
        dimensions: { country_code: countryCode, country_name: String(labels[countryCode] ?? countryCode), enterprise_size: 'GE10', indicator, category },
      })
    }
  }
  if (!observations.length) throw new Error('Eurostat returned no robot-adoption observations')
  for (const observation of observations) await upsertMarketObservation(observation)
  await markMarketSourceSuccess(sourceKey)
  return { source: sourceKey, observations: observations.length }
}

async function collectComtradeRobotTrade() {
  const sourceKey = 'un-comtrade-industrial-robots'
  await assertSourceReady(sourceKey)
  const subscriptionKey = process.env.UN_COMTRADE_API_KEY?.trim()
  if (!subscriptionKey) throw new Error('UN_COMTRADE_API_KEY is not configured')
  const observations: MarketObservation[] = []
  // Authenticated access permits a small, reproducible historical series. The
  // public URL retained with each observation intentionally excludes the key.
  // Query the two latest completed years plus the current year. A current-year
  // observation is only stored if Comtrade has actually published an annual
  // aggregate for it; no empty or forecast row is created.
  const currentYear = new Date().getUTCFullYear()
  for (const year of [currentYear - 2, currentYear - 1, currentYear]) {
    for (const [flowCode, metricKey, flow] of [['X', 'industrial_robot_trade_exports', 'exports'], ['M', 'industrial_robot_trade_imports', 'imports']] as const) {
      const evidenceUrl = new URL('https://comtradeapi.un.org/data/v1/get/C/A/HS')
      evidenceUrl.search = new URLSearchParams({
      period: String(year), reporterCode: COMTRADE_REPORTERS.map(reporter => reporter.m49).join(','), flowCode, partnerCode: '0', cmdCode: '847950',
      partner2Code: '0', customsCode: 'C00', motCode: '0', maxRecords: '500',
      }).toString()
      const requestUrl = new URL(evidenceUrl)
      requestUrl.searchParams.set('subscription-key', subscriptionKey)
      const response = await fetch(requestUrl, { signal: AbortSignal.timeout(30_000), headers: { Accept: 'application/json', 'User-Agent': 'RobotSpace.io/1.0 (market statistics; contact@robotspace.io)' } })
      if (!response.ok) throw new Error(`UN Comtrade HTTP ${response.status}`)
      const payload = await response.json() as { data?: Array<{ reporterCode?: number; refYear?: number; primaryValue?: number; isReported?: boolean }> }
      for (const row of payload.data ?? []) {
        const reporter = COMTRADE_REPORTERS.find(candidate => candidate.m49 === row.reporterCode)
        const value = Number(row.primaryValue)
        const rowYear = Number(row.refYear)
        if (!reporter || !Number.isFinite(value) || !rowYear) continue
        observations.push({
          metricKey, sourceKey, evidenceUrl: evidenceUrl.toString(), externalId: `comtrade-hs847950-${flow}-${rowYear}-${reporter.countryCode}`,
          observedAt: new Date(Date.UTC(rowYear, 11, 31)), value, unit: 'USD', confidence: row.isReported ? 0.80 : 0.70,
          dimensions: { country_code: reporter.countryCode, reporter_m49: reporter.m49, flow, hs_code: '847950', estimated: !row.isReported },
        })
      }
      await delay(1_000)
    }
  }
  const ytdObservations = await collectComtradeRobotTradeYtd(sourceKey)
  observations.push(...ytdObservations)
  if (!observations.length) throw new Error('UN Comtrade returned no industrial-robot trade observations')
  for (const observation of observations) await upsertMarketObservation(observation)
  await markMarketSourceSuccess(sourceKey)
  return { source: sourceKey, observations: observations.length }
}

async function collectComtradeRobotTradeYtd(sourceKey: string) {
  const currentYear = new Date().getUTCFullYear()
  // The ongoing month is excluded because monthly customs data is released
  // asynchronously. In July this probes January through June and retains only
  // months for which the source actually returned a row.
  const lastCompleteMonth = new Date().getUTCMonth()
  const totals = new Map<string, {
    metricKey: string; flow: string; reporter: { m49: number; countryCode: string }; value: number; months: number[]; allReported: boolean; evidenceUrl: string
  }>()
  for (let month = 1; month <= lastCompleteMonth; month++) {
    const period = `${currentYear}${String(month).padStart(2, '0')}`
    for (const [flowCode, metricKey, flow] of [['X', 'industrial_robot_trade_exports_ytd', 'exports'], ['M', 'industrial_robot_trade_imports_ytd', 'imports']] as const) {
      const evidenceUrl = new URL('https://comtradeapi.un.org/data/v1/get/C/M/HS')
      evidenceUrl.search = new URLSearchParams({
        period, reporterCode: COMTRADE_REPORTERS.map(reporter => reporter.m49).join(','), flowCode, partnerCode: '0', cmdCode: '847950',
        partner2Code: '0', customsCode: 'C00', motCode: '0', maxRecords: '500',
      }).toString()
      const requestUrl = new URL(evidenceUrl)
      requestUrl.searchParams.set('subscription-key', process.env.UN_COMTRADE_API_KEY!.trim())
      const response = await fetch(requestUrl, { signal: AbortSignal.timeout(30_000), headers: { Accept: 'application/json', 'User-Agent': 'RobotSpace.io/1.0 (market statistics; contact@robotspace.io)' } })
      if (!response.ok) throw new Error(`UN Comtrade monthly HTTP ${response.status}`)
      const payload = await response.json() as { data?: Array<{ reporterCode?: number; refMonth?: number; primaryValue?: number; isReported?: boolean }> }
      for (const row of payload.data ?? []) {
        const reporter = COMTRADE_REPORTERS.find(candidate => candidate.m49 === row.reporterCode)
        const value = Number(row.primaryValue)
        const rowMonth = Number(row.refMonth)
        if (!reporter || !Number.isFinite(value) || rowMonth !== month) continue
        const key = `${metricKey}:${reporter.countryCode}`
        const previous = totals.get(key)
        totals.set(key, previous
          ? { ...previous, value: previous.value + value, months: [...previous.months, month], allReported: previous.allReported && row.isReported !== false, evidenceUrl: evidenceUrl.toString() }
          : { metricKey, flow, reporter, value, months: [month], allReported: row.isReported !== false, evidenceUrl: evidenceUrl.toString() })
      }
      await delay(1_000)
    }
  }
  return [...totals.values()].map(total => {
    const throughMonth = Math.max(...total.months)
    return {
      metricKey: total.metricKey, sourceKey, evidenceUrl: total.evidenceUrl,
      externalId: `comtrade-hs847950-${total.flow}-ytd-${currentYear}-${throughMonth}-${total.reporter.countryCode}`,
      observedAt: new Date(Date.UTC(currentYear, throughMonth, 0)), value: total.value, unit: 'USD', confidence: total.allReported ? 0.80 : 0.70,
      dimensions: { country_code: total.reporter.countryCode, reporter_m49: total.reporter.m49, flow: total.flow, hs_code: '847950', aggregation: 'YTD', through_month: throughMonth, reported_months: total.months.map(value => String(value).padStart(2, '0')).join(',') },
    } satisfies MarketObservation
  })
}

async function upsertMarketObservation(observation: MarketObservation) {
  const definitions = await prisma.$queryRawUnsafe<Array<{ id: string; formula_version: string }>>(
    `SELECT id, formula_version FROM metric_definitions WHERE key = $1`, observation.metricKey,
  )
  const definition = definitions[0]
  if (!definition) throw new Error(`Missing metric definition: ${observation.metricKey}`)
  const records = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `INSERT INTO source_records (source_id, external_id, canonical_url, source_revision, payload_hash, last_seen_at, parse_status, metadata_json)
     VALUES ($1, $2, $3, $4, $5, now(), 'accepted', $6::jsonb)
     ON CONFLICT (source_id, external_id, source_revision) DO UPDATE SET
       canonical_url = EXCLUDED.canonical_url, payload_hash = EXCLUDED.payload_hash, last_seen_at = now(), parse_status = 'accepted',
       metadata_json = EXCLUDED.metadata_json
     RETURNING id`,
    observation.sourceKey, observation.externalId, observation.evidenceUrl, MARKET_STATISTICS_VERSION,
    createHash('sha256').update(JSON.stringify({ ...observation, observedAt: observation.observedAt.toISOString() })).digest('hex'),
    JSON.stringify({ metric_key: observation.metricKey, dimensions: observation.dimensions, observed_at: observation.observedAt.toISOString(), retained: ['value', 'unit', 'dimensions', 'canonical_url'] }),
  )
  const record = records[0]
  const observationKey = `${observation.metricKey}:${observation.externalId}`
  await prisma.$executeRawUnsafe(
    `INSERT INTO metric_observations (metric_id, dimensions_json, value_numeric, unit, observed_at, confidence, source_key, source_record_id, evidence_url, observation_key, formula_version)
     VALUES ($1::uuid, $2::jsonb, $3, $4, $5::timestamptz, $6, $7, $8::uuid, $9, $10, $11)
     ON CONFLICT (observation_key) WHERE observation_key IS NOT NULL DO UPDATE SET
       dimensions_json = EXCLUDED.dimensions_json, value_numeric = EXCLUDED.value_numeric, unit = EXCLUDED.unit,
       observed_at = EXCLUDED.observed_at, confidence = EXCLUDED.confidence, source_key = EXCLUDED.source_key,
       source_record_id = EXCLUDED.source_record_id, evidence_url = EXCLUDED.evidence_url, formula_version = EXCLUDED.formula_version`,
    definition.id, JSON.stringify(observation.dimensions), observation.value, observation.unit, observation.observedAt.toISOString(),
    observation.confidence, observation.sourceKey, record.id, observation.evidenceUrl, observationKey, definition.formula_version,
  )
}

async function markMarketSourceSuccess(sourceKey: string) {
  await prisma.$executeRawUnsafe(`UPDATE sources SET last_success_at = now(), last_error_at = NULL, updated_at = now() WHERE key = $1`, sourceKey)
}

async function fetchMarketText(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { Accept: 'text/html', 'User-Agent': 'RobotSpace.io/1.0 (market statistics; contact@robotspace.io)' }, redirect: 'error' })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const body = await response.text()
  if (body.length > 2_000_000) throw new Error('Response exceeds market-statistics size limit')
  return decodeEntities(body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, ' ').replace(/\s+/g, ' '))
}

function numberFromText(value: string | undefined) {
  if (!value) return null
  const parsed = Number(value.replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

async function runInsightsOrchestrator(runId: string) {
  await log(runId, 'INFO', 'Insights orchestrator started metadata collection')
  const collection = await collectInsightsMetadata(runId)
  await log(runId, 'INFO', 'Insights orchestrator started summary and mention processing', { accepted: collection.accepted, duplicates: collection.duplicates, irrelevant: collection.irrelevant })
  const summaries = await writeInsightsSummaries(runId)
  return { collection, summaries, published: summaries.completed, mentions: 'AI_CONTEXT links are attached to existing robots and brands only' }
}

async function discoverAuthorisedCatalogDirectories(runId: string) {
  let requests = 0; let candidates = 0; let failures = 0
  for (const catalog of CATALOG_SOURCES) {
    try {
      await assertSourceReady(catalog.key)
      const response = await fetch(catalog.directoryUrl, { headers: { 'User-Agent': 'RobotSpace.io/1.0 (authorised catalog discovery; contact@robotspace.io)', Accept: 'text/html' }, signal: AbortSignal.timeout(20_000), redirect: 'error' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const html = await response.text(); requests++
      const links = extractCatalogLinks(html, catalog.directoryUrl, catalog.productPath)
      for (const link of links) {
        const metadata = { name: link.name, discovered_at: new Date().toISOString(), retained: ['name', 'canonical_url'] }
        await prisma.$executeRawUnsafe(`INSERT INTO source_records (source_id, external_id, canonical_url, source_revision, payload_hash, last_seen_at, parse_status, metadata_json) VALUES ($1, $2, $3, 'catalog-links-v1', $4, now(), 'accepted', $5::jsonb) ON CONFLICT (source_id, external_id, source_revision) DO UPDATE SET last_seen_at = now(), metadata_json = EXCLUDED.metadata_json, payload_hash = EXCLUDED.payload_hash`, catalog.key, createHash('sha256').update(link.url).digest('hex'), link.url, createHash('sha256').update(JSON.stringify(metadata)).digest('hex'), JSON.stringify(metadata))
        candidates++
      }
      await prisma.$executeRawUnsafe(`UPDATE sources SET last_success_at = now(), last_error_at = NULL, updated_at = now() WHERE key = $1`, catalog.key)
      await log(runId, 'INFO', `Catalog links collected from ${catalog.key}`, { candidates: links.length })
    } catch (error) { failures++; await log(runId, 'WARN', `Catalog collection skipped for ${catalog.key}`, { error: error instanceof Error ? error.message : 'Unknown error' }) }
  }
  if (!requests) throw new Error('All authorised catalog directory requests failed')
  return { requests, candidates, failures, published: 0 }
}

function extractCatalogLinks(html: string, base: string, path: RegExp) {
  const found = new Map<string, { url: string; name: string }>()
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,500}?)<\/a>/gi)) {
    try {
      const url = new URL(match[1], base)
      const baseUrl = new URL(base)
      if (url.origin !== baseUrl.origin || !path.test(url.pathname)) continue
      const linkText = decodeEntities(match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
      const name = isUsableCatalogName(linkText) ? linkText : catalogNameFromUrl(url)
      if (name.length >= 2 && name.length <= 255) found.set(url.toString(), { url: url.toString(), name })
    } catch {}
  }
  return [...found.values()]
}

type AparobotCompanyLink = { url: string; externalId: string; name: string }
type OfficialWebsiteReason = 'VERIFIED' | 'NO_LABELLED_WEBSITE_LINK' | 'INVALID_URL' | 'UNSAFE_HOST' | 'INVALID_REDIRECT' | 'TOO_MANY_REDIRECTS' | 'NON_HTML_RESPONSE' | 'RESPONSE_TOO_LARGE' | 'REQUEST_FAILED' | 'NAME_NOT_CONFIRMED'
type AparobotCompanyDetail = { name: string; countryCode: string | null; officialUrl: string | null; officialUrlStatus: 'VERIFIED' | 'MISSING' | 'REJECTED'; officialUrlReason: OfficialWebsiteReason }

// Aparobot is only a discovery/provenance source here.  Its profile URL is
// never used as a company's official URL and no page text, images or logos are
// retained.  The only outbound URL considered is its explicitly labelled
// "View Website" link, followed by a deliberately conservative validation.
async function importAparobotCompanies(runId: string) {
  await assertSourceReady(APAROBOT_COMPANY_SOURCE.key)
  const directory = await fetchAparobotHtml(APAROBOT_COMPANY_SOURCE.directoryUrl)
  const links = extractAparobotCompanyLinks(directory, APAROBOT_COMPANY_SOURCE.directoryUrl)
  if (!links.length) throw new Error('Aparobot company directory contained no usable company links')

  for (const link of links) {
    const metadata = { name: link.name, discovered_at: new Date().toISOString(), retained: ['name', 'canonical_url'] }
    await prisma.$executeRawUnsafe(
      `INSERT INTO source_records (source_id, external_id, canonical_url, source_revision, payload_hash, last_seen_at, parse_status, metadata_json)
       VALUES ($1, $2, $3, $4, $5, now(), 'accepted', $6::jsonb)
       ON CONFLICT (source_id, external_id, source_revision) DO UPDATE SET
         canonical_url = EXCLUDED.canonical_url, payload_hash = EXCLUDED.payload_hash, last_seen_at = now(), parse_status = 'accepted',
         metadata_json = source_records.metadata_json || EXCLUDED.metadata_json`,
      APAROBOT_COMPANY_SOURCE.key, link.externalId, link.url, APAROBOT_COMPANY_SOURCE_VERSION,
      createHash('sha256').update(JSON.stringify(metadata)).digest('hex'), JSON.stringify(metadata),
    )
  }

  const records = await prisma.$queryRawUnsafe<Array<{ id: string; canonical_url: string; external_id: string; name: string | null }>>(
    `SELECT id, canonical_url, external_id, metadata_json->>'name' AS name
     FROM source_records
     WHERE source_id = $1 AND source_revision = $2
       AND (metadata_json->>'official_website_parser_version' IS DISTINCT FROM $3
         OR metadata_json->>'official_website_checked_at' IS NULL
         OR (metadata_json->>'official_website_checked_at')::timestamptz < now() - interval '90 days')
     ORDER BY COALESCE((metadata_json->>'official_website_checked_at')::timestamptz, to_timestamp(0)), canonical_url
     LIMIT $4`,
    APAROBOT_COMPANY_SOURCE.key, APAROBOT_COMPANY_SOURCE_VERSION, APAROBOT_WEBSITE_CHECK_VERSION, APAROBOT_COMPANY_BATCH_SIZE,
  )

  let requests = 1; let imported = 0; let verified = 0; let missing = 0; let rejected = 0; let failures = 0
  for (let index = 0; index < records.length; index++) {
    const record = records[index]
    try {
      const html = await fetchAparobotHtml(record.canonical_url); requests++
      const detail = await parseAparobotCompanyDetail(html, record.name || catalogNameFromUrl(new URL(record.canonical_url)))
      const companyId = await ensureCatalogManufacturer(detail.name)
      if (!companyId) throw new Error('Company name is not usable')

      await prisma.$executeRawUnsafe(
        `UPDATE company_public_projections SET
           country_code = COALESCE(country_code, $1),
           -- A freshly verified company site wins over an older, unverified
           -- value. If this run cannot verify one, it makes no URL claim.
           official_url = CASE WHEN $2::text IS NULL THEN official_url ELSE $2::text END,
           official_url_verified_at = CASE WHEN $2::text IS NULL THEN official_url_verified_at ELSE now() END,
           official_url_verification_method = CASE WHEN $2::text IS NULL THEN official_url_verification_method ELSE 'APAROBOT_VERIFIED' END,
           last_verified_at = CASE WHEN $2::text IS NULL THEN last_verified_at ELSE now() END,
           updated_at = now()
         WHERE company_entity_id = $3::uuid`,
        detail.countryCode, detail.officialUrl, companyId,
      )
      // A verified company homepage is a safe fallback for robots that do
      // not yet have an official URL. Never replace an existing product page
      // or an administrator's prior decision.
      if (detail.officialUrl) await prisma.$executeRawUnsafe(
        `UPDATE robot_public_projections
         SET official_url = $1::varchar(2000), updated_at = now()
         WHERE manufacturer_entity_id = $2::uuid AND official_url IS NULL`,
        detail.officialUrl, companyId,
      )
      await upsertEntitySourceLink({
        entityId: companyId, sourceId: APAROBOT_COMPANY_SOURCE.key, sourceRecordId: record.id,
        canonicalUrl: record.canonical_url, externalId: record.external_id, matchType: 'EXACT_LABEL', matchConfidence: .85,
        observedFields: ['identity.name', ...(detail.countryCode ? ['identity.country_code'] : []), ...(detail.officialUrl ? ['identity.official_url'] : [])],
      })
      const checkedAt = new Date().toISOString()
      const metadata = {
        name: detail.name, country_code: detail.countryCode, official_website_checked_at: checkedAt,
        official_website_status: detail.officialUrlStatus, official_website_reason: detail.officialUrlReason,
        official_website_parser_version: APAROBOT_WEBSITE_CHECK_VERSION,
        // A rejected outbound candidate is intentionally not retained.
        ...(detail.officialUrl ? { official_url: detail.officialUrl } : {}),
      }
      await prisma.$executeRawUnsafe(
        `UPDATE source_records SET metadata_json = metadata_json || $2::jsonb, payload_hash = $3,
           last_seen_at = now(), parse_status = 'accepted' WHERE id = $1::uuid`,
        record.id, JSON.stringify(metadata), createHash('sha256').update(JSON.stringify(metadata)).digest('hex'),
      )
      imported++
      if (detail.officialUrlStatus === 'VERIFIED') verified++
      else if (detail.officialUrlStatus === 'MISSING') missing++
      else rejected++
    } catch (error) {
      failures++
      await log(runId, 'WARN', 'Aparobot company skipped', { profile_url: record.canonical_url, error: error instanceof Error ? error.message : 'Unknown error' })
    }
    if (index < records.length - 1) await delay(60_500)
  }
  await prisma.$executeRawUnsafe(`UPDATE sources SET last_success_at = now(), last_error_at = NULL, updated_at = now() WHERE key = $1`, APAROBOT_COMPANY_SOURCE.key)
  await log(runId, 'INFO', 'Aparobot company import completed', { directory_links: links.length, requested_profiles: records.length, requests, imported, verified, missing, rejected, failures })
  return { directory_links: links.length, requested_profiles: records.length, requests, imported, verified, missing, rejected, failures, published: 0 }
}

async function fetchAparobotHtml(url: string) {
  const parsed = new URL(url)
  if (parsed.origin !== 'https://www.aparobot.com') throw new Error('Aparobot URL left its approved origin')
  const response = await fetch(parsed, {
    headers: { 'User-Agent': 'RobotSpace.io/1.0 (authorised company discovery; contact@robotspace.io)', Accept: 'text/html' },
    signal: AbortSignal.timeout(20_000), redirect: 'error',
  })
  if (!response.ok) throw new Error(`Aparobot returned HTTP ${response.status}`)
  const type = response.headers.get('content-type') || ''
  if (!type.toLowerCase().includes('text/html')) throw new Error('Aparobot returned a non-HTML response')
  const length = Number(response.headers.get('content-length') || 0)
  if (Number.isFinite(length) && length > 1_500_000) throw new Error('Aparobot response is too large')
  const html = await response.text()
  if (html.length > 1_500_000) throw new Error('Aparobot response is too large')
  return html
}

function extractAparobotCompanyLinks(html: string, base: string) {
  const found = new Map<string, AparobotCompanyLink>()
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,1000}?)<\/a>/gi)) {
    try {
      const url = new URL(match[1], base)
      if (url.origin !== new URL(base).origin || !APAROBOT_COMPANY_SOURCE.companyPath.test(url.pathname)) continue
      const name = cleanCatalogManufacturer(cleanCatalogText(match[2])) || catalogNameFromUrl(url)
      const externalId = url.pathname.split('/').filter(Boolean).at(-1) || ''
      if (externalId && name.length >= 2 && name.length <= 120) found.set(url.toString(), { url: url.toString(), externalId, name })
    } catch {}
  }
  return [...found.values()]
}

async function parseAparobotCompanyDetail(html: string, fallbackName: string): Promise<AparobotCompanyDetail> {
  const heading = html.match(/<h1\b[^>]*>([\s\S]{0,1000}?)<\/h1>/i)
  const name = cleanCatalogManufacturer(heading ? cleanCatalogText(heading[1]) : fallbackName)
  if (!name) throw new Error('Aparobot company profile has no usable name')
  const countryCode = aparobotCountryCode(html)
  const candidate = extractAparobotWebsiteCandidate(html)
  if (!candidate) return { name, countryCode, officialUrl: null, officialUrlStatus: 'MISSING', officialUrlReason: 'NO_LABELLED_WEBSITE_LINK' }
  const verification = await verifyOfficialCompanyWebsite(name, candidate)
  return { name, countryCode, officialUrl: verification.url, officialUrlStatus: verification.url ? 'VERIFIED' : 'REJECTED', officialUrlReason: verification.reason }
}

function extractAparobotWebsiteCandidate(html: string) {
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]{0,1000}?)<\/a>/gi)) {
    if (!isAparobotWebsiteLabel(cleanCatalogText(match[2]))) continue
    const href = htmlAttribute(match[1], 'href')
    if (!href) continue
    try {
      const url = new URL(decodeEntities(href), APAROBOT_COMPANY_SOURCE.directoryUrl)
      if (url.origin !== 'https://www.aparobot.com') return url.toString()
    } catch {}
  }
  return null
}

function isAparobotWebsiteLabel(value: string) {
  return /\b(?:view|visit)\s+(?:the\s+)?(?:official\s+)?(?:website|site)\b/i.test(value)
    || /\bofficial\s+(?:website|site)\b/i.test(value)
}

function aparobotCountryCode(html: string) {
  const match = html.match(/href=["'][^"']*\/countries\/([^/?#"']+)[^"']*["']/i)
  if (!match) return null
  const country = decodeURIComponent(match[1]).toLowerCase().replace(/[^a-z]+/g, '-')
  const map: Record<string, string> = {
    china: 'CN', 'united-states': 'US', usa: 'US', 'south-korea': 'KR', korea: 'KR', japan: 'JP', germany: 'DE',
    france: 'FR', 'united-kingdom': 'GB', uk: 'GB', italy: 'IT', spain: 'ES', sweden: 'SE', switzerland: 'CH',
    denmark: 'DK', netherlands: 'NL', canada: 'CA', israel: 'IL', india: 'IN', singapore: 'SG', taiwan: 'TW',
    australia: 'AU', austria: 'AT', belgium: 'BE', finland: 'FI', norway: 'NO', poland: 'PL', czechia: 'CZ',
    turkey: 'TR', brazil: 'BR', mexico: 'MX', russia: 'RU', ukraine: 'UA', 'united-arab-emirates': 'AE',
  }
  return map[country] ?? null
}

async function verifyOfficialCompanyWebsite(companyName: string, candidate: string): Promise<{ url: string | null; reason: OfficialWebsiteReason }> {
  let url: URL
  try { url = new URL(candidate) } catch { return { url: null, reason: 'INVALID_URL' } }
  if (!isSafeOfficialWebsiteUrl(url)) return { url: null, reason: 'UNSAFE_HOST' }
  try {
    const result = await fetchOfficialWebsitePage(url)
    if (!result.page) return { url: null, reason: result.reason }
    const page = result.page
    const hostMatches = hostnameSupportsCompanyName(page.url.hostname, companyName)
    const body = page.body
    const title = cleanCatalogText(body.match(/<title\b[^>]*>([\s\S]{0,1000}?)<\/title>/i)?.[1] ?? '')
    // A branded hostname is sufficient when the title is empty or generic. A
    // non-branded hostname (for example avinc.com for AeroVironment) must have
    // a matching title before it can be treated as the brand's official site.
    return hostMatches || websiteTitleSupportsCompanyName(title, companyName)
      ? { url: page.url.toString(), reason: 'VERIFIED' }
      : { url: null, reason: 'NAME_NOT_CONFIRMED' }
  } catch { return { url: null, reason: 'REQUEST_FAILED' } }
}

function isSafeOfficialWebsiteUrl(url: URL) {
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !url.hostname) return false
  const hostname = url.hostname.toLowerCase()
  if (isThirdPartyCompanyWebsiteHost(hostname) || isPrivateWebsiteHostname(hostname)) return false
  return true
}

async function fetchOfficialWebsitePage(initialUrl: URL): Promise<{ page: { url: URL; body: string } | null; reason: OfficialWebsiteReason }> {
  let url = new URL(initialUrl)
  url.search = ''; url.hash = ''
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'RobotSpace.io/1.0 (official company website verification; contact@robotspace.io)', Accept: 'text/html' },
      signal: AbortSignal.timeout(15_000), redirect: 'manual',
    })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location) return { page: null, reason: 'INVALID_REDIRECT' }
      let next: URL
      try { next = new URL(location, url) } catch { return { page: null, reason: 'INVALID_REDIRECT' } }
      if (!isSafeOfficialWebsiteUrl(next)) return { page: null, reason: 'UNSAFE_HOST' }
      next.search = ''; next.hash = ''; url = next
      continue
    }
    if (!response.ok || !(response.headers.get('content-type') || '').toLowerCase().includes('text/html')) return { page: null, reason: 'NON_HTML_RESPONSE' }
    const length = Number(response.headers.get('content-length') || 0)
    if (Number.isFinite(length) && length > 1_000_000) return { page: null, reason: 'RESPONSE_TOO_LARGE' }
    const body = await response.text()
    return body.length <= 1_000_000 ? { page: { url, body }, reason: 'VERIFIED' } : { page: null, reason: 'RESPONSE_TOO_LARGE' }
  }
  return { page: null, reason: 'TOO_MANY_REDIRECTS' }
}

type OfficialCompanyFacts = { countryCode: string | null; foundedYear: number | null; fields: string[] }

// This collector operates only after a company URL has already passed the
// independent official-site verifier. It reads structured facts transiently
// from that same domain; it does not persist HTML, marketing copy or images.
async function enrichOfficialCompanyProfiles(runId: string) {
  await assertSourceReady(OFFICIAL_COMPANY_SOURCE)
  const companies = await prisma.$queryRawUnsafe<Array<{ company_entity_id: string; canonical_name: string; official_url: string }>>(
    `SELECT company_entity_id, canonical_name, official_url
     FROM company_public_projections
     WHERE official_url IS NOT NULL AND official_url_verified_at IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM source_records record
         WHERE record.source_id = $1 AND record.external_id = company_public_projections.company_entity_id::text
           AND record.source_revision = $2
           AND (record.metadata_json->>'official_enrichment_checked_at')::timestamptz >= now() - interval '90 days'
       )
     ORDER BY official_url_verified_at DESC NULLS LAST, canonical_name
     LIMIT $3`,
    OFFICIAL_COMPANY_SOURCE, OFFICIAL_COMPANY_ENRICHMENT_VERSION, OFFICIAL_COMPANY_ENRICHMENT_BATCH_SIZE,
  )
  if (!companies.length) return { requested: 0, enriched: 0, country: 0, founded: 0, failures: 0, published: 0 }

  let requested = 0; let enriched = 0; let country = 0; let founded = 0; let failures = 0
  for (let index = 0; index < companies.length; index++) {
    const company = companies[index]
    try {
      const initial = new URL(company.official_url)
      if (!isSafeOfficialWebsiteUrl(initial)) throw new Error('Verified URL no longer meets safety policy')
      const home = await fetchOfficialWebsitePage(initial); requested++
      if (!home.page) throw new Error(`Official site unavailable: ${home.reason}`)
      const pages = [home.page]
      for (const link of extractOfficialCompanySupplementLinks(home.page.body, home.page.url).slice(0, 2)) {
        const extra = await fetchOfficialWebsitePage(link); requested++
        if (extra.page) pages.push(extra.page)
      }
      const facts = mergeOfficialCompanyFacts(pages.map(page => extractOfficialCompanyFacts(page.body)))
      const metadata = {
        official_enrichment_checked_at: new Date().toISOString(), official_enrichment_version: OFFICIAL_COMPANY_ENRICHMENT_VERSION,
        country_code: facts.countryCode, founded_year: facts.foundedYear, observed_fields: facts.fields, raw_html_retained: false,
      }
      const records = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO source_records (source_id, external_id, canonical_url, source_revision, payload_hash, last_seen_at, parse_status, metadata_json)
         VALUES ($1, $2, $3, $4, $5, now(), 'accepted', $6::jsonb)
         ON CONFLICT (source_id, external_id, source_revision) DO UPDATE SET
           canonical_url = EXCLUDED.canonical_url, payload_hash = EXCLUDED.payload_hash, last_seen_at = now(), parse_status = 'accepted',
           metadata_json = source_records.metadata_json || EXCLUDED.metadata_json
         RETURNING id`,
        OFFICIAL_COMPANY_SOURCE, company.company_entity_id, home.page.url.toString(), OFFICIAL_COMPANY_ENRICHMENT_VERSION,
        createHash('sha256').update(JSON.stringify(metadata)).digest('hex'), JSON.stringify(metadata),
      )
      await prisma.$executeRawUnsafe(
        `UPDATE company_public_projections SET
           country_code = COALESCE(country_code, $1), founded_year = COALESCE(founded_year, $2),
           last_verified_at = CASE WHEN $1 IS NULL AND $2 IS NULL THEN last_verified_at ELSE now() END,
           updated_at = now() WHERE company_entity_id = $3::uuid`,
        facts.countryCode, facts.foundedYear, company.company_entity_id,
      )
      await upsertEntitySourceLink({
        entityId: company.company_entity_id, sourceId: OFFICIAL_COMPANY_SOURCE, sourceRecordId: records[0]?.id ?? null,
        canonicalUrl: home.page.url.toString(), externalId: company.company_entity_id, matchType: 'OFFICIAL_SITE', matchConfidence: .95,
        observedFields: facts.fields,
      })
      if (facts.fields.length) enriched++
      if (facts.countryCode) country++
      if (facts.foundedYear) founded++
    } catch (error) {
      failures++
      await log(runId, 'WARN', 'Official company enrichment skipped', { company_id: company.company_entity_id, error: error instanceof Error ? error.message : 'Unknown error' })
    }
    if (index < companies.length - 1) await delay(60_500)
  }
  await prisma.$executeRawUnsafe(`UPDATE sources SET last_success_at = now(), last_error_at = NULL, updated_at = now() WHERE key = $1`, OFFICIAL_COMPANY_SOURCE)
  await log(runId, 'INFO', 'Official company enrichment completed', { requested, companies: companies.length, enriched, country, founded, failures, published: 0 })
  return { requested, companies: companies.length, enriched, country, founded, failures, published: 0 }
}

function extractOfficialCompanySupplementLinks(html: string, base: URL) {
  const links = new Map<string, URL>()
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]{0,1000}?)<\/a>/gi)) {
    const label = cleanCatalogText(match[2]).toLowerCase()
    if (!/\b(about|company|our story|who we are|history|contact)\b/.test(label)) continue
    const href = htmlAttribute(match[1], 'href')
    if (!href) continue
    try {
      const url = new URL(decodeEntities(href), base)
      if (!isSafeOfficialWebsiteUrl(url) || !sameOfficialWebsiteHost(url.hostname, base.hostname)) continue
      url.search = ''; url.hash = ''
      links.set(url.toString(), url)
    } catch {}
  }
  return [...links.values()]
}

function sameOfficialWebsiteHost(left: string, right: string) {
  return left.toLowerCase().replace(/^www\./, '') === right.toLowerCase().replace(/^www\./, '')
}

function extractOfficialCompanyFacts(html: string): OfficialCompanyFacts {
  const result: OfficialCompanyFacts = { countryCode: null, foundedYear: null, fields: [] }
  const visit = (value: unknown) => {
    if (Array.isArray(value)) { for (const item of value) visit(item); return }
    if (!value || typeof value !== 'object') return
    const object = value as Record<string, unknown>
    const types = Array.isArray(object['@type']) ? object['@type'] : [object['@type']]
    const isOrganisation = types.some(type => typeof type === 'string' && /organization|corporation|localbusiness/i.test(type))
    if (isOrganisation) {
      const country = countryCodeFromOfficialValue(object.address && typeof object.address === 'object' ? (object.address as Record<string, unknown>).addressCountry : null)
      const year = foundedYearFromOfficialValue(object.foundingDate)
      if (!result.countryCode && country) { result.countryCode = country; result.fields.push('identity.country_code') }
      if (!result.foundedYear && year) { result.foundedYear = year; result.fields.push('identity.founded_year') }
    }
    for (const child of Object.values(object)) visit(child)
  }
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]{0,250000}?)<\/script>/gi)) {
    try { visit(JSON.parse(decodeEntities(match[1].trim()))) } catch {}
  }
  return result
}

function mergeOfficialCompanyFacts(facts: OfficialCompanyFacts[]) {
  const merged: OfficialCompanyFacts = { countryCode: null, foundedYear: null, fields: [] }
  for (const fact of facts) {
    if (!merged.countryCode && fact.countryCode) merged.countryCode = fact.countryCode
    if (!merged.foundedYear && fact.foundedYear) merged.foundedYear = fact.foundedYear
  }
  if (merged.countryCode) merged.fields.push('identity.country_code')
  if (merged.foundedYear) merged.fields.push('identity.founded_year')
  return merged
}

function countryCodeFromOfficialValue(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : value && typeof value === 'object' && typeof (value as Record<string, unknown>).name === 'string' ? String((value as Record<string, unknown>).name).trim() : ''
  if (/^[A-Za-z]{2}$/.test(text)) return text.toUpperCase()
  const normalized = text.toLowerCase().replace(/[^a-z]+/g, '-')
  const countries: Record<string, string> = { 'united-states': 'US', usa: 'US', china: 'CN', germany: 'DE', japan: 'JP', 'south-korea': 'KR', 'united-kingdom': 'GB', france: 'FR', canada: 'CA', israel: 'IL', singapore: 'SG', taiwan: 'TW', switzerland: 'CH', sweden: 'SE', denmark: 'DK', netherlands: 'NL', italy: 'IT', spain: 'ES', australia: 'AU', india: 'IN' }
  return countries[normalized] ?? null
}

function foundedYearFromOfficialValue(value: unknown) {
  const match = typeof value === 'string' || typeof value === 'number' ? String(value).match(/\b(18\d{2}|19\d{2}|20\d{2})\b/) : null
  return match ? Number(match[1]) : null
}

function isThirdPartyCompanyWebsiteHost(hostname: string) {
  const blocked = ['aparobot.com', 'linkedin.com', 'facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'youtube.com', 'tiktok.com', 'wikipedia.org', 'wikidata.org', 'crunchbase.com', 'pitchbook.com', 'github.com', 'amazon.com', 'alibaba.com', 'aliexpress.com']
  return blocked.some(domain => hostMatches(hostname.toLowerCase(), domain))
}

function isPrivateWebsiteHostname(hostname: string) {
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname === '::1') return true
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map(Number)
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  }
  return hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe80:')
}

function companyNameTokens(value: string) {
  const ignored = new Set(['robotics', 'robotic', 'technology', 'technologies', 'automation', 'systems', 'system', 'corporation', 'company', 'limited', 'ltd', 'inc', 'llc', 'corp', 'gmbh', 'co'])
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length >= 3 && !ignored.has(token))
}

function hostnameSupportsCompanyName(hostname: string, name: string) {
  const compactHost = hostname.toLowerCase().replace(/^www\./, '').replace(/[^a-z0-9]+/g, '')
  return companyNameTokens(name).some(token => compactHost.includes(token))
}

function websiteTitleSupportsCompanyName(title: string, name: string) {
  const compactTitle = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')
  return companyNameTokens(name).some(token => compactTitle.includes(token))
}

function isUsableCatalogName(value: string) {
  return Boolean(value) && !/^(specs?|learn more|view details|read more|details|→)$/i.test(value) && value.length <= 255
}

function catalogNameFromUrl(url: URL) {
  const tail = url.pathname.split('/').filter(Boolean).at(-1) || ''
  try { return decodeURIComponent(tail).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() } catch { return tail.replace(/[-_]+/g, ' ').trim() }
}

function isCatalogProductRecord(record: { source_id: string; canonical_url: string }) {
  try {
    const path = new URL(record.canonical_url).pathname
    return CATALOG_SOURCES.find(source => source.key === record.source_id)?.productPath.test(path) ?? false
  } catch {}
  return false
}

async function collectInsightsMetadata(runId: string) {
  const feeds = [
    ['techcrunch-robotics', 'https://techcrunch.com/category/robotics/feed/'],
    ['hackaday-robotics', 'https://hackaday.com/tag/robotics/feed/'],
    ['roboticstomorrow', 'https://www.roboticstomorrow.com/rss.php'],
    ['techxplore-robotics', 'https://techxplore.com/rss-feed/robotics-news/'],
    ['ieee-spectrum-robotics', 'https://spectrum.ieee.org/feeds/feed.rss'],
    ['robohub', 'https://robohub.org/feed/'],
    ['robotics-automation-news', 'https://roboticsandautomationnews.com/feed/'],
    ['robotics-247', 'https://www.robotics247.com/rss'],
    ['the-robot-report', 'https://www.therobotreport.com/feed/'],
    ['robotsguide', 'https://robotsguide.com/feed/'],
    ['humanoid-guide-news', 'https://humanoid.guide/feed/'],
  ] as const
  const since = new Date('2026-07-01T00:00:00Z')
  const now = new Date()
  const existing = await prisma.$queryRawUnsafe<Array<{ title: string; canonical_url: string; published_at: Date }>>(`SELECT title, canonical_url, published_at FROM articles WHERE published_at >= $1`, since)
  const known = existing.map(row => ({ ...row, normalizedTitle: normalizeNewsTitle(row.title) })); let requests = 0; let accepted = 0; let duplicates = 0; let irrelevant = 0
  for (const [source, feed] of feeds) {
    await assertSourceReady(source)
    try {
      const response = await fetch(feed, { headers: { 'User-Agent': 'RobotSpace.io/1.0 (RSS metadata; contact@robotspace.io)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(20_000), redirect: 'error' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`); requests++
      for (const item of parseRssItems(await response.text())) {
        if (!item.title || !item.url || !item.date || item.date < since || item.date > now || !isSourceArticleUrl(item.url, feed)) continue
        if (!isRelevantNews(item.title, item.categories)) { irrelevant++; await log(runId, 'INFO', 'RSS item skipped as irrelevant', { source, title: item.title, url: item.url }); continue }
        const normalized = normalizeNewsTitle(item.title)
        const duplicate = known.find(article => areSameNewsStory(article, { normalizedTitle: normalized, canonicalUrl: item.url, publishedAt: item.date }))
        if (duplicate) { duplicates++; await log(runId, 'INFO', 'RSS item skipped as duplicate', { source, title: item.title, url: item.url, duplicate_url: duplicate.canonical_url }); continue }
        const inserted = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`INSERT INTO articles (source_id,external_id,guid,canonical_url,title,authors,published_at,categories,metadata_hash,full_text_storage_allowed,publication_status,summary_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,false,'PENDING','PENDING') ON CONFLICT (canonical_url) DO NOTHING RETURNING id`, source, createHash('sha256').update(item.url).digest('hex').slice(0,64), item.guid, item.url, item.title, item.author, item.date, JSON.stringify(item.categories), createHash('sha256').update(JSON.stringify(item)).digest('hex'))
        if (inserted.length) { known.push({ title: item.title, canonical_url: item.url, published_at: item.date, normalizedTitle: normalized }); accepted++; await log(runId, 'INFO', 'RSS item accepted for summary', { source, title: item.title, url: item.url }) } else { duplicates++; await log(runId, 'INFO', 'RSS item skipped as duplicate canonical URL', { source, title: item.title, url: item.url }) }
      }
      await prisma.$executeRawUnsafe(`UPDATE sources SET last_success_at=now(),last_error_at=NULL,updated_at=now() WHERE key=$1`, source)
    } catch (error) { await log(runId,'WARN',`RSS skipped for ${source}`,{ error: error instanceof Error ? error.message : 'Unknown error' }) }
  }
  if (!requests) throw new Error('All RSS feeds failed')
  return { requests, accepted, duplicates, irrelevant, since: since.toISOString(), published: 0 }
}

async function writeInsightsSummaries(runId: string) {
  const articles = await prisma.$queryRawUnsafe<Array<{ id:string; title:string; canonical_url:string; source_id:string; summary_format: 'LEGACY_V1' | 'LONG_V2' }>>(`SELECT id,title,canonical_url,source_id,COALESCE(summary_format,'LEGACY_V1') AS summary_format FROM articles WHERE publication_status = 'PENDING' AND (list_summary IS NULL OR detail_summary IS NULL) ORDER BY published_at DESC LIMIT 10`)
  let completed=0; let failed=0
  for (const article of articles) {
    try {
      const response = await fetch(article.canonical_url,{ headers:{'User-Agent':'RobotSpace.io/1.0 (transient summary; contact@robotspace.io)',Accept:'text/html'},signal:AbortSignal.timeout(25_000),redirect:'error' })
      if(!response.ok) throw new Error(`HTTP ${response.status}`)
      const text=decodeEntities((await response.text()).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()).slice(0,14000)
      const summary=await requestInternalSummary({ title:article.title, sourceText:text, format:article.summary_format })
      const listWords = summary.list_summary.split(/\s+/).filter(Boolean).length
      const detailWords = summary.detail_summary.split(/\s+/).filter(Boolean).length
      const paragraphs = summary.detail_summary.split(/\n{2,}/).filter(Boolean).length
      const valid = article.summary_format === 'LEGACY_V1'
        ? listWords <= 50 && detailWords >= 200 && detailWords <= 400
        : listWords >= 55 && listWords <= 80 && detailWords >= 350 && detailWords <= 500 && paragraphs === 3
      if (!summary.list_summary || !summary.detail_summary || !valid) throw new Error('Invalid summary format')
      await prisma.$executeRawUnsafe(`UPDATE articles SET list_summary=$1,detail_summary=$2,summaries_generated_at=now(),publication_status='PUBLISHED',summary_status='GENERATED' WHERE id=$3::uuid`,summary.list_summary.trim(),summary.detail_summary.trim(),article.id)
      const mentions = await attachInsightMentions(article.id, summary.brands, summary.robots, 'AI_CONTEXT')
      await log(runId, 'INFO', `Summary generated for ${article.id}`, { mention_candidates: { brands: summary.brands.length, robots: summary.robots.length }, mentions })
      completed++
    } catch(error) { failed++; const reason = error instanceof Error ? error.message : 'Unknown error'; const fallback = fallbackInsightPreview(article.title); await prisma.$executeRawUnsafe(`UPDATE articles SET list_summary=$1,detail_summary=$2,summaries_generated_at=now(),publication_status='PUBLISHED',summary_status='FALLBACK' WHERE id=$3::uuid`, fallback.list, fallback.detail, article.id); await log(runId,'WARN',`Summary fallback published for ${article.id}`,{ error: reason, summary_status: 'FALLBACK', retry_required: true }) }
  }
  return { processed:articles.length,completed,failed,remaining:Math.max(0,articles.length-completed) }
}

async function requestInternalSummary(input: { title: string; sourceText: string; format: 'LEGACY_V1' | 'LONG_V2' }) {
  const token = process.env.INTERNAL_AGENT_TOKEN || process.env.ADMIN_PASSWORD
  if (!token) throw new Error('INTERNAL_AGENT_TOKEN is not configured')
  const endpoint = process.env.INTERNAL_AGENT_SUMMARY_URL || 'http://127.0.0.1:3001/api/internal/insights-summary'
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-agent-token': token },
    body: JSON.stringify(input),
    redirect: 'error',
    signal: AbortSignal.timeout(240_000),
  })
  const payload = await response.json().catch(() => null) as { list_summary?: unknown; detail_summary?: unknown; brands?: unknown; robots?: unknown; error?: unknown } | null
  if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : `Internal summary API HTTP ${response.status}`)
  if (typeof payload?.list_summary !== 'string' || typeof payload.detail_summary !== 'string') throw new Error('Internal summary API returned invalid payload')
  return { list_summary: payload.list_summary, detail_summary: payload.detail_summary, brands: toMentionNames(payload.brands), robots: toMentionNames(payload.robots) }
}

function toMentionNames(value: unknown) { return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string').map(item => item.replace(/\s+/g, ' ').trim()).filter(item => item.length > 1 && item.length <= 255))].slice(0, 12) : [] }

async function attachInsightMentions(articleId: string, brands: string[], robots: string[], mentionType: 'AI_CONTEXT' | 'MANUAL') {
  const requested = [...brands.map(name => ({ name, type: 'COMPANY' })), ...robots.map(name => ({ name, type: 'ROBOT' }))]
  if (!requested.length) return { attached: 0, unresolved: [] as string[] }
  const matches = await prisma.$queryRawUnsafe<Array<{ entity_id: string; entity_type: 'COMPANY' | 'ROBOT'; canonical_name: string }>>(`
    SELECT company_entity_id AS entity_id, 'COMPANY'::varchar AS entity_type, canonical_name FROM company_public_projections
    UNION ALL
    SELECT robot_entity_id AS entity_id, 'ROBOT'::varchar AS entity_type, canonical_name FROM robot_public_projections
  `)
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const unresolved: string[] = []; let attached = 0
  for (const item of requested) {
    const match = matches.find(candidate => candidate.entity_type === item.type && normalize(candidate.canonical_name) === normalize(item.name))
    if (!match) { unresolved.push(item.name); continue }
    await prisma.$executeRawUnsafe(`DELETE FROM entity_mentions WHERE article_id=$1::uuid AND entity_id=$2::uuid`, articleId, match.entity_id)
    await prisma.$executeRawUnsafe(`INSERT INTO entity_mentions(article_id,entity_type,entity_id,mention_type,confidence) VALUES($1::uuid,$2,$3::uuid,$4,.90)`, articleId, match.entity_type, match.entity_id, mentionType)
    attached++
  }
  return { attached, unresolved }
}


function xml(value: string) { return decodeEntities(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim() }
function decodeEntities(value: string) { return value.replace(/&(amp|quot|apos|lt|gt);|&#(x[0-9a-f]+|\d+);/gi, (_all, named, numeric) => { if (named) return ({ amp:'&', quot:'"', apos:"'", lt:'<', gt:'>' } as Record<string,string>)[named.toLowerCase()] || _all; const code = String(numeric).toLowerCase().startsWith('x') ? Number.parseInt(String(numeric).slice(1),16) : Number.parseInt(String(numeric),10); try { return Number.isFinite(code) ? String.fromCodePoint(code) : _all } catch { return _all } }) }
function tag(block: string, name: string) { const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,'i')); return match ? xml(match[1]) : '' }
function parseRssItems(feed: string) {
  return [...feed.matchAll(/<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi)].map(match => {
    const block = match[1]
    const rawLink = tag(block, 'link')
    const links = [...block.matchAll(/<link\b([^>]*)>/gi)].map(link => {
      const attributes = link[1]
      return { href: attributes.match(/\bhref=["']([^"']+)/i)?.[1] || '', rel: attributes.match(/\brel=["']([^"']+)/i)?.[1]?.toLowerCase() || '' }
    })
    const href = links.find(link => link.href && (!link.rel || link.rel === 'alternate'))?.href || links.find(link => link.href)?.href || ''
    const dateText = tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated')
    const date = new Date(dateText)
    return { title: tag(block, 'title'), url: href || rawLink, guid: tag(block, 'guid') || tag(block, 'id') || null, author: tag(block, 'author') || tag(block, 'dc:creator') || null, date, categories: [...block.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi)].map(x => xml(x[1])).filter(Boolean) }
  }).filter(item => item.url.startsWith('https://') && !Number.isNaN(item.date.valueOf()))
}
function isSourceArticleUrl(articleUrl: string, feedUrl: string) { try { const articleHost = new URL(articleUrl).hostname.replace(/^www\./, ''); const feedHost = new URL(feedUrl).hostname.replace(/^www\./, ''); return articleHost === feedHost || articleHost.endsWith(`.${feedHost}`) } catch { return false } }
function normalizeNewsTitle(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim() }
function newsSimilarity(a: string,b: string) { const x=new Set(a.split(' ').filter(Boolean)); const y=new Set(b.split(' ').filter(Boolean)); let common=0; for(const v of x) if(y.has(v)) common++; return common/Math.max(1,Math.max(x.size,y.size)) }
function canonicalStoryUrl(value: string) { try { const url = new URL(value); url.search = ''; url.hash = ''; return url.toString().replace(/\/$/, '') } catch { return value } }
function areSameNewsStory(existing: { normalizedTitle: string; canonical_url: string; published_at: Date }, candidate: { normalizedTitle: string; canonicalUrl: string; publishedAt: Date }) { return canonicalStoryUrl(existing.canonical_url) === canonicalStoryUrl(candidate.canonicalUrl) || (Math.abs(existing.published_at.valueOf() - candidate.publishedAt.valueOf()) <= 7 * 24 * 60 * 60 * 1000 && newsSimilarity(existing.normalizedTitle, candidate.normalizedTitle) >= .82) }
function isRelevantNews(title: string,categories: string[]) { const text = `${title} ${categories.join(' ')}`; const robotics = /robot|humanoid|cobot|agv|amr|manipulat|robotic|autonom(?:ous|y)/i.test(text); const context = /automation|industrial|warehouse|manufactur|factory|logistics|mobility|surgical|agricultur|ros\b|embodied ai|machine vision/i.test(text); return robotics || context }
function fallbackInsightPreview(title: string) { const cleanTitle = decodeEntities(title).replace(/\s+/g, ' ').trim(); return { list: `${cleanTitle} Read the full story on the original publisher's website.`, detail: `Read the full story, including the source's complete context and reporting, on the original publisher's website.` } }

type WikidataSearchResult = { id?: string; label?: string; description?: string; concepturi?: string }

async function discoverWikidataCompanies(runId: string) {
  await assertSourceReady('wikidata')
  const rotation = Math.floor(Date.now() / (6 * 60 * 60 * 1000)).toString()
  const companies = await prisma.$queryRawUnsafe<Array<{ company_entity_id: string; canonical_name: string; unibot_id: string }>>(
    `SELECT company_entity_id, canonical_name, unibot_id FROM company_public_projections
     WHERE unibot_id IS NOT NULL AND canonical_name <> ''
     ORDER BY md5(company_entity_id::text || $1) LIMIT 5`, rotation,
  )
  if (!companies.length) throw new Error('No imported companies are available for Wikidata discovery')
  await log(runId, 'INFO', 'Searching Wikidata identity candidates', { companies: companies.length, limitPerCompany: 3 })

  let requests = 0
  let candidates = 0
  let failures = 0
  for (const company of companies) {
    try {
      const results = await searchWikidata(company.canonical_name)
      requests++
      for (const result of results.slice(0, 3)) {
        if (!result.id || !/^Q\d+$/.test(result.id)) continue
        const canonicalUrl = result.concepturi || `https://www.wikidata.org/wiki/${result.id}`
        const metadata = { company_entity_id: company.company_entity_id, unibot_id: company.unibot_id, query: company.canonical_name, label: result.label || null, description: result.description || null, exact_label_match: normalizeName(result.label) === normalizeName(company.canonical_name), discovered_at: new Date().toISOString() }
        const externalId = `${company.unibot_id}:${result.id}`
        const sourceRecords = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `INSERT INTO source_records (source_id, external_id, canonical_url, source_revision, payload_hash, last_seen_at, parse_status, metadata_json)
           VALUES ('wikidata', $1, $2, 'wikidata-company-search-v1', $3, now(), 'accepted', $4::jsonb)
           ON CONFLICT (source_id, external_id, source_revision)
           DO UPDATE SET canonical_url = EXCLUDED.canonical_url, payload_hash = EXCLUDED.payload_hash, last_seen_at = now(), parse_status = 'accepted', metadata_json = EXCLUDED.metadata_json
           RETURNING id`,
          externalId, canonicalUrl, createHash('sha256').update(JSON.stringify(metadata)).digest('hex'), JSON.stringify(metadata),
        )
        await upsertEntitySourceLink({
          entityId: company.company_entity_id,
          sourceId: 'wikidata',
          sourceRecordId: sourceRecords[0]?.id ?? null,
          canonicalUrl,
          externalId,
          matchType: metadata.exact_label_match ? 'EXACT_LABEL' : 'CANDIDATE',
          matchConfidence: metadata.exact_label_match ? 0.65 : 0.30,
          observedFields: ['identity.qid', 'identity.label', 'identity.description', 'identity.concept_uri'],
        })
        candidates++
      }
    } catch (error) {
      failures++
      await log(runId, 'WARN', `Wikidata search skipped for ${company.canonical_name}`, { error: error instanceof Error ? error.message : 'Unknown error' })
    }
    if (requests < companies.length) await delay(6_100)
  }
  if (!requests) throw new Error('All Wikidata requests failed')
  await prisma.$executeRawUnsafe(`UPDATE sources SET last_success_at = now(), last_error_at = NULL, updated_at = now() WHERE key = 'wikidata'`)
  await log(runId, 'INFO', 'Wikidata identity discovery completed', { requests, candidates, failures, published: 0 })
  return { requests, candidates, failures, published: 0 }
}

async function upsertEntitySourceLink(input: {
  entityId: string; sourceId: string; sourceRecordId: string | null; canonicalUrl: string; externalId: string
  matchType: string; matchConfidence: number; observedFields: string[]
}) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO entity_source_links (entity_id, source_id, source_record_id, canonical_url, external_id, match_type, match_confidence, observed_fields)
     VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6, $7, $8::jsonb)
     ON CONFLICT (entity_id, source_id, canonical_url) DO UPDATE
     SET source_record_id = EXCLUDED.source_record_id, external_id = EXCLUDED.external_id, match_type = EXCLUDED.match_type,
         match_confidence = EXCLUDED.match_confidence, observed_fields = EXCLUDED.observed_fields, last_seen_at = now(), updated_at = now()`,
    input.entityId, input.sourceId, input.sourceRecordId, input.canonicalUrl, input.externalId,
    input.matchType, input.matchConfidence, JSON.stringify(input.observedFields),
  )
}

async function runCatalogOrchestrator(runId: string) {
  const catalog = await resolveCatalogCandidates(runId)
  const rows = await prisma.$queryRawUnsafe<Array<{ candidate_count: number; exact_matches: number; last_seen_at: Date | null }>>(
    `SELECT count(*)::int AS candidate_count,
            count(*) FILTER (WHERE COALESCE((metadata_json->>'exact_label_match')::boolean, false))::int AS exact_matches,
            max(last_seen_at) AS last_seen_at
     FROM source_records WHERE source_id = 'wikidata' AND source_revision = 'wikidata-company-search-v1'`,
  ).catch(() => [])
  const evidence = rows[0] ?? { candidate_count: 0, exact_matches: 0, last_seen_at: null }
  await log(runId, 'INFO', 'Catalog orchestration completed', {
    ...catalog,
    wikidata_identity_candidates: evidence.candidate_count,
    ai_route_when_needed: 'COMPLEX',
    note: 'Aparobot, Humanoid Guide, then RobotLAB fill missing factual fields. A deterministic Unibot match is used only for brand and image.',
  })
  return { ...evidence, ...catalog, published: catalog.published }
}

async function resolveCatalogCandidates(runId: string) {
  const details = await enrichCatalogSourceDetails(runId)
  const records = await prisma.$queryRawUnsafe<Array<CatalogRecord>>(
    `SELECT id, source_id, canonical_url, metadata_json->>'name' AS name, metadata_json->'detail' AS detail
     FROM source_records
     WHERE source_revision = 'catalog-links-v1'
       AND source_id IN ('aparobot-robots', 'humanoid-guide-database', 'robotlab-store')
     ORDER BY CASE source_id
       WHEN 'aparobot-robots' THEN 1
       WHEN 'humanoid-guide-database' THEN 2
       WHEN 'robotlab-store' THEN 3
       ELSE 9 END, canonical_url`,
  )
  let published = 0; let merged = 0; let rejected = 0; let needsReview = 0; let pendingDetails = 0; let unibotMatched = 0; let brandsLinked = 0
  for (const record of records) {
    if (!isCatalogProductRecord(record)) continue
    const detail = catalogDetailFromUnknown(record.detail)
    if (!detail) { pendingDetails++; continue }
    const name = (detail.name || record.name || '').trim(); const normalized = normalizeName(name)
    if (!normalized || /^(specs|robot|robots|market report|humanoids)$/i.test(name)) { rejected++; continue }
    if (!detail.is_robot) {
      await queueCatalogCandidate(record, name, normalized, 'The source page did not provide enough evidence that this store item is a robot')
      needsReview++
      continue
    }
    const unibot = await findUnibotRobotMatch(normalized)
    const unibotCompanyId = unibot?.brand_name ? await ensureCatalogManufacturer(unibot.brand_name) : null
    // An exact Unibot product can exist without a usable brand. In that case
    // the authorised catalog remains the brand source instead of leaving the
    // robot unassigned.
    const sourceCompanyId = !unibotCompanyId && detail.manufacturer_name ? await ensureCatalogManufacturer(detail.manufacturer_name) : null
    const inferredCompany = !unibotCompanyId && !sourceCompanyId ? await inferManufacturerFromRobotName(name) : null
    const companyId = unibotCompanyId ?? sourceCompanyId ?? inferredCompany?.id ?? null
    const manufacturerName = unibot?.brand_name ?? detail.manufacturer_name ?? inferredCompany?.name ?? null
    // A directory product page remains an entity_source_link. Official URL is
    // only inherited from the already confirmed company profile.
    const officialUrl = await confirmedCompanyOfficialUrl(companyId)
    if (unibot) unibotMatched++
    const existing = await prisma.$queryRawUnsafe<Array<{ robot_entity_id: string }>>(`SELECT robot_entity_id FROM robot_public_projections WHERE lower(regexp_replace(canonical_name,'[^a-zA-Z0-9]+','','g'))=$1 LIMIT 1`, normalized)
    if (existing[0]) {
      await upsertCatalogCandidate({ record, name, normalized, status: 'MERGED', reason: 'Matched existing normalized robot name and filled only missing source fields', robotId: existing[0].robot_entity_id, companyId, manufacturerName, confidence: .9 })
      const enrichment = await enrichRobotFromSources(existing[0].robot_entity_id, record, detail, unibot, unibotCompanyId, sourceCompanyId, inferredCompany?.id ?? null, officialUrl)
      if (enrichment.brandLinked) brandsLinked++
      await upsertCatalogSourceLink(existing[0].robot_entity_id, record, detail, .9); merged++; continue
    }
    // A failed run can have created the entity before a later source write
    // failed.  Reuse that deterministic entity on retry instead of turning an
    // otherwise recoverable run into a permanent unique-slug failure.
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70)}-${createHash('sha256').update(record.canonical_url).digest('hex').slice(0,8)}`
    const entity = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO entities(entity_type, slug, publication_status)
       VALUES('ROBOT', $1, 'PUBLISHED')
       ON CONFLICT (slug) DO UPDATE SET updated_at = entities.updated_at
       WHERE entities.entity_type = 'ROBOT'
       RETURNING id`,
      slug,
    )
    if (!entity[0]) throw new Error(`Catalog robot slug belongs to a non-robot entity: ${slug}`)
    const robotId = entity[0].id
    await prisma.$executeRawUnsafe(`INSERT INTO robots(entity_id) VALUES($1::uuid) ON CONFLICT(entity_id) DO NOTHING`, robotId)
    await prisma.$executeRawUnsafe(
      `INSERT INTO robot_public_projections(robot_entity_id,canonical_name,manufacturer_entity_id,official_url,image_url,unibot_id,lifecycle_status,last_verified_at)
       VALUES($1::uuid,$2,$3::uuid,$4,$5,$6,'ACTIVE',now())
       ON CONFLICT(robot_entity_id) DO NOTHING`,
      robotId, name, companyId, officialUrl, unibot?.picture_url ?? null, unibot?.unibot_id ?? null,
    )
    await upsertCatalogCandidate({ record, name, normalized, status: 'ACCEPTED', reason: 'Published from a validated robot source page; lower-priority sources may only fill missing fields', robotId, companyId, manufacturerName, confidence: unibot ? .95 : .82 })
    const enrichment = await enrichRobotFromSources(robotId, record, detail, unibot, unibotCompanyId, sourceCompanyId, inferredCompany?.id ?? null, officialUrl)
    if (enrichment.brandLinked) brandsLinked++
    await upsertCatalogSourceLink(robotId, record, detail, .82); published++
  }
  await log(runId,'INFO','Catalog candidates resolved',{ catalog_candidates: records.length, ...details, published, merged, rejected, needsReview, pendingDetails, unibotMatched, brandsLinked, sources: CATALOG_SOURCES.map(source => source.key) })
  return { catalog_candidates: records.length, ...details, merged, rejected, needsReview, pendingDetails, published, unibotMatched, brandsLinked }
}

type CatalogRecord = { id: string; source_id: string; canonical_url: string; name: string | null; detail: unknown }
type UnibotRobotMatch = { unibot_id: string; brand_name: string | null; picture_url: string | null }
type CatalogDetail = {
  name: string | null
  manufacturer_name: string | null
  payload_kg: number | null
  reach_mm: number | null
  weight_kg: number | null
  summary: string | null
  extra_specs: Record<string, string>
  category_id: typeof ROBOT_CATEGORIES[number]
  is_robot: boolean
  observed_fields: string[]
}
type CatalogCompany = { id: string; name: string }

async function enrichCatalogSourceDetails(runId: string) {
  const records = await prisma.$queryRawUnsafe<Array<{ id: string; source_id: string; canonical_url: string; name: string | null; metadata_json: unknown }>>(
    `SELECT id, source_id, canonical_url, metadata_json->>'name' AS name, metadata_json
     FROM source_records
     WHERE source_revision = 'catalog-links-v1'
       AND source_id IN ('aparobot-robots', 'humanoid-guide-database', 'robotlab-store')
       AND COALESCE(metadata_json->>'detail_version', '') <> $1
     ORDER BY CASE source_id
       WHEN 'aparobot-robots' THEN 1
       WHEN 'humanoid-guide-database' THEN 2
       WHEN 'robotlab-store' THEN 3
       ELSE 9 END, canonical_url
     LIMIT $2`,
    CATALOG_DETAIL_VERSION, CATALOG_DETAIL_BATCH_SIZE,
  )
  let fetched = 0; let failed = 0; let skipped = 0
  for (const [index, record] of records.entries()) {
    if (!isCatalogProductRecord(record)) {
      const metadata = {
        ...objectValue(record.metadata_json),
        detail_version: CATALOG_DETAIL_VERSION,
        detail_skipped_at: new Date().toISOString(),
        detail_skip_reason: 'not_product_url',
      }
      await prisma.$executeRawUnsafe(
        `UPDATE source_records
         SET metadata_json = $1::jsonb, payload_hash = $2, parse_status = 'skipped'
         WHERE id = $3::uuid`,
        JSON.stringify(metadata), createHash('sha256').update(JSON.stringify(metadata)).digest('hex'), record.id,
      )
      skipped++
      continue
    }
    try {
      const detail = await fetchCatalogDetail(record)
      const existing = objectValue(record.metadata_json)
      const metadata = {
        ...existing,
        detail_version: CATALOG_DETAIL_VERSION,
        detail_fetched_at: new Date().toISOString(),
        detail,
      }
      await prisma.$executeRawUnsafe(
        `UPDATE source_records
         SET metadata_json = $1::jsonb, payload_hash = $2, parse_status = 'accepted', last_seen_at = now()
         WHERE id = $3::uuid`,
        JSON.stringify(metadata), createHash('sha256').update(JSON.stringify(metadata)).digest('hex'), record.id,
      )
      fetched++
    } catch (error) {
      failed++
      await log(runId, 'WARN', `Catalog detail skipped for ${record.source_id}`, {
        url: record.canonical_url,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
    if (index < records.length - 1) await delay(3_100)
  }
  return { detail_attempted: records.length - skipped, detail_fetched: fetched, detail_failed: failed, detail_skipped: skipped, detail_queue_empty: records.length === 0 ? 1 : 0 }
}

async function fetchCatalogDetail(record: { source_id: string; canonical_url: string; name: string | null }) {
  const source = CATALOG_SOURCES.find(candidate => candidate.key === record.source_id)
  if (!source) throw new Error('Unknown catalog source')
  const requested = new URL(record.canonical_url)
  const directory = new URL(source.directoryUrl)
  if (requested.protocol !== 'https:' || requested.port || requested.origin !== directory.origin || !source.productPath.test(requested.pathname)) throw new Error('Catalog detail URL is not allowed')
  await assertSourceReady(source.key)
  const response = await fetch(requested, {
    headers: { 'User-Agent': 'RobotSpace.io/1.0 (catalog factual enrichment; contact@robotspace.io)', Accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(25_000), redirect: 'error',
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const contentType = response.headers.get('content-type') || ''
  if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) throw new Error(`Unexpected content type ${contentType}`)
  const html = await response.text()
  if (!html || html.length > 5_000_000) throw new Error('Catalog HTML size is invalid')
  return parseCatalogDetail(html, source.key, record.name)
}

function parseCatalogDetail(html: string, sourceId: CatalogSource['key'], fallbackName: string | null): CatalogDetail {
  const product = extractProductJsonLd(html)
  const pairs = [...jsonLdSpecificationPairs(product), ...extractHtmlSpecificationPairs(html)]
  const productName = cleanCatalogText(firstText(product?.name) ?? htmlMeta(html, ['og:title', 'twitter:title']) ?? fallbackName ?? '')
  const description = cleanCatalogText(firstText(product?.description) ?? htmlMeta(html, ['description', 'og:description', 'twitter:description']) ?? '')
  const manufacturer = cleanCatalogManufacturer(
    productBrand(product?.brand) ?? productBrand(product?.manufacturer) ??
    findSpecificationValue(pairs, /^(brand|manufacturer|maker|company)$/i) ??
    extractManufacturerFromDescription(description),
  )
  const payload = parseMeasurement(findSpecificationValue(pairs, /(payload|max(?:imum)?\s*(?:load|payload)|load\s*capacity|lifting\s*capacity|strength|carry(?:ing)?\s*capacity)/i) ?? product?.payload, 'weight')
  const reach = parseMeasurement(findSpecificationValue(pairs, /(reach|working\s*radius|maximum\s*reach|arm\s*length)/i) ?? product?.reach, 'length')
  const weight = parseMeasurement(findSpecificationValue(pairs, /(?:^|\s)(weight|mass|net\s*weight)(?:\s|\[|$)/i) ?? product?.weight, 'weight')
  const extraSpecs = specificationMap(pairs)
  const summary = buildCatalogSummary(productName || fallbackName || 'This robot', manufacturer, description, payload, reach, weight)
  const robotEvidence = `${productName} ${description} ${pairs.map(pair => `${pair.label} ${pair.value}`).join(' ')}`
  const category = classifyRobotCategory(sourceId, robotEvidence)
  // An actual robot description often mentions its battery or charger. These
  // terms disqualify only an item whose identity itself is an accessory/report.
  const catalogItemIdentity = `${productName} ${fallbackName ?? ''}`
  const accessoryOrResearchItem = /\b(?:accessory|battery|charger|power\s*supply|replacement\s*part|spare\s*part|training\s*data|dataset|survey|market\s*report|whitepaper|software\s*licen[cs]e)\b/i.test(catalogItemIdentity)
  const hasRobotEvidence = /\b(robot|robotic|humanoid|cobot|agv|amr|quadruped|autonomous\s+mobile|mobile\s+platform|telepresence|industrial\s+arm)\b/i.test(robotEvidence)
  const isRobot = !accessoryOrResearchItem && (sourceId !== 'robotlab-store' || hasRobotEvidence)
  const observedFields = [
    'identity.name', 'identity.canonical_url',
    ...(manufacturer ? ['manufacturer.name'] : []),
    ...(payload !== null ? ['specs.payload_kg'] : []),
    ...(reach !== null ? ['specs.reach_mm'] : []),
    ...(weight !== null ? ['specs.weight_kg'] : []),
    ...(Object.keys(extraSpecs).length ? ['specs.extra'] : []),
    ...(summary ? ['summary.short'] : []),
  ]
  return { name: productName || fallbackName, manufacturer_name: manufacturer, payload_kg: payload, reach_mm: reach, weight_kg: weight, summary, extra_specs: extraSpecs, category_id: category, is_robot: isRobot, observed_fields: observedFields }
}

function classifyRobotCategory(sourceId: string, evidence: string): typeof ROBOT_CATEGORIES[number] {
  if (sourceId === 'humanoid-guide-database' || /\bhumanoid|bipedal\b/i.test(evidence)) return 'Humanoid'
  if (/\bmedical|surgical|rehabilitation|patient care|hospital\b/i.test(evidence)) return 'Medical'
  if (/\bagricultur|farm|harvest|orchard|crop\b/i.test(evidence)) return 'Agriculture'
  if (/\bwarehouse|logistics|pallet|last-mile|delivery robot|amr|agv\b/i.test(evidence)) return 'Logistics'
  if (/\bdefen[cs]e|military|surveillance|security|patrol\b/i.test(evidence)) return 'Defense'
  if (/\beducation|stem|classroom|school\b/i.test(evidence)) return 'Education'
  if (/\binspection|oil and gas|infrastructure\b/i.test(evidence)) return 'Inspection'
  if (/\bconsumer|home use|household|companion\b/i.test(evidence)) return 'Consumer'
  if (/\bindustrial|manufacturing|welding|assembly|robotic arm|cobot\b/i.test(evidence)) return 'Industrial'
  return 'Service'
}

function extractProductJsonLd(html: string): Record<string, unknown> | null {
  const candidates: Record<string, unknown>[] = []
  for (const match of html.matchAll(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1].replace(/\/\*[\s\S]*?\*\//g, '').trim())
      collectJsonObjects(parsed, candidates)
    } catch {}
  }
  return candidates.find(candidate => jsonLdType(candidate).includes('product')) ?? null
}

function collectJsonObjects(value: unknown, output: Record<string, unknown>[]) {
  if (Array.isArray(value)) { for (const entry of value) collectJsonObjects(entry, output); return }
  if (!value || typeof value !== 'object') return
  const object = value as Record<string, unknown>
  output.push(object)
  if (Array.isArray(object['@graph'])) for (const entry of object['@graph']) collectJsonObjects(entry, output)
}

function jsonLdType(value: Record<string, unknown>) { return (Array.isArray(value['@type']) ? value['@type'] : [value['@type']]).map(item => String(item ?? '').toLowerCase()) }
function firstText(value: unknown) { return typeof value === 'string' || typeof value === 'number' ? String(value) : null }
function objectValue(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function productBrand(value: unknown) { const object = objectValue(value); return firstText(object.name) ?? firstText(value) }

function jsonLdSpecificationPairs(product: Record<string, unknown> | null) {
  if (!product) return [] as Array<{ label: string; value: string }>
  const values = [product.additionalProperty, product.additionalProperties, product.specifications]
  const pairs: Array<{ label: string; value: string }> = []
  for (const group of values) for (const item of Array.isArray(group) ? group : [group]) {
    const object = objectValue(item)
    const label = cleanCatalogText(firstText(object.name) ?? '')
    const value = cleanCatalogText(firstText(object.value) ?? firstText(object.description) ?? '')
    if (label && value) pairs.push({ label, value })
  }
  return pairs
}

function extractHtmlSpecificationPairs(html: string) {
  const pairs: Array<{ label: string; value: string }> = []
  const add = (label: string, value: string) => {
    const cleanLabel = cleanCatalogText(label); const cleanValue = cleanCatalogText(value)
    if (cleanLabel && cleanValue && cleanLabel.length <= 120 && cleanValue.length <= 240) pairs.push({ label: cleanLabel, value: cleanValue })
  }
  for (const match of html.matchAll(/<th\b[^>]*>([\s\S]{0,1000}?)<\/th>\s*<td\b[^>]*>([\s\S]{0,2000}?)<\/td>/gi)) add(match[1], match[2])
  for (const match of html.matchAll(/<dt\b[^>]*>([\s\S]{0,1000}?)<\/dt>\s*<dd\b[^>]*>([\s\S]{0,2000}?)<\/dd>/gi)) add(match[1], match[2])
  return pairs
}

function htmlMeta(html: string, names: string[]) {
  for (const match of html.matchAll(/<meta\b([^>]+)>/gi)) {
    const attrs = match[1]
    const key = htmlAttribute(attrs, 'name') ?? htmlAttribute(attrs, 'property') ?? htmlAttribute(attrs, 'itemprop')
    if (key && names.includes(key.toLowerCase())) return cleanCatalogText(htmlAttribute(attrs, 'content') ?? '')
  }
  return null
}

function htmlAttribute(attrs: string, name: string) {
  const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'))
  return match?.[2] ?? null
}

function cleanCatalogText(value: string) {
  return decodeEntities(value.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
}

function cleanCatalogManufacturer(value: string | null) {
  const clean = cleanCatalogText(value ?? '').replace(/[®™]/g, '').trim()
  return clean && clean.length <= 120 && !/^(n\/?a|unknown|not specified)$/i.test(clean) ? clean : null
}

function extractManufacturerFromDescription(description: string) {
  const match = description.match(/\b(?:made|developed|manufactured|created)\s+by\s+([A-Z][A-Za-z0-9&.' -]{1,80}?)(?=[,.;]|$)/)
  return match?.[1] ?? null
}

function findSpecificationValue(pairs: Array<{ label: string; value: string }>, pattern: RegExp) {
  return pairs.find(pair => pattern.test(pair.label))?.value ?? null
}

function specificationMap(pairs: Array<{ label: string; value: string }>) {
  const specs: Record<string, string> = {}
  for (const pair of pairs) {
    const label = cleanCatalogText(pair.label).slice(0, 120)
    const value = cleanCatalogText(pair.value).slice(0, 600)
    if (label && value && !(label in specs)) specs[label] = value
  }
  return specs
}

function parseMeasurement(value: unknown, kind: 'weight' | 'length') {
  const text = cleanCatalogText(firstText(value) ?? '').replace(/,/g, '.')
  const match = text.match(/(-?\d+(?:\.\d+)?)\s*(kg|kilograms?|g|grams?|lb|lbs|pounds?|mm|millimet(?:er|re)s?|cm|centimet(?:er|re)s?|m|meters?|metres?|in|inches?|ft|feet)\b/i)
  if (!match) return null
  const amount = Number(match[1]); if (!Number.isFinite(amount) || amount < 0) return null
  const unit = match[2].toLowerCase()
  const converted = kind === 'weight'
    ? /^(g|grams?)$/.test(unit) ? amount / 1000 : /^(lb|lbs|pounds?)$/.test(unit) ? amount * .45359237 : amount
    : /^(cm|centimet)/.test(unit) ? amount * 10 : /^(m|meters?|metres?)$/.test(unit) ? amount * 1000 : /^(in|inches?)/.test(unit) ? amount * 25.4 : /^(ft|feet)$/.test(unit) ? amount * 304.8 : amount
  if (!Number.isFinite(converted) || converted > (kind === 'weight' ? 100000 : 1000000)) return null
  return Math.round(converted * 1000) / 1000
}

function buildCatalogSummary(name: string, manufacturer: string | null, description: string, payload: number | null, reach: number | null, weight: number | null) {
  const sentences = description.split(/(?<=[.!?])\s+/).filter(Boolean)
  let summary = ''
  for (const sentence of sentences) {
    const next = summary ? `${summary} ${sentence}` : sentence
    if (next.length > 520) break
    summary = next
  }
  if (summary.length >= 40) return summary
  const facts = [payload !== null ? `payload ${payload} kg` : null, reach !== null ? `reach ${reach} mm` : null, weight !== null ? `weight ${weight} kg` : null].filter(Boolean)
  return `${manufacturer ? `${manufacturer}'s ` : ''}${name} is listed as a robot by its source catalog${facts.length ? ` with ${facts.join(', ')}` : ''}.`
}

function catalogDetailFromUnknown(value: unknown): CatalogDetail | null {
  const object = objectValue(value)
  if (!Object.keys(object).length) return null
  const extraSpecs: Record<string, string> = {}
  for (const [label, specValue] of Object.entries(objectValue(object.extra_specs))) {
    if (label.length <= 120 && typeof specValue === 'string' && specValue.length <= 600) extraSpecs[label] = specValue
  }
  return {
    name: cleanCatalogText(firstText(object.name) ?? '') || null,
    manufacturer_name: cleanCatalogManufacturer(firstText(object.manufacturer_name)),
    payload_kg: typeof object.payload_kg === 'number' ? object.payload_kg : null,
    reach_mm: typeof object.reach_mm === 'number' ? object.reach_mm : null,
    weight_kg: typeof object.weight_kg === 'number' ? object.weight_kg : null,
    summary: cleanCatalogText(firstText(object.summary) ?? '') || null,
    extra_specs: extraSpecs,
    category_id: ROBOT_CATEGORIES.includes(String(object.category_id) as typeof ROBOT_CATEGORIES[number]) ? String(object.category_id) as typeof ROBOT_CATEGORIES[number] : 'Service',
    is_robot: object.is_robot === true,
    observed_fields: Array.isArray(object.observed_fields) ? object.observed_fields.filter((field): field is string => typeof field === 'string') : ['identity.name', 'identity.canonical_url'],
  }
}

async function robotCategoryId(categoryName: string) {
  const slug = categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (robotCategoryIdCache.has(slug)) return robotCategoryIdCache.get(slug) ?? null
  const category = await prisma.categories.findFirst({ where: { slug, is_active: true }, select: { id: true } })
  const id = category?.id ?? null
  robotCategoryIdCache.set(slug, id)
  return id
}

async function confirmedCompanyOfficialUrl(companyId: string | null) {
  if (!companyId) return null
  if (companyOfficialUrlCache.has(companyId)) return companyOfficialUrlCache.get(companyId) ?? null
  const companies = await prisma.$queryRawUnsafe<Array<{ official_url: string | null; official_url_verified_at: Date | null; official_url_verification_method: string | null }>>(
    `SELECT official_url, official_url_verified_at, official_url_verification_method
     FROM company_public_projections WHERE company_entity_id = $1::uuid`,
    companyId,
  )
  const company = companies[0]
  const candidateUrl = company?.official_url ?? null
  const officialUrl = company?.official_url_verified_at && company.official_url_verification_method && validOfficialUrl(candidateUrl) ? candidateUrl : null
  companyOfficialUrlCache.set(companyId, officialUrl)
  return officialUrl
}

function validOfficialUrl(value: string | null | undefined) {
  try {
    const url = new URL(value ?? '')
    return url.protocol === 'https:' && !url.port && Boolean(url.hostname)
  } catch {
    return false
  }
}

async function findUnibotRobotMatch(normalizedName: string) {
  const rows = await prisma.$queryRawUnsafe<UnibotRobotMatch[]>(
    `SELECT unibot_id, brand_name, picture_url
     FROM unibot_catalog_cache
     WHERE entity_type = 'robot'
       AND lower(regexp_replace(name, '[^a-zA-Z0-9]+', '', 'g')) = $1
     LIMIT 1`,
    normalizedName,
  )
  return rows[0] ?? null
}

async function findCatalogCompanyByName(name: string) {
  const normalized = normalizeName(name)
  const target = normalizedCompanyName(name)
  if (!normalized || !target) return null
  const candidates = await prisma.$queryRawUnsafe<Array<{ company_entity_id: string; canonical_name: string }>>(
    `SELECT company_entity_id, canonical_name FROM company_public_projections
     WHERE canonical_name <> '' ORDER BY canonical_name ASC, company_entity_id ASC LIMIT 5000`,
  )
  const exact = candidates.find(company => normalizeName(company.canonical_name) === normalized)
  if (exact) return { id: exact.company_entity_id, name: exact.canonical_name }
  const canonical = candidates.filter(company => normalizedCompanyName(company.canonical_name) === target)
  if (canonical.length) {
    canonical.sort((a, b) => normalizeName(a.canonical_name).length - normalizeName(b.canonical_name).length)
    if (canonical.length === 1 || normalizeName(canonical[0].canonical_name).length < normalizeName(canonical[1].canonical_name).length) {
      return { id: canonical[0].company_entity_id, name: canonical[0].canonical_name }
    }
  }
  return null
}

function normalizedCompanyName(name: string) {
  return normalizeName(name)
    .replace(/(robotics|technologies|technology|systems|automation|corporation|company|limited|ltd|inc|llc|corp|gmbh)$/i, '')
}

async function ensureCatalogManufacturer(name: string) {
  const cleanName = cleanCatalogManufacturer(name)
  if (!cleanName) return null
  const existing = await findCatalogCompanyByName(cleanName)
  if (existing) return existing.id
  const suffix = `catalog-${createHash('sha256').update(normalizeName(cleanName)).digest('hex').slice(0, 10)}`
  const slug = await uniqueSlug(cleanName, suffix)
  const entity = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `INSERT INTO entities(entity_type, slug, publication_status) VALUES('COMPANY', $1, 'PUBLISHED') RETURNING id`, slug,
  )
  const companyId = entity[0].id
  await prisma.$executeRawUnsafe(`INSERT INTO companies(entity_id) VALUES($1::uuid) ON CONFLICT(entity_id) DO NOTHING`, companyId)
  await prisma.$executeRawUnsafe(
    `INSERT INTO company_public_projections(company_entity_id, canonical_name, last_verified_at)
     VALUES($1::uuid, $2, now()) ON CONFLICT(company_entity_id) DO NOTHING`,
    companyId, cleanName,
  )
  return companyId
}

async function inferManufacturerFromRobotName(robotName: string): Promise<CatalogCompany | null> {
  const normalizedRobot = normalizeName(robotName)
  const firstToken = robotName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').match(/[A-Za-z0-9][A-Za-z0-9&.-]*/)?.[0]?.toLowerCase() ?? ''
  if (firstToken.length < 4) return null
  const companies = await prisma.$queryRawUnsafe<Array<{ company_entity_id: string; canonical_name: string }>>(
    `SELECT company_entity_id, canonical_name FROM company_public_projections
     WHERE canonical_name <> '' ORDER BY canonical_name ASC LIMIT 2000`,
  )
  const exact = companies.filter(company => normalizedRobot.startsWith(normalizeName(company.canonical_name)) && normalizeName(company.canonical_name).length >= 4)
  if (exact.length === 1) return { id: exact[0].company_entity_id, name: exact[0].canonical_name }
  const tokenMatches = companies.filter(company => {
    const token = company.canonical_name.match(/[A-Za-z0-9][A-Za-z0-9&.-]*/)?.[0]?.toLowerCase() ?? ''
    return token.length >= 4 && token === firstToken
  })
  return tokenMatches.length === 1 ? { id: tokenMatches[0].company_entity_id, name: tokenMatches[0].canonical_name } : null
}

async function upsertCatalogCandidate(input: {
  record: CatalogRecord; name: string; normalized: string; status: 'ACCEPTED' | 'MERGED'; reason: string
  robotId: string; companyId: string | null; manufacturerName: string | null; confidence: number
}) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO catalog_candidates(source_record_id,source_id,candidate_name,normalized_name,manufacturer_name,candidate_url,status,decision_reason,robot_entity_id,company_entity_id,confidence,decided_at)
     VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9::uuid,$10::uuid,$11,now())
     ON CONFLICT(source_record_id) DO UPDATE SET
       candidate_name=EXCLUDED.candidate_name, normalized_name=EXCLUDED.normalized_name,
       manufacturer_name=COALESCE(EXCLUDED.manufacturer_name,catalog_candidates.manufacturer_name),
       status=EXCLUDED.status, decision_reason=EXCLUDED.decision_reason, robot_entity_id=EXCLUDED.robot_entity_id,
       company_entity_id=COALESCE(EXCLUDED.company_entity_id,catalog_candidates.company_entity_id),
       confidence=GREATEST(catalog_candidates.confidence,EXCLUDED.confidence), last_seen_at=now(), decided_at=now(), updated_at=now()`,
    input.record.id, input.record.source_id, input.name, input.normalized, input.manufacturerName, input.record.canonical_url,
    input.status, input.reason, input.robotId, input.companyId, input.confidence,
  )
}

async function queueCatalogCandidate(record: CatalogRecord, name: string, normalized: string, reason: string) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO catalog_candidates(source_record_id,source_id,candidate_name,normalized_name,candidate_url,status,decision_reason,confidence)
     VALUES($1::uuid,$2,$3,$4,$5,'NEEDS_REVIEW',$6,.35)
     ON CONFLICT(source_record_id) DO UPDATE SET
       candidate_name=EXCLUDED.candidate_name, normalized_name=EXCLUDED.normalized_name,
       status=CASE WHEN catalog_candidates.status IN ('ACCEPTED','MERGED') THEN catalog_candidates.status ELSE 'NEEDS_REVIEW' END,
       decision_reason=CASE WHEN catalog_candidates.status IN ('ACCEPTED','MERGED') THEN catalog_candidates.decision_reason ELSE EXCLUDED.decision_reason END,
       confidence=CASE WHEN catalog_candidates.status IN ('ACCEPTED','MERGED') THEN catalog_candidates.confidence ELSE EXCLUDED.confidence END,
       last_seen_at=now(), updated_at=now()`,
    record.id, record.source_id, name, normalized, record.canonical_url, reason,
  )
}

async function upsertCatalogSourceLink(robotId: string, record: CatalogRecord, detail: CatalogDetail, confidence: number) {
  await upsertEntitySourceLink({
    entityId: robotId,
    sourceId: record.source_id,
    sourceRecordId: record.id,
    canonicalUrl: record.canonical_url,
    externalId: createHash('sha256').update(record.canonical_url).digest('hex'),
    matchType: 'CATALOG_DETAIL',
    matchConfidence: confidence,
    observedFields: detail.observed_fields,
  })
}

async function enrichRobotFromSources(
  robotId: string,
  record: CatalogRecord,
  detail: CatalogDetail,
  unibot: UnibotRobotMatch | null,
  unibotCompanyId: string | null,
  sourceCompanyId: string | null,
  inferredCompanyId: string | null,
  officialUrl: string | null,
) {
  const fallbackCompanyId = sourceCompanyId ?? inferredCompanyId
  const categoryId = await robotCategoryId(detail.category_id)
  const otherCategoryId = await robotCategoryId('Other')
  if (!categoryId) throw new Error(`Catalog category is unavailable: ${detail.category_id}`)
  await prisma.$executeRawUnsafe(
    `UPDATE robot_public_projections
     SET manufacturer_entity_id = CASE WHEN $1::uuid IS NOT NULL THEN $1::uuid ELSE COALESCE($2::uuid, manufacturer_entity_id) END,
         summary = COALESCE(NULLIF(summary, ''), NULLIF($3::text, '')),
         payload_kg = COALESCE(payload_kg, $4::numeric),
         reach_mm = COALESCE(reach_mm, $5::numeric),
         weight_kg = COALESCE(weight_kg, $6::numeric),
         official_url = COALESCE(official_url, $7::varchar(2000)),
         image_url = CASE WHEN $8::varchar(2000) IS NOT NULL THEN $8::varchar(2000) ELSE image_url END,
         unibot_id = COALESCE($9, unibot_id),
         extra_specs = COALESCE(extra_specs, '{}'::jsonb) || COALESCE((
           SELECT jsonb_object_agg(incoming.key, incoming.value)
           FROM jsonb_each($10::jsonb) AS incoming
           WHERE NOT COALESCE(robot_public_projections.extra_specs, '{}'::jsonb) ? incoming.key
         ), '{}'::jsonb),
         category_id = CASE WHEN category_id IS NULL OR category_id = $12::uuid THEN $11::uuid ELSE category_id END,
         last_verified_at = now(), updated_at = now()
     WHERE robot_entity_id = $13::uuid`,
    unibotCompanyId, fallbackCompanyId, detail.summary, detail.payload_kg, detail.reach_mm, detail.weight_kg,
    officialUrl, unibot?.picture_url ?? null, unibot?.unibot_id ?? null, JSON.stringify(detail.extra_specs), categoryId, otherCategoryId, robotId,
  )
  if (unibot) {
    await prisma.$executeRawUnsafe(
      `UPDATE unibot_catalog_cache SET matched_robot_id = $1::uuid, match_confidence = 1.0
       WHERE unibot_id = $2 AND entity_type = 'robot'`,
      robotId, unibot.unibot_id,
    )
  }
  const companyId = unibotCompanyId ?? fallbackCompanyId
  if (!companyId) return { brandLinked: false }
  await prisma.$executeRawUnsafe(
    `INSERT INTO robot_company_relations(robot_entity_id,company_entity_id,relation,evidence_url)
     VALUES($1::uuid,$2::uuid,'MANUFACTURES',$3)
     ON CONFLICT(robot_entity_id,company_entity_id,relation) DO NOTHING`,
    robotId, companyId, record.canonical_url,
  )
  return { brandLinked: true }
}

async function assertSourceReady(sourceKey: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ status: string; kill_switch: boolean; contracts: number }>>(
    `SELECT s.status, s.kill_switch, (SELECT count(*)::int FROM source_contracts c WHERE c.source_key = s.key) AS contracts FROM sources s WHERE s.key = $1`, sourceKey,
  )
  const source = rows[0]
  if (!source || source.status !== 'ACTIVE' || source.kill_switch || source.contracts < 1) throw new Error(`Source ${sourceKey} is not ready: it must be ACTIVE, unlocked, and have a reviewed contract`)
}

async function searchWikidata(query: string) {
  const url = new URL('https://www.wikidata.org/w/api.php')
  url.search = new URLSearchParams({ action: 'wbsearchentities', search: query, language: 'en', format: 'json', limit: '3', type: 'item' }).toString()
  const response = await fetch(url, { headers: { 'User-Agent': 'RobotSpace.io/1.0 (catalog discovery; contact@robotspace.io)', Accept: 'application/json' }, signal: AbortSignal.timeout(20_000), redirect: 'error' })
  if (!response.ok) throw new Error(`Wikidata returned HTTP ${response.status}`)
  const payload = await response.json() as { search?: WikidataSearchResult[] }
  return payload.search ?? []
}

function normalizeName(value: string | undefined) { return (value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en').replace(/[^a-z0-9]+/g, '') }
function delay(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)) }

async function syncUnibotCatalog(runId: string) {
  const configs = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM unibot_import_config LIMIT 1`)
  const config = configs[0]
  if (!config) throw new Error('Unibot configuration is missing')
  const feedUrl = new URL(config.feed_url)
  if (feedUrl.protocol !== 'https:' || feedUrl.port || !hostMatches(feedUrl.hostname, 'unibot.ru')) throw new Error('Unibot feed URL is not allowed')

  await log(runId, 'INFO', 'Downloading Unibot catalog')
  const response = await fetch(feedUrl, { headers: { 'User-Agent': 'RobotSpace.io/1.0 (sync agent)' }, signal: AbortSignal.timeout(30_000), redirect: 'error' })
  if (!response.ok) throw new Error(`Unibot returned HTTP ${response.status}`)
  const payload: any = await response.json()
  const catalog = payload.catalog ?? {}
  const brands = payload.brands ?? {}
  let robots = 0
  let brandCount = 0

  for (const [id, item] of Object.entries(catalog) as Array<[string, any]>) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO unibot_catalog_cache (unibot_id, entity_type, name, code, section_name, brand_name, picture_url, page_url, price_rub, raw_json)
       VALUES ($1, 'robot', $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       ON CONFLICT (unibot_id, entity_type) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code, section_name = EXCLUDED.section_name, brand_name = EXCLUDED.brand_name, picture_url = EXCLUDED.picture_url, page_url = EXCLUDED.page_url, price_rub = EXCLUDED.price_rub, raw_json = EXCLUDED.raw_json, last_seen_at = now()`,
      id, item.NAME || '', item.CODE || null, item.SECTION_NAME || null, item.BRAND_NAME || null, item.PICTURE || null, item.URL || null, item.PRICE ? Number(item.PRICE) : null, JSON.stringify(item),
    )
    robots++
  }
  for (const [id, item] of Object.entries(brands) as Array<[string, any]>) {
    const countryRu = item.COUNTRY || null
    await prisma.$executeRawUnsafe(
      `INSERT INTO unibot_catalog_cache (unibot_id, entity_type, name, country_ru, country_code, picture_url, page_url, raw_json)
       VALUES ($1, 'brand', $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (unibot_id, entity_type) DO UPDATE SET name = EXCLUDED.name, country_ru = EXCLUDED.country_ru, country_code = EXCLUDED.country_code, picture_url = EXCLUDED.picture_url, page_url = EXCLUDED.page_url, raw_json = EXCLUDED.raw_json, last_seen_at = now()`,
      id, item.NAME || '', countryRu, mapCountry(countryRu), item.PICTURE || null, item.URL || null, JSON.stringify(item),
    )
    brandCount++
  }
  const total = robots + brandCount
  await prisma.$executeRawUnsafe(`UPDATE unibot_import_config SET last_sync_at = now(), last_sync_status = 'ok', last_sync_count = $1, last_error = NULL, updated_at = now() WHERE id = $2::uuid`, total, config.id)
  await log(runId, 'INFO', 'Unibot cache updated', { robots, brands: brandCount })
  return { robots, brands: brandCount, total }
}

async function importUnibotBrands(runId: string) {
  const brands = await prisma.$queryRawUnsafe<any[]>(`
    SELECT unibot_id, name, country_code, picture_url FROM unibot_catalog_cache
    WHERE entity_type = 'brand' ORDER BY name ASC
  `)
  if (!brands.length) throw new Error('Unibot cache has no brands. Run the catalog sync first.')
  let created = 0
  let updated = 0
  let logos = 0
  for (const brand of brands) {
    const existing = await prisma.$queryRawUnsafe<any[]>(`
      SELECT cp.company_entity_id FROM company_public_projections cp
      WHERE cp.unibot_id = $1 OR lower(cp.canonical_name) = lower($2)
      ORDER BY CASE WHEN cp.unibot_id = $1 THEN 0 ELSE 1 END LIMIT 1
    `, brand.unibot_id, brand.name)
    let companyId: string
    if (existing.length) {
      companyId = existing[0].company_entity_id
      updated++
    } else {
      const slug = await uniqueSlug(brand.name, brand.unibot_id)
      const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO entities (entity_type, slug, publication_status) VALUES ('COMPANY', $1, 'PUBLISHED') RETURNING id`, slug,
      )
      companyId = rows[0].id
      await prisma.$executeRawUnsafe(`INSERT INTO companies (entity_id) VALUES ($1::uuid) ON CONFLICT (entity_id) DO NOTHING`, companyId)
      created++
    }
    let imageUrl: string | null = null
    if (brand.picture_url) {
      try {
        imageUrl = await copyBrandLogo(brand.picture_url, companyId)
        logos++
      } catch (error) {
        await log(runId, 'WARN', `Logo skipped for ${brand.name}`, { error: error instanceof Error ? error.message : 'Unknown error' })
      }
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO company_public_projections (company_entity_id, canonical_name, country_code, image_url, unibot_id, last_verified_at)
       VALUES ($1::uuid, $2, $3, $4, $5, now())
       ON CONFLICT (company_entity_id) DO UPDATE SET canonical_name = EXCLUDED.canonical_name, country_code = COALESCE(EXCLUDED.country_code, company_public_projections.country_code), image_url = COALESCE(EXCLUDED.image_url, company_public_projections.image_url), unibot_id = EXCLUDED.unibot_id, last_verified_at = now(), updated_at = now()`,
      companyId, brand.name, brand.country_code, imageUrl, brand.unibot_id,
    )
    await prisma.$executeRawUnsafe(`UPDATE unibot_catalog_cache SET matched_company_id = $1::uuid, match_confidence = 1.0 WHERE unibot_id = $2 AND entity_type = 'brand'`, companyId, brand.unibot_id)
  }
  await log(runId, 'INFO', 'Brand import completed', { created, updated, logos, robotsCreated: 0 })
  return { created, updated, logos, robotsCreated: 0 }
}

async function uniqueSlug(name: string, unibotId: string) {
  const base = name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'unibot-brand'
  const suffix = unibotId.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/(^-|-$)/g, '') || 'catalog'
  for (let attempt = 0; attempt < 100; attempt++) {
    const tail = attempt === 0 ? '' : attempt === 1 ? `-${suffix}` : `-${suffix}-${attempt}`
    const candidate = `${base.slice(0, Math.max(1, 255 - tail.length))}${tail}`
    const existing = await prisma.$queryRawUnsafe<any[]>(`SELECT id FROM entities WHERE slug = $1 LIMIT 1`, candidate)
    if (!existing.length) return candidate
  }
  throw new Error(`Unable to allocate a unique entity slug for ${name}`)
}

async function copyBrandLogo(source: string, companyId: string) {
  const url = new URL(source)
  if (url.protocol !== 'https:' || url.port || !['unibot.ru', 'upload.wikimedia.org'].some(domain => hostMatches(url.hostname, domain))) throw new Error('Image URL is not allowed')
  const response = await fetch(url, { headers: { 'User-Agent': 'RobotSpace.io/1.0 (brand import)' }, signal: AbortSignal.timeout(20_000), redirect: 'error' })
  if (!response.ok) throw new Error(`Logo returned HTTP ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) throw new Error('Logo size is invalid')
  const extension = imageExtension(buffer)
  if (!extension) throw new Error('Logo has unsupported image type')
  const s3 = getS3()
  if (!s3) throw new Error('S3 image storage is not configured')
  const key = `images/brands/${companyId}.${extension}`
  await s3.client.send(new PutObjectCommand({ Bucket: s3.bucket, Key: key, Body: buffer, ContentType: `image/${extension === 'jpg' ? 'jpeg' : extension}`, ACL: 'public-read', CacheControl: 'public, max-age=31536000, immutable' }))
  return `${s3.publicBase}/${key.split('/').map(encodeURIComponent).join('/')}`
}

function getS3() {
  const endpoint = process.env.S3_ENDPOINT?.replace(/\/$/, '')
  const bucket = process.env.S3_BUCKET
  const accessKeyId = process.env.S3_ACCESS_KEY_ID ?? process.env.S3_ACCESS_KEY
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY ?? process.env.S3_SECRET_KEY
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null
  return { bucket, publicBase: (process.env.S3_PUBLIC_BASE_URL ?? `${endpoint}/${bucket}`).replace(/\/$/, ''), client: new S3Client({ endpoint, region: process.env.S3_REGION ?? 'us-east-1', forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false', credentials: { accessKeyId, secretAccessKey } }) }
}

function imageExtension(buffer: Buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg'
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp'
  if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) return 'gif'
  return null
}

function mapCountry(country: string | null) {
  if (!country) return null
  const map: Record<string, string> = { 'Китай': 'CN', 'США': 'US', 'Германия': 'DE', 'Япония': 'JP', 'Корея': 'KR', 'Южная Корея': 'KR', 'Швейцария': 'CH', 'Дания': 'DK', 'Франция': 'FR', 'Великобритания': 'GB', 'Италия': 'IT', 'Швеция': 'SE', 'Нидерланды': 'NL', 'Канада': 'CA', 'Израиль': 'IL', 'Индия': 'IN', 'Сингапур': 'SG', 'Тайвань': 'TW', 'Испания': 'ES', 'Австралия': 'AU', 'Норвегия': 'NO', 'Финляндия': 'FI', 'Австрия': 'AT', 'Бельгия': 'BE', 'Польша': 'PL', 'Чехия': 'CZ', 'Бразилия': 'BR', 'Мексика': 'MX', 'ОАЭ': 'AE', 'Турция': 'TR', 'Россия': 'RU', 'Беларусь': 'BY', 'Казахстан': 'KZ', 'Украина': 'UA' }
  return Object.entries(map).find(([name]) => country.includes(name))?.[1] ?? null
}

function hostMatches(hostname: string, domain: string) { return hostname === domain || hostname.endsWith(`.${domain}`) }

async function log(runId: string, level: 'INFO' | 'WARN' | 'ERROR', message: string, details?: Record<string, unknown>) {
  await prisma.$executeRawUnsafe(`INSERT INTO agent_run_logs (agent_run_id, level, message, details) VALUES ($1::uuid, $2, $3, $4::jsonb)`, runId, level, message, details ? JSON.stringify(details) : null)
}

function cronMatches(expression: string, date: Date) {
  const fields = expression.trim().split(/\s+/)
  if (fields.length !== 5) return false
  const local = new Date(date.toLocaleString('en-US', { timeZone: process.env.AGENT_TIMEZONE ?? 'Europe/Moscow' }))
  return matchesField(fields[0], local.getMinutes(), 0, 59) && matchesField(fields[1], local.getHours(), 0, 23) && matchesField(fields[2], local.getDate(), 1, 31) && matchesField(fields[3], local.getMonth() + 1, 1, 12) && matchesField(fields[4], local.getDay(), 0, 6)
}

function matchesField(field: string, value: number, min: number, max: number) {
  return field.split(',').some(part => {
    const [base, stepRaw] = part.split('/')
    const step = stepRaw ? Number(stepRaw) : 1
    if (!Number.isInteger(step) || step < 1) return false
    const [start, end] = base === '*' ? [min, max] : base.includes('-') ? base.split('-').map(Number) : [Number(base), Number(base)]
    return Number.isInteger(start) && Number.isInteger(end) && start >= min && end <= max && value >= start && value <= end && (value - start) % step === 0
  })
}
