import Link from 'next/link'
import { ROBOT_CATEGORIES } from '../../../../lib/robot-categories'

export const dynamic = 'force-dynamic'

const descriptions: Record<string, string> = {
  Industrial: 'Manufacturing, cobots, arms, welding and assembly.', Humanoid: 'Bipedal, human-form robots.',
  Service: 'Hospitality, cleaning, retail and assistance.', Logistics: 'AMRs, AGVs, warehouse and delivery.',
  Medical: 'Surgery, rehabilitation and care.', Agriculture: 'Farming, harvesting and crop operations.',
  Defense: 'Security, surveillance and military use.', Education: 'STEM, research and classroom platforms.',
  Inspection: 'Infrastructure, energy and remote inspection.', Consumer: 'Home, companion and personal robots.',
}

export default function RobotCategoriesPage() {
  return <div className="max-w-4xl space-y-6">
    <div className="flex items-center justify-between"><div><h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text-heading)' }}>Robot categories</h1><p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>The ten catalog categories used by filters, the editor, and automatic classification.</p></div><Link href="/admin/robots" className="text-sm" style={{ color: 'var(--color-text-muted)' }}>← Robots</Link></div>
    <div className="grid gap-3 sm:grid-cols-2">{ROBOT_CATEGORIES.map((category, index) => <div key={category} className="rounded-lg border p-4" style={{ borderColor: 'var(--color-border-color)' }}><div className="text-xs" style={{ color: 'var(--color-text-dim)' }}>{index + 1}</div><h2 className="font-medium" style={{ color: 'var(--color-text-heading)' }}>{category}</h2><p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>{descriptions[category]}</p></div>)}</div>
  </div>
}
