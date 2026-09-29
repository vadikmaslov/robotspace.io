import { prisma } from '@robotspace/db'
import Link from 'next/link'
import { UploadForm } from './upload-form'
import { SpecsForm } from './specs-form'
import { DeleteRobotButton } from './../delete-button'
import { RobotImage } from '../../../robots/robot-image'
import { getUnibotRobotImageMap } from '../../../../lib/unibot-robot-images'
import { getEntitySourceLinks, type EntitySourceLink } from '../../../../lib/entity-source-links'
import { EntitySourceLinks } from '../../entity-source-links'
import { ROBOT_CATEGORIES } from '../../../../lib/robot-categories'
import { robotResourceTypes } from '../../../../lib/robot-ecosystem'
import { addRobotResource, rejectRobotResource } from './resource-actions'

export default async function AdminRobotEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let robot: any = null
  let manufacturer: any = null
  let unibotImageUrl: string | null = null
  let sourceLinks: EntitySourceLink[] = []
  let brands: Array<{ id: string; name: string }> = []
  let categories: Array<{ id: string; name: string }> = []
  let resources: Array<{ id: string; resource_type: string; title: string; url: string; evidence_url: string; verification_status: string; verified_at: Date }> = []

  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM robot_public_projections WHERE robot_entity_id = $1::uuid LIMIT 1`, id)
    robot = rows[0] ?? null
    if (robot) {
      robot = { ...robot, payload_kg: Number(robot.payload_kg ?? 0), reach_mm: Number(robot.reach_mm ?? 0), weight_kg: Number(robot.weight_kg ?? 0), extra_specs: robot.extra_specs ?? {} }
      unibotImageUrl = (await getUnibotRobotImageMap([robot.unibot_id])).get(robot.unibot_id) ?? null
    }
    const rels = await prisma.robot_company_relations.findMany({
      where: { robot_entity_id: id, relation: 'MANUFACTURES' }, take: 1,
    })
    if (rels.length > 0 && rels[0].company_entity_id) {
      manufacturer = await prisma.company_public_projections.findFirst({
        where: { company_entity_id: rels[0].company_entity_id },
      })
    }
    sourceLinks = await getEntitySourceLinks(id)
    resources = await prisma.robot_resources.findMany({ where: { robot_entity_id: id }, orderBy: [{ verification_status: 'asc' }, { resource_type: 'asc' }] })
    brands = (await prisma.company_public_projections.findMany({ orderBy: { canonical_name: 'asc' } }))
      .filter(company => company.company_entity_id && company.canonical_name)
      .map(company => ({ id: company.company_entity_id!, name: company.canonical_name! }))
    const categoryOrder = new Map(ROBOT_CATEGORIES.map((name, index) => [name.toLowerCase(), index]))
    categories = (await prisma.categories.findMany({
      where: { is_active: true, slug: { in: [...categoryOrder.keys()] } },
      select: { id: true, name_en: true, slug: true },
    }))
      .sort((left, right) => (categoryOrder.get(left.slug) ?? 99) - (categoryOrder.get(right.slug) ?? 99))
      .map(category => ({ id: category.id, name: category.name_en }))
  } catch {}

  if (!robot) return <div className="p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Robot not found</div>

  const slug = robot.canonical_name?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text-heading)' }}>
          Edit: {robot.canonical_name}
        </h1>
        <Link href="/admin/robots" className="text-sm" style={{ color: 'var(--color-text-muted)' }}>← Back</Link>
      </div>

      {/* Image preview */}
      <div className="flex items-start gap-6 p-5 rounded-xl" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}>
        <div className="w-32 h-32 shrink-0 rounded-lg border flex items-center justify-center overflow-hidden" style={{ background: '#fff', borderColor: 'var(--color-border-color)' }}>
          <RobotImage imageUrl={robot.image_url} unibotImageUrl={unibotImageUrl} size="preview" />
        </div>
        <div>
          <div className="text-sm font-medium mb-2" style={{ color: 'var(--color-text-body)' }}>Robot Image</div>
          <UploadForm robotId={id} />
          <p className="text-xs mt-2" style={{ color: 'var(--color-text-dim)' }}>Images are stored on server.</p>
        </div>
      </div>

      {/* Edit form — specs */}
      <div className="p-5 rounded-xl space-y-4" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}>
        <h2 className="text-lg font-medium" style={{ color: 'var(--color-text-heading)' }}>Specifications</h2>
        <SpecsForm robotId={id} robot={robot} brands={brands} categories={categories} />
        <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--color-border-color)' }}>
          <DeleteRobotButton robotId={id} />
        </div>
      </div>

      <EntitySourceLinks links={sourceLinks} />

      <section className="p-5 rounded-xl space-y-5" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}>
        <div><h2 className="text-lg font-medium">Official ecosystem resources</h2><p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>Only independently checked first-party links belong here. The evidence URL records why the link is treated as official.</p></div>
        {resources.length > 0 && <div className="space-y-3">{resources.map(resource => <article key={resource.id} className="rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--color-border-color)' }}><div className="flex flex-wrap justify-between gap-3"><div><span className="font-medium">{resource.resource_type}</span> · {resource.title}<a className="block mt-1 underline break-all" href={resource.url} target="_blank" rel="noopener noreferrer">{resource.url}</a><a className="block mt-1 text-xs underline break-all" href={resource.evidence_url} target="_blank" rel="noopener noreferrer">Evidence</a><span className="block mt-1 text-xs">{resource.verification_status.toLowerCase()} · {resource.verified_at.toISOString().slice(0, 10)}</span></div>{resource.verification_status === 'VERIFIED' && <form action={rejectRobotResource}><input type="hidden" name="robot" value={id} /><input type="hidden" name="resource" value={resource.id} /><button className="rounded border px-3 py-1.5">Reject</button></form>}</div></article>)}</div>}
        <form action={addRobotResource} className="grid gap-3"><input type="hidden" name="robot" value={id} /><label className="text-sm">Type<select name="type" required className="mt-1 block w-full rounded-md border p-2">{robotResourceTypes.map(type => <option key={type} value={type}>{type.replace('_', ' ')}</option>)}</select></label><label className="text-sm">Public label<input name="title" required maxLength={255} placeholder="Official documentation" className="mt-1 block w-full rounded-md border p-2" /></label><label className="text-sm">Resource URL<input name="url" type="url" required defaultValue={robot.official_url ?? ''} className="mt-1 block w-full rounded-md border p-2" /></label><label className="text-sm">Verification evidence URL<input name="evidence" type="url" required placeholder="https://manufacturer.example/robots/..." className="mt-1 block w-full rounded-md border p-2" /></label><button className="rounded-md border px-4 py-2 w-fit">Add verified resource</button></form>
      </section>
    </div>
  )
}
