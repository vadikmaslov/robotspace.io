'use client'

import { useState } from 'react'

export function RobotImage({ imageUrl, unibotImageUrl, fallbackUrl, size }: { imageUrl: string | null; unibotImageUrl?: string | null; fallbackUrl?: string | null; size: 'lg' | 'sm' | 'preview' }) {
  const [failedUrls, setFailedUrls] = useState<string[]>([])
  const dims = size === 'lg' ? 'w-full aspect-square rounded-xl' : size === 'preview' ? 'w-full h-full' : 'w-9 h-9 rounded-md'
  const border = size === 'preview' ? '' : 'border'
  const candidates = [unibotImageUrl, imageUrl, fallbackUrl].filter((url): url is string => Boolean(url)).filter((url, index, all) => all.indexOf(url) === index)
  const src = candidates.find(url => !failedUrls.includes(url)) ?? null

  if (!src) {
    return (
      <div className={`${dims} ${border} flex items-center justify-center`}
        style={{ background: '#fff', borderColor: 'var(--color-border-color)' }}>
        <span className={size === 'lg' ? 'text-6xl' : 'text-base'}>🤖</span>
      </div>
    )
  }

  return (
    <div className={`${dims} ${border} flex items-center justify-center overflow-hidden`}
      style={{ background: '#fff', borderColor: 'var(--color-border-color)' }}>
      <img src={src} alt="" className="w-full h-full object-contain"
        onError={() => setFailedUrls(current => current.includes(src) ? current : [...current, src])} />
    </div>
  )
}
