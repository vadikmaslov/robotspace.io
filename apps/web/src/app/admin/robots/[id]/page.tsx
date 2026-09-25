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

export default async function AdminRobotEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let robot: any = null
  let manufacturer: any = null
  let unibotImageUrl: string | null = null
  let sourceLinks: EntitySourceLink[] = []
  let brands: Array<{ id: string; name: string }> = []
  let categories: Array<{ id: string; name: string }> = []

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
    </div>
  )
}
