import { prisma } from '@robotspace/db'
import { AgentControls } from './agent-controls'
import { SOURCE_AREA_LABELS, sourceDisplayName } from '../../../lib/source-catalog'

export const dynamic = 'force-dynamic'

type Agent = {
  id: string; agent_key: string; display_name: string; description: string; cron_expression: string | null
  is_enabled: boolean; run_mode: string; site_area: string; agent_role: string; parent_agent_key: string | null
  source_keys: unknown; task_complexity: 'SIMPLE' | 'COMPLEX'; implementation_status: 'PLANNED' | 'READY' | 'RETIRED'
  last_finished_at: Date | string | null; last_state: string | null
}

type AparobotPipelineStats = {
  discovered: number; checked: number; verified: number; missing: number; rejected: number; linked: number; reason_counts: Record<string, number>
}

function formatDate(value: Date | string | null) { return value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—' }
function keys(value: unknown): string[] { return Array.isArray(value) ? value.filter((key): key is string => typeof key === 'string') : [] }

export default async function AdminAgentsPage() {
  const [agents, sourceRows, runs, aparobotRows] = await Promise.all([
    prisma.$queryRawUnsafe<Agent[]>(`SELECT * FROM scheduled_agents ORDER BY site_area, agent_role DESC, display_name`),
    prisma.$queryRawUnsafe<Array<{ key: string; display_name: string | null; owner_name: string | null }>>(`SELECT key, display_name, owner_name FROM sources`),
    prisma.$queryRawUnsafe<any[]>(`
      SELECT r.id, r.operation, r.state, r.created_at, r.started_at, r.finished_at, r.error_code,
             COALESCE(json_agg(json_build_object('level', l.level, 'message', l.message, 'details', l.details, 'created_at', l.created_at) ORDER BY l.created_at) FILTER (WHERE l.id IS NOT NULL), '[]') AS logs
      FROM agent_runs r LEFT JOIN agent_run_logs l ON l.agent_run_id = r.id
      WHERE r.operation IN (SELECT agent_key FROM scheduled_agents)
      GROUP BY r.id ORDER BY r.created_at DESC LIMIT 30
    `),
    prisma.$queryRawUnsafe<AparobotPipelineStats[]>(`
      SELECT
        count(*)::int AS discovered,
        count(*) FILTER (WHERE metadata_json->>'official_website_checked_at' IS NOT NULL)::int AS checked,
        count(*) FILTER (WHERE metadata_json->>'official_website_status' = 'VERIFIED')::int AS verified,
        count(*) FILTER (WHERE metadata_json->>'official_website_status' = 'MISSING')::int AS missing,
        count(*) FILTER (WHERE metadata_json->>'official_website_status' = 'REJECTED')::int AS rejected,
        (SELECT count(*)::int FROM entity_source_links WHERE source_id = 'aparobot-companies') AS linked,
        COALESCE((SELECT jsonb_object_agg(reason, total) FROM (
          SELECT COALESCE(metadata_json->>'official_website_reason', 'UNKNOWN') AS reason, count(*)::int AS total
          FROM source_records WHERE source_id = 'aparobot-companies' AND source_revision = 'aparobot-company-directory-v1'
          GROUP BY COALESCE(metadata_json->>'official_website_reason', 'UNKNOWN')
        ) reasons), '{}'::jsonb) AS reason_counts
      FROM source_records
      WHERE source_id = 'aparobot-companies' AND source_revision = 'aparobot-company-directory-v1'
    `),
  ])
  const sources = new Map(sourceRows.map(source => [source.key, sourceDisplayName(source)]))
  const byArea = agents.reduce<Record<string, Agent[]>>((result, agent) => { ;(result[agent.site_area] ??= []).push(agent); return result }, {})
  const planned = agents.filter(agent => agent.implementation_status === 'PLANNED').length
  const ready = agents.filter(agent => agent.implementation_status === 'READY').length
  const aparobot = aparobotRows[0] ?? { discovered: 0, checked: 0, verified: 0, missing: 0, rejected: 0, linked: 0, reason_counts: {} }
  const reasonLabels: Record<string, string> = { NO_LABELLED_WEBSITE_LINK: 'No labelled website link', UNSAFE_HOST: 'Blocked host', INVALID_URL: 'Invalid URL', INVALID_REDIRECT: 'Invalid redirect', TOO_MANY_REDIRECTS: 'Too many redirects', NON_HTML_RESPONSE: 'Non-HTML response', RESPONSE_TOO_LARGE: 'Response too large', REQUEST_FAILED: 'Request failed', NAME_NOT_CONFIRMED: 'Brand not confirmed', VERIFIED: 'Verified', UNKNOWN: 'Checked before diagnostics' }
  const reasonSummary = Object.entries(aparobot.reason_counts).sort(([, a], [, b]) => b - a).map(([reason, count]) => `${reasonLabels[reason] || reason}: ${count}`)

  return <div className="space-y-8 max-w-7xl">
    <div><h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text-heading)' }}>Agents</h1><p className="mt-1 text-sm max-w-3xl" style={{ color: 'var(--color-text-muted)' }}>Each site area has a COMPLEX orchestrator and SIMPLE collection tasks. Schedules are durable; planned agents stay disabled until their source contract and worker executor are ready.</p></div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Stat label="All agents" value={agents.length} /><Stat label="Orchestrators" value={agents.filter(agent => agent.agent_role === 'ORCHESTRATOR').length} /><Stat label="Ready executors" value={ready} /><Stat label="Planned safely off" value={planned} /></div>
    <section className="rounded-xl border p-4 md:p-5" style={{ borderColor: 'var(--color-border-color)', background: 'var(--color-bg-card)' }}><div className="flex flex-wrap items-baseline justify-between gap-2"><div><h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-heading)' }}>Aparobot companies</h2><p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>Directory pages are provenance only; an official URL is recorded only after independent validation.</p></div><span className="font-mono text-xs" style={{ color: 'var(--color-text-dim)' }}>aparobot-company-import</span></div><div className="mt-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3"><Stat label="Discovered" value={aparobot.discovered} /><Stat label="Checked" value={aparobot.checked} /><Stat label="Official verified" value={aparobot.verified} /><Stat label="No eligible link" value={aparobot.missing} /><Stat label="Rejected" value={aparobot.rejected} /><Stat label="Companies linked" value={aparobot.linked} /></div>{reasonSummary.length ? <p className="mt-4 text-xs" style={{ color: 'var(--color-text-muted)' }}><span className="font-medium">Reasons:</span> {reasonSummary.join(' · ')}</p> : null}</section>
    <div className="space-y-6">{Object.entries(byArea).map(([area, areaAgents]) => <Area key={area} area={area} agents={areaAgents} sources={sources} />)}</div>
    <section><h2 className="mb-3 text-lg font-medium" style={{ color: 'var(--color-text-heading)' }}>Recent execution logs</h2><div className="space-y-3">{runs.length === 0 && <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No runs yet.</p>}{runs.map(run => <details key={run.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--color-border-color)' }}><summary className="cursor-pointer text-sm"><span className="font-mono">{run.operation}</span> · <span style={{ color: run.state === 'FAILED' ? 'var(--color-accent-danger)' : 'var(--color-text-body)' }}>{run.state}</span> · {formatDate(run.created_at)}</summary><div className="mt-3 space-y-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>{run.logs.map((log: any, index: number) => <div key={index}><span className="font-mono">{new Date(log.created_at).toISOString().slice(11, 19)} {log.level}</span> · {log.message}{log.details ? <pre className="mt-1 overflow-x-auto rounded p-2" style={{ background: 'var(--color-bg-card)' }}>{JSON.stringify(log.details, null, 2)}</pre> : null}</div>)}</div></details>)}</div></section>
  </div>
}

function Area({ area, agents, sources }: { area: string; agents: Agent[]; sources: Map<string, string> }) {
  const parents = agents.filter(agent => agent.agent_role === 'ORCHESTRATOR')
  const children = agents.filter(agent => agent.agent_role !== 'ORCHESTRATOR')
  return <section className="rounded-xl border p-4 md:p-5" style={{ borderColor: 'var(--color-border-color)', background: 'var(--color-bg-card)' }}><h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-text-heading)' }}>{SOURCE_AREA_LABELS[area as keyof typeof SOURCE_AREA_LABELS] || area}</h2><div className="space-y-3">{parents.map(parent => <div key={parent.agent_key} className="space-y-2"><AgentCard agent={parent} sources={sources} /><div className="ml-3 md:ml-8 pl-3 md:pl-5 border-l space-y-2" style={{ borderColor: 'var(--color-input-border)' }}>{children.filter(child => child.parent_agent_key === parent.agent_key).map(child => <AgentCard key={child.agent_key} agent={child} sources={sources} child />)}</div></div>)}{children.filter(child => !child.parent_agent_key).map(child => <AgentCard key={child.agent_key} agent={child} sources={sources} child />)}</div></section>
}

