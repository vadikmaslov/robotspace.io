/**
 * @robotspace/ui — Design System
 * LINEAR dark + DUB light tokens from prototype
 * 26 components from plan section 5.3
 */

// Base primitives (Phase 8A)
export { Button } from './components/button'
export { Badge } from './components/badge'
export { Card } from './components/card'
export { Input } from './components/input'
export { Select } from './components/data-display'
export { ThemeToggle, themeScript } from './components/theme-toggle'

// Data display (Phase 8B)
export { TrendIndicator, Skeleton, EmptyState, ErrorState, Breadcrumb, Pagination, KPICard, TrendCard, StatCard, CategoryPill, FeaturedCompanyCard, NewsItem, PageHeader, FilterBar, Nav, Footer } from './components/data-display'

// Admin-specific (Phase 8B)
export { DataTable, CompareTable, HealthBadge, ConfidenceBadge, SourceBadge, KillSwitch, Sparkline } from './components/admin-components'
