import { prisma } from '@robotspace/db'
import Link from 'next/link'
import { DeleteButton } from './delete-button'
import { AddModelForm } from './add-model-form'

export default async function EditProviderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let provider: any = null
  let models: any[] = []

  try {
    provider = await prisma.ai_providers.findUnique({ where: { id } })
    models = await prisma.ai_models.findMany({ where: { provider_id: id } })
  } catch {}

  if (!provider) {
    return <div className="p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Provider not found</div>
  }

  return (
    <div className="max-w-xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text-heading)' }}>{provider.display_name}</h1>
        <Link href="/admin/ai/providers" className="text-sm" style={{ color: 'var(--color-text-muted)' }}>← Back</Link>
      </div>

      <div className="p-5 rounded-xl space-y-4" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs mb-1" style={{ color: 'var(--color-text-dim)' }}>Adapter</div>
            <div style={{ color: 'var(--color-text-body)' }}>{provider.adapter_type}</div>
          </div>
          <div>
            <div className="text-xs mb-1" style={{ color: 'var(--color-text-dim)' }}>Base URL</div>
            <div className="font-mono text-xs truncate" style={{ color: 'var(--color-text-body)' }}>{provider.base_url ?? '—'}</div>
          </div>
        </div>

        {/* Models */}
        <div>
          <div className="text-xs mb-2" style={{ color: 'var(--color-text-dim)' }}>Models ({models.length})</div>
          <div className="flex gap-2 flex-wrap mb-3">
            {models.map((m: any) => (
              <span key={m.id} className="px-3 py-1 rounded text-xs"
                style={{ background: 'var(--color-bg-elevated)', color: 'var(--color-text-body)' }}>
                {m.display_name ?? m.remote_model_id}
              </span>
            ))}
          </div>
          <AddModelForm providerId={id} />
        </div>

        <DeleteButton providerId={id} />
      </div>
    </div>
  )
}
