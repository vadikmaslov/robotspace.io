'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function CompareLoader() {
  const router = useRouter()

  useEffect(() => {
    const ids = localStorage.getItem('compare_ids')
    if (ids) {
      const idList = ids.split(',').filter(Boolean)
      if (idList.length >= 2) {
        router.push(`/compare?ids=${ids}`)
      }
    }
  }, [router])

  return null
}
