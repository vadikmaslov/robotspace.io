/**
 * Metrics interface (OpenTelemetry-compatible)
 * Real implementation in Phase 15
 */

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary'

export interface MetricsProvider {
  counter(name: string, opts?: { description: string }): Counter
  gauge(name: string, opts?: { description: string }): Gauge
  histogram(name: string, opts?: { description: string; buckets?: number[] }): Histogram
}

export interface Counter {
  add(value: number, labels?: Record<string, string>): void
}

export interface Gauge {
  set(value: number, labels?: Record<string, string>): void
}

export interface Histogram {
  record(value: number, labels?: Record<string, string>): void
}

export const noopMetrics: MetricsProvider = {
  counter: () => ({ add: () => {} }),
  gauge: () => ({ set: () => {} }),
  histogram: () => ({ record: () => {} }),
}
