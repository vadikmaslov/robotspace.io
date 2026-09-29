/**
 * Phase 8: Missing components — Data display, navigation, feedback, admin-specific.
 * All styled by LINEAR tokens (bg-canvas/card/elevated, text-body/muted/heading, border-color).
 * No invention — same spacing/radii/transitions pattern as Button/Badge/Card/Input.
 */

import React from 'react'

// ============================================================
// SELECT
// ============================================================
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> { label?: string }
export function Select({ label, className = '', children, ...props }: SelectProps) {
  return (
    <div className="space-y-2">
      {label && <label className="block font-inter text-[13px] text-text-muted">{label}</label>}
      <select className={`w-full bg-input-bg border border-input-border text-text-body rounded-[var(--radius-input)] px-[14px] py-3 font-inter text-[14px] transition-colors focus:outline-none focus:border-text-muted appearance-none ${className}`} {...props}>
        {children}
      </select>
    </div>
  )
}

// ============================================================
// TREND INDICATOR
// ============================================================
export function TrendIndicator({ value, label }: { value: number; label?: string }) {
  const isPositive = value >= 0
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-[12px] ${isPositive ? 'text-accent-growth' : 'text-accent-decline'}`}>
      <span>{isPositive ? '▲' : '▼'}</span>
      <span>{Math.abs(value).toFixed(1)}%</span>
      {label && <span className="text-text-dim font-inter ml-1">{label}</span>}
    </span>
  )
}

// 3. SKELETON
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-hover-bg rounded-[var(--radius-card)] ${className}`} />
}

// 4. EMPTYSTATE
export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="py-16 text-center space-y-3">
      <p className="font-inter text-[15px] text-text-muted">{title}</p>
      {description && <p className="font-inter text-[13px] text-text-dim">{description}</p>}
    </div>
  )
}

// 5. ERROR STATE
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="py-12 text-center space-y-4">
      <p className="font-inter text-[14px] text-accent-decline">{message}</p>
      {onRetry && <button onClick={onRetry} className="text-[13px] text-text-muted hover:text-text-body underline transition-colors">Try again</button>}
    </div>
  )
}

// 6. BREADCRUMB
export function Breadcrumb({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav className="flex items-center gap-2 font-inter text-[13px] text-text-muted">
      {items.map((item, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="text-text-dim">/</span>}
          {item.href
            ? <a href={item.href} className="hover:text-text-body transition-colors">{item.label}</a>
            : <span className="text-text-body">{item.label}</span>}
        </React.Fragment>
      ))}
    </nav>
  )
}

// 7. PAGINATION
export function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-2 font-inter text-[13px]">
      <button onClick={() => onChange(page - 1)} disabled={page <= 1}
        className="px-3 py-1.5 rounded-[var(--radius-btn)] border border-border-color text-text-muted hover:bg-hover-bg transition-colors disabled:opacity-30">
        ←
      </button>
      <span className="text-text-dim px-2">Page {page} of {total}</span>
      <button onClick={() => onChange(page + 1)} disabled={page >= total}
        className="px-3 py-1.5 rounded-[var(--radius-btn)] border border-border-color text-text-muted hover:bg-hover-bg transition-colors disabled:opacity-30">
        →
      </button>
    </div>
  )
}

// 8. KPI CARD
export function KPICard({ label, value, trend }: { label: string; value: string | number; trend?: { value: number; label?: string } }) {
  return (
    <div className="bg-bg-card rounded-[var(--radius-card)] p-5 shadow-card space-y-2">
      <div className="font-inter text-[12px] text-text-dim uppercase tracking-wider">{label}</div>
      <div className="font-inter text-[32px] font-[400] text-text-heading tracking-[-0.022em]">{value}</div>
      {trend && <TrendIndicator value={trend.value} label={trend.label} />}
    </div>
  )
}

// 9. TREND CARD
export function TrendCard({ title, value, trend, description }: { title: string; value: string; trend: number; description?: string }) {
  return (
    <div className="bg-bg-card rounded-[var(--radius-card)] p-5 shadow-card space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-inter text-[14px] text-text-body">{title}</span>
        <TrendIndicator value={trend} />
      </div>
      <div className="font-mono text-[24px] text-text-heading">{value}</div>
      {description && <p className="font-inter text-[13px] text-text-muted">{description}</p>}
    </div>
  )
}

