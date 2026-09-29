import React from 'react'
import type { Metadata } from 'next'
import { Footer, ThemeToggle, themeScript } from '@robotspace/ui'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://robotspace.io'),
  title: { default: 'RobotSpace.io - Global Robotics Industry', template: '%s | RobotSpace.io' },
  description: 'Verified data on industrial, humanoid, service, medical, logistics, and agricultural robots.',
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  verification: {
    yandex: '05597bae5cc0756c',
  },
}

const NAV_LINKS = [
  { href: '/robots', label: 'Robots' },
  { href: '/companies', label: 'Companies' },
  { href: '/registry', label: 'Registry' },
  { href: '/market', label: 'Market' },
  { href: '/insights', label: 'Insights' },
]

const MORE_LINKS = [
  { href: '/compare', label: 'Compare robots' },
  { href: '/developers', label: 'Developers' },
  { href: '/integrators', label: 'Integrator map' },
  { href: '/submit', label: 'Submit a robot' },
]

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body style={{
        background: 'var(--color-bg-canvas, #08090a)',
        color: 'var(--color-text-body, #d0d6e0)',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        fontSize: '15px',
        lineHeight: '1.5',
        WebkitFontSmoothing: 'antialiased',
      }}>
        <MobileNav />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  )
}

function MobileNav() {
  return (
    <>
      <nav className="sticky top-0 z-50 backdrop-blur-xl border-b transition-colors"
        style={{ background: 'var(--color-nav-bg)', borderColor: 'var(--color-border-color, #23252a)' }}>
        <div className="max-w-[1200px] mx-auto flex items-center h-14 px-6">
          <Link href="/" aria-label="RobotSpace.io home" className="flex-shrink-0 flex items-center">
            <img src="/logo-color-small.png" alt="RobotSpace.io" className="brand-logo-color h-[40px] w-auto" />
            <img src="/logo-white-small.png" alt="" className="brand-logo-white h-[40px] w-auto" />
          </Link>

          {/* Desktop links */}
          <ul className="hidden lg:flex gap-1 ml-8 list-none">
            {NAV_LINKS.map(link => (
              <li key={link.href}>
                <Link href={link.href} className="text-[13px] px-3 py-2 rounded-md transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                  style={{ color: 'var(--color-nav-link, #d0d6e0)' }}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          <details className="hidden lg:block relative ml-1">
            <summary className="cursor-pointer list-none text-[13px] px-3 py-2 rounded-md hover:bg-[rgba(255,255,255,0.04)]" style={{ color: 'var(--color-nav-link, #d0d6e0)' }}>More</summary>
            <div className="absolute right-0 top-10 w-44 rounded-md border p-1 shadow-lg" style={{ background: 'var(--color-nav-overlay-bg)', borderColor: 'var(--color-border-color)' }}>
              {MORE_LINKS.map(link => <Link key={link.href} href={link.href} className="block rounded px-3 py-2 text-sm hover:bg-[var(--color-hover-bg)]" style={{ color: 'var(--color-nav-link, #d0d6e0)' }}>{link.label}</Link>)}
            </div>
          </details>

          <form action="/search" method="GET" className="hidden lg:block ml-auto max-w-[190px]">
            <label><span className="sr-only">Search RobotSpace</span><input name="q" type="search" placeholder="Search" className="w-full rounded-md border px-3 py-1.5 text-[13px] outline-none" style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-body)', borderColor: 'var(--color-input-border)' }} /></label>
          </form>

          <div className="ml-auto lg:ml-3 flex items-center gap-3">
            <ThemeToggle />
            <details className="lg:hidden">
              <summary aria-label="Open navigation menu" className="cursor-pointer list-none flex flex-col gap-1 p-2">
                <span className="block w-[18px] h-[1.5px] bg-[var(--color-text-body,#d0d6e0)]" />
                <span className="block w-[18px] h-[1.5px] bg-[var(--color-text-body,#d0d6e0)]" />
                <span className="block w-[18px] h-[1.5px] bg-[var(--color-text-body,#d0d6e0)]" />
              </summary>
              <div className="fixed top-14 left-0 right-0 z-40 max-h-[calc(100dvh-3.5rem)] overflow-y-auto backdrop-blur-xl border-b p-6 space-y-2"
                style={{ background: 'var(--color-nav-overlay-bg)', borderColor: 'var(--color-border-color, #23252a)' }}>
                {NAV_LINKS.map(link => <Link key={link.href} href={link.href} className="block text-sm py-2 px-3 rounded-md transition-colors" style={{ color: 'var(--color-nav-link, #d0d6e0)' }}>{link.label}</Link>)}
                {MORE_LINKS.map(link => <Link key={link.href} href={link.href} className="block text-sm py-2 px-3 rounded-md transition-colors" style={{ color: 'var(--color-nav-link, #d0d6e0)' }}>{link.label}</Link>)}
                <Link href="/search" className="block text-sm py-2 px-3 rounded-md transition-colors" style={{ color: 'var(--color-nav-link, #d0d6e0)' }}>Search</Link>
                <Link href="/quote" className="block text-center mt-4 bg-white text-[#08090a] rounded-full px-4 py-2 text-[13px] font-medium">Request a Quote</Link>
              </div>
            </details>
          </div>
        </div>
      </nav>
    </>
  )
}
