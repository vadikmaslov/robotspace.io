'use client'

type Props = { href: string }

/** Records an aggregate navigation event only; no account or repository data is stored by RobotSpace. */
export function RepositoryLink({ href }: Props) {
  function track() {
    const metrika = (window as typeof window & { ym?: (id: number, action: string, target: string) => void }).ym
    metrika?.(111096093, 'reachGoal', 'repository_link_opened')
  }

  return <a href={href} target="_blank" rel="noopener noreferrer" onClick={track} className="rounded-md px-4 py-2 text-sm font-medium" style={{ background: 'var(--color-accent-cta)', color: 'var(--color-accent-cta-text)' }}>View repository &rarr;</a>
}