// 10. STAT CARD
export function StatCard({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <div className="px-4 py-3 text-center space-y-2">
      <div className="font-mono text-[20px] text-accent-data">{value}</div>
      <div className="font-inter text-[13px] text-text-body">{label}</div>
      {subtitle && <div className="font-inter text-[11px] text-text-dim">{subtitle}</div>}
    </div>
  )
}

// 11. CATEGORY PILL
export function CategoryPill({ label, active, onClick }: { label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-1.5 rounded-full font-inter text-[13px] transition-colors ${
        active ? 'bg-accent-cta text-accent-cta-text' : 'bg-tag-bg text-text-muted hover:bg-hover-bg'
      }`}>
      {label}
    </button>
  )
}

// 12. FEATURED COMPANY CARD
export function FeaturedCompanyCard({ name, robots, location, logo }: { name: string; robots: number; location?: string; logo?: string }) {
  return (
    <div className="bg-bg-card rounded-[var(--radius-card)] p-6 shadow-card space-y-4 hover:bg-hover-bg transition-colors">
      {logo && <img src={logo} alt={name} className="h-8 opacity-70" />}
      <div>
        <div className="font-inter text-[14px] text-text-body font-[510]">{name}</div>
        <div className="font-inter text-[13px] text-text-muted">{robots} robots</div>
      </div>
      {location && <div className="font-inter text-[12px] text-text-dim">{location}</div>}
    </div>
  )
}

// 13. NEWS ITEM
export function NewsItem({ title, source, date, preview, url }: { title: string; source: string; date: string; preview?: string; url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener"
      className="block bg-bg-card rounded-[var(--radius-card)] p-5 shadow-card space-y-2 hover:bg-hover-bg transition-colors">
      <div className="font-inter text-[14px] text-text-body">{title}</div>
      <div className="flex items-center gap-2 font-inter text-[12px] text-text-dim">
        <span>{source}</span><span>·</span><span>{date}</span>
      </div>
      {preview && <p className="font-inter text-[13px] text-text-muted line-clamp-2">{preview}</p>}
    </a>
  )
}

// 14. PAGE HEADER
export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 py-8">
      <div className="space-y-2">
        <h1 className="font-inter text-[48px] font-[510] text-text-heading tracking-[-0.022em] leading-[1.0]">{title}</h1>
        {subtitle && <p className="font-inter text-[15px] text-text-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex-shrink-0">{children}</div>}
    </div>
  )
}

// 15. FILTER BAR
export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-3 flex-wrap py-4">{children}</div>
}

// 16. NAV (topbar)
export function Nav({ children }: { children: React.ReactNode }) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-nav-bg backdrop-blur-md border-b border-border-color">
      <div className="max-w-[var(--max-width-page)] mx-auto flex items-center justify-between px-6 h-14">
        {children}
      </div>
    </header>
  )
}

// 17. FOOTER
export function Footer() {
  return (
    <footer className="border-t py-12 mt-24" style={{ borderColor: 'var(--color-border-color)' }}>
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <div style={{ color: 'var(--color-text-body)' }} className="font-mono text-[14px] font-medium">RobotSpace.io</div>
            <p className="text-[13px] mt-2" style={{ color: 'var(--color-text-muted)' }}>Global B2B robotics portal.</p>
          </div>
          {[
            { title: 'Explore', links: ['Robots', 'Companies', 'Compare', 'Insights'] },
            { title: 'Resources', links: ['FAQ', 'Methodology', 'Privacy'] },
            { title: 'Contact', links: ['Submit', 'Request a Quote'] },
          ].map(col => (
            <div key={col.title}>
              <div className="text-[13px] uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-dim)' }}>{col.title}</div>
              <div className="space-y-2">
                {col.links.map(link => (
                  <a key={link} href={link === 'Request a Quote' ? '/quote' : `/${link.toLowerCase().replace(/\s+/g, '-')}`}
                    className="block text-[13px] hover:underline transition-colors"
                    style={{ color: 'var(--color-text-muted)' }}>
                    {link}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8 pt-6 border-t text-center" style={{ borderColor: 'var(--color-border-color)' }}>
          <span className="text-[11px]" style={{ color: 'var(--color-text-dim)' }}>
            © {new Date().getFullYear()} RobotSpace.io — verified data only. No fake numbers.
          </span>
        </div>
      </div>
    </footer>
  )
}
