'use client'

import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    const stored = document.documentElement.getAttribute('data-theme') as 'dark' | 'light' | null
    setTheme(stored ?? 'dark')
  }, [])

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    document.cookie = `theme=${next};path=/;max-age=31536000;SameSite=Lax`
    setTheme(next)
  }

  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      style={{
        background: 'none',
        border: '0.5px solid var(--color-border-color, #23252a)',
        color: 'var(--color-text-body, #d0d6e0)',
        cursor: 'pointer',
        width: '32px',
        height: '32px',
        borderRadius: '6px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '14px',
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => {
        (e.target as HTMLButtonElement).style.borderColor = 'var(--color-border-strong, #383b3f)'
        ;(e.target as HTMLButtonElement).style.color = 'var(--color-text-heading, #fff)'
      }}
      onMouseLeave={e => {
        (e.target as HTMLButtonElement).style.borderColor = 'var(--color-border-color, #23252a)'
        ;(e.target as HTMLButtonElement).style.color = 'var(--color-text-body, #d0d6e0)'
      }}>
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  )
}

export const themeScript = `
(function() {
  var theme = document.cookie.split('; ').find(function(r) { return r.startsWith('theme=') });
  theme = theme ? theme.split('=')[1] : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
})()
`
