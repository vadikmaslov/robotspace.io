'use client'

import { useEffect, useState } from 'react'

export function CompareButton({ robotId }: { robotId: string }) {
  const [added, setAdded] = useState(false)

  useEffect(() => {
    const ids = getStoredIds()
    setAdded(ids.includes(robotId))
  }, [robotId])

  function toggle() {
    let ids = getStoredIds()
    if (ids.includes(robotId)) {
      ids = ids.filter((id: string) => id !== robotId)
    } else {
      if (ids.length >= 5) { alert('Maximum 5 robots for comparison'); return }
      ids.push(robotId)
    }
    localStorage.setItem('compare_ids', ids.join(','))
    document.cookie = `compare_ids=${ids.join(',')}; path=/; max-age=86400; SameSite=Lax`
    setAdded(!added)
  }

  return (
    <button onClick={toggle}
      className="px-4 py-2.5 rounded-md text-sm border transition-colors"
      style={{
        color: added ? 'var(--color-accent-cta-text)' : 'var(--color-text-body)',
        background: added ? 'var(--color-accent-cta)' : 'transparent',
        borderColor: added ? 'var(--color-accent-cta)' : 'var(--color-border-color)',
      }}>
      {added ? '✓ Added to Compare' : '+ Add to Compare'}
    </button>
  )
}

function getStoredIds(): string[] {
  if (typeof window === 'undefined') return []
  return (localStorage.getItem('compare_ids') || '').split(',').filter(Boolean)
}
