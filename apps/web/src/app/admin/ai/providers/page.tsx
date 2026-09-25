import { prisma } from '@robotspace/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function AdminAIProvidersPage() {
  let providers: any[] = []
  try {
    providers = await prisma.ai_providers.findMany({
      orderBy: { display_name: 'asc' },
    })
    // Fetch credentials and models separately (no Prisma include without reverse fields)
    for (const p of providers) {
      p.credentials = await prisma.ai_provider_credentials.findMany({
        where: { provider_id: p.id },
        take: 1, orderBy: { created_at: 'desc' },
      })
      p.models = await prisma.ai_models.findMany({
        where: { provider_id: p.id },
      })
    }
  } catch (e) { console.error(e) }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text-heading)' }}>AI Providers</h1>
        <div className="flex gap-3">
          <Link href="/admin/ai/routing" className="px-4 py-2 rounded-md text-sm font-medium border"
            style={{ color: 'var(--color-text-body)', borderColor: 'var(--color-border-color)' }}>Routing</Link>
          <Link href="/admin/ai/providers/new"
            className="px-4 py-2 rounded-md text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background: 'var(--color-accent-cta)', color: 'var(--color-accent-cta-text)' }}>
            + Add Provider
          </Link>
        </div>
      </div>

      {providers.map((p: any) => (
        <div key={p.id} className="p-5 rounded-xl" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <span style={{ color: 'var(--color-text-body)' }} className="font-medium">{p.display_name}</span>
              <span className="ml-2 text-xs px-2 py-0.5 rounded" style={{ background: 'var(--color-bg-elevated)', color: 'var(--color-text-muted)' }}>
                {p.adapter_type}
              </span>
            </div>
            <Link href={`/admin/ai/providers/${p.id}`}
              className="text-xs px-3 py-1.5 rounded-md border transition-colors"
              style={{ color: 'var(--color-text-body)', borderColor: 'var(--color-border-color)' }}>
              Edit
            </Link>
          </div>
          <div className="text-xs space-y-1" style={{ color: 'var(--color-text-dim)' }}>
            <div>Key: {p.credentials?.[0]?.last_4 ? `****${p.credentials[0].last_4}` : 'None'}</div>
            <div>Models: {p.models?.filter((m: any) => m.enabled).length ?? 0} enabled</div>
            {p.base_url && <div className="font-mono">{p.base_url}</div>}
          </div>

          {p.models?.length > 0 && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {p.models.map((m: any) => (
                <span key={m.id} className="px-3 py-1 rounded text-xs"
                  style={{ background: m.enabled ? 'var(--color-bg-elevated)' : 'transparent', color: m.enabled ? 'var(--color-text-body)' : 'var(--color-text-dim)', textDecoration: m.enabled ? 'none' : 'line-through' }}>
                  {m.display_name ?? m.remote_model_id}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}

      {providers.length === 0 && (
        <div className="py-12 text-center rounded-xl border border-dashed" style={{ borderColor: 'var(--color-border-color)' }}>
          <p style={{ color: 'var(--color-text-muted)' }}>No AI providers configured.</p>
          <Link href="/admin/ai/providers/new"
            className="inline-block mt-4 px-4 py-2 rounded-md text-sm"
            style={{ background: 'var(--color-accent-cta)', color: 'var(--color-accent-cta-text)' }}>
            Add your first provider
          </Link>
        </div>
      )}
    </div>
  )
}