function AgentCard({ agent, sources, child = false }: { agent: Agent; sources: Map<string, string>; child?: boolean }) {
  const sourceNames = keys(agent.source_keys).map(key => sources.get(key) || key)
  const ready = agent.implementation_status === 'READY'
  return <div className={`rounded-lg border p-3 ${child ? '' : 'md:p-4'}`} style={{ borderColor: 'var(--color-input-border)', background: 'var(--color-bg-canvas)' }}><div className="grid lg:grid-cols-[minmax(0,1fr)_260px] gap-4"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-medium" style={{ color: 'var(--color-text-heading)' }}>{agent.display_name}</h3><Badge value={agent.agent_role} /><Badge value={agent.task_complexity} emphasis={agent.task_complexity === 'COMPLEX'} /><Badge value={agent.implementation_status} emphasis={ready} /></div><p className="mt-2 text-sm max-w-3xl" style={{ color: 'var(--color-text-muted)' }}>{agent.description}</p><div className="mt-3"><div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--color-text-dim)' }}>Sources handled</div><div className="mt-1 flex flex-wrap gap-1.5">{sourceNames.length ? sourceNames.map(name => <span key={name} className="rounded px-2 py-0.5 text-xs" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-muted)' }}>{name}</span>) : <span className="text-xs" style={{ color: 'var(--color-text-dim)' }}>No external source</span>}</div></div><div className="mt-3 font-mono text-[11px]" style={{ color: 'var(--color-text-dim)' }}>{agent.agent_key} · last: {agent.last_state || 'not run'} · {formatDate(agent.last_finished_at)}</div></div><AgentControls agentKey={agent.agent_key} enabled={agent.is_enabled} cron={agent.cron_expression} runnable={ready && ['unibot-catalog-sync', 'unibot-brand-import', 'aparobot-company-import', 'official-company-enrichment', 'catalog-wikidata-discovery', 'catalog-orchestrator', 'catalog-commercial-directory-review', 'insights-metadata-collector', 'insights-summary-writer'].includes(agent.agent_key)} planned={!ready} /></div></div>
}

function Badge({ value, emphasis = false }: { value: string; emphasis?: boolean }) { return <span className="text-[10px] px-1.5 py-0.5 rounded border" style={{ color: emphasis ? 'var(--color-accent-cta)' : 'var(--color-text-muted)', borderColor: 'var(--color-input-border)' }}>{value}</span> }
function Stat({ label, value }: { label: string; value: number }) { return <div className="p-4 rounded-xl" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}><div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{label}</div><div className="text-xl mt-1 font-semibold" style={{ color: 'var(--color-text-heading)' }}>{value}</div></div> }
