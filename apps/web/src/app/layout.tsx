import React from 'react'
import type { Metadata } from 'next'
import Script from 'next/script'
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
  { href: '/compare', label: 'Compare' },
  { href: '/integrators', label: 'Map' },
  { href: '/insights', label: 'Insights' },
  { href: '/submit', label: 'Submit' },
]

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300;14..32,400;14..32,500;14..32,510;14..32,590&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet" />
      </head>
      <body style={{
        background: 'var(--color-bg-canvas, #08090a)',
        color: 'var(--color-text-body, #d0d6e0)',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        fontSize: '15px',
        lineHeight: '1.5',
        WebkitFontSmoothing: 'antialiased',
      }}>
        <Script
          id="yandex-metrika"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function(m,e,t,r,i,k,a){
                m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
                m[i].l=1*new Date();
                for (var j = 0; j < document.scripts.length; j++) { if (document.scripts[j].src === r) { return; } }
                k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
              })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=111096093', 'ym');
              ym(111096093, 'init', { ssr:true, webvisor:true, clickmap:true, ecommerce:'dataLayer', referrer:document.referrer, url:location.href, accurateTrackBounce:true, trackLinks:true });
            `,
          }}
        />
        <noscript>
          <div><img src="https://mc.yandex.ru/watch/111096093" style={{ position: 'absolute', left: '-9999px' }} alt="" /></div>
        </noscript>
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
          <ul className="hidden md:flex gap-2 ml-12 list-none">
            {NAV_LINKS.map(link => (
              <li key={link.href}>
                <Link href={link.href} className="text-[13px] px-3 py-2 rounded-md transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                  style={{ color: 'var(--color-nav-link, #d0d6e0)' }}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            {/* Hamburger */}
            <label className="md:hidden cursor-pointer flex flex-col gap-1 p-2" htmlFor="mobile-menu-toggle">
              <span className="block w-[18px] h-[1.5px] bg-[var(--color-text-body,#d0d6e0)]" />
              <span className="block w-[18px] h-[1.5px] bg-[var(--color-text-body,#d0d6e0)]" />
              <span className="block w-[18px] h-[1.5px] bg-[var(--color-text-body,#d0d6e0)]" />
            </label>
          </div>
        </div>
      </nav>

      {/* Mobile menu (hidden by default, shown via checkbox hack) */}
      <input type="checkbox" id="mobile-menu-toggle" className="hidden peer" />
      <div className="hidden peer-checked:block md:hidden fixed top-14 left-0 right-0 z-40 backdrop-blur-xl border-b p-6 space-y-2"
        style={{ background: 'var(--color-nav-overlay-bg)', borderColor: 'var(--color-border-color, #23252a)' }}>
        {NAV_LINKS.map(link => (
          <Link key={link.href} href={link.href}
            className="block text-sm py-2 px-3 rounded-md transition-colors"
            style={{ color: 'var(--color-nav-link, #d0d6e0)' }}>
            {link.label}
          </Link>
        ))}
        <Link href="/quote"
          className="block text-center mt-4 bg-white text-[#08090a] rounded-full px-4 py-2 text-[13px] font-medium">
          Request a Quote
        </Link>
      </div>
    </>
  )
}
