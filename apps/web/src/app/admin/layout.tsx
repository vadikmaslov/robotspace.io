import Link from 'next/link'
import React from 'react'
import type { Metadata } from 'next'

export const metadata: Metadata = { robots: { index: false, follow: false } }

const NAV_ITEMS = [
  { label: 'Registry claims', href: '/admin/registry/claims', icon: 'C' },
  { label: 'Catalog review', href: '/admin/catalog-review', icon: 'R' },
  { label: 'Agents', href: '/admin/agents', icon: 'A' },
  { label: 'Dashboard', href: '/admin', icon: '📊' },
  { label: 'Robots', href: '/admin/robots', icon: '🤖' },
  { label: 'Companies', href: '/admin/companies', icon: '🏢' },
  { label: 'Articles', href: '/admin/articles', icon: '📰' },
  { label: 'Unibot', href: '/admin/unibot', icon: '🔗' },
  { label: 'Sources', href: '/admin/sources', icon: '📡' },
  { label: 'Ingestion', href: '/admin/ingestion', icon: '⚙️' },
  { label: 'Exceptions', href: '/admin/exceptions', icon: '⚠️' },
  { label: 'AI', href: '/admin/ai/providers', icon: '🧠' },
  { label: 'Audit', href: '/admin/audit', icon: '📋' },
  { label: 'Settings', href: '/admin/settings', icon: '⚡' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const email = process.env.NODE_ENV === 'production' ? 'admin' : 'dev@localhost'

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg-canvas)', color: 'var(--color-text-body)' }}>
      <header className="h-14 border-b flex items-center px-6 fixed top-0 left-0 right-0 z-50"
        style={{ background: 'var(--color-bg-canvas)', borderColor: 'var(--color-border-color)' }}>
        <Link href="/admin" className="font-mono font-semibold text-sm tracking-wider" style={{ color: 'var(--color-accent-cta)' }}>
          ROBOTSPACE ADMIN
        </Link>
        <div className="ml-auto flex items-center gap-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          <span>{email}</span>
        </div>
      </header>

      <div className="flex pt-14">
        <aside className="hidden md:flex flex-col w-60 min-h-[calc(100vh-3.5rem)] px-3 py-4 gap-1"
          style={{ borderColor: 'var(--color-border-color)', borderRightWidth: 1 }}>
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href}
              className="flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors"
              style={{ color: 'var(--color-text-muted)' }}>
              <span className="w-5 text-center">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </aside>

        <main className="flex-1 p-6 max-w-[1600px]">
          {children}
        </main>
      </div>
    </div>
  )
}
