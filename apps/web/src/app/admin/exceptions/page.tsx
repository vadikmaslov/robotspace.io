/**
 * Phase 7.5: Admin Exceptions Page
 * Confidence bucket filters, assertion diff, accept/reject/correct+lock, merge/split
 */

import { prisma } from '@robotspace/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function AdminExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ bucket?: string; showVerified?: string }>
}) {
  const params = await searchParams
  const showVerified = params.showVerified === 'true'

  const where: any = {}
  if (!showVerified) {
    where.state = { notIn: ['RESOLVED', 'DISMISSED'] }
  }
  if (params.bucket) {
    where.severity = params.bucket
  }

  const exceptions = await prisma.exceptions.findMany({
    where,
    orderBy: { created_at: 'desc' },
    take: 100,
  })

  const buckets = {
    critical: exceptions.filter(e => e.severity === 'critical').length,
    high: exceptions.filter(e => e.severity === 'high').length,
    medium: exceptions.filter(e => e.severity === 'medium').length,
    low: exceptions.filter(e => e.severity === 'low').length,
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Exceptions</h1>
        <a
          href={`/admin/exceptions?showVerified=${!showVerified}`}
          className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
            showVerified ? 'border-blue-800 bg-blue-900/30 text-blue-400' : 'border-slate-800 text-slate-400 hover:bg-slate-800'
          }`}
        >
          {showVerified ? 'Hide verified' : 'Show all'}
        </a>
      </div>

      {/* Confidence bucket filters */}
      <div className="flex gap-3 flex-wrap">
        {([
          { key: '', label: 'All', count: exceptions.length },
          { key: 'critical', label: 'Critical', count: buckets.critical },
          { key: 'high', label: 'High', count: buckets.high },
          { key: 'medium', label: 'Medium', count: buckets.medium },
          { key: 'low', label: 'Low', count: buckets.low },
        ]).map((bucket) => (
          <a
            key={bucket.key}
            href={`/admin/exceptions?bucket=${bucket.key}`}
            className={`px-3 py-1.5 text-xs rounded-md border transition-colors flex items-center gap-2 ${
              (params.bucket || '') === bucket.key
                ? 'border-blue-800 bg-blue-900/30 text-blue-400'
                : 'border-slate-800 text-slate-400 hover:bg-slate-800'
            }`}
          >
            {bucket.label}
            <span className="text-slate-500 tabular-nums">{bucket.count}</span>
          </a>
        ))}
      </div>

      {/* Exceptions table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-left text-slate-500 font-medium">
              <th className="py-3 pr-4 w-[140px]">Time</th>
              <th className="py-3 pr-4">Type</th>
              <th className="py-3 pr-4">Severity</th>
              <th className="py-3 pr-4">Reason</th>
              <th className="py-3">State</th>
            </tr>
          </thead>
          <tbody>
            {exceptions.length === 0 && (
              <tr>
                <td colSpan={5} className="py-12 text-center text-slate-500">
                  No exceptions. All data verified and published.
                </td>
              </tr>
            )}
            {exceptions.map((ex) => (
              <tr key={ex.id} className="border-b border-slate-800/50 text-slate-400 hover:bg-slate-900/30">
                <td className="py-3 pr-4 font-mono text-xs text-slate-500">
                  {new Date(ex.created_at).toISOString().slice(0, 19).replace('T', ' ')}
                </td>
                <td className="py-3 pr-4">
                  <span className="text-xs font-mono bg-slate-800 px-2 py-0.5 rounded">
                    {ex.type}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    ex.severity === 'critical' ? 'bg-red-900/30 text-red-400'
                    : ex.severity === 'high' ? 'bg-amber-900/30 text-amber-400'
                    : ex.severity === 'medium' ? 'bg-blue-900/30 text-blue-400'
                    : 'bg-slate-800 text-slate-400'
                  }`}>{ex.severity}</span>
                </td>
                <td className="py-3 pr-4 max-w-md truncate">{ex.reason_summary}</td>
                <td className="py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    ex.state === 'OPEN' ? 'bg-amber-900/30 text-amber-400'
                    : ex.state === 'AUTO_RETRYING' ? 'bg-purple-900/30 text-purple-400'
                    : ex.state === 'WAITING_ADMIN' ? 'bg-yellow-900/30 text-yellow-400'
                    : ex.state === 'RESOLVED' ? 'bg-green-900/30 text-green-400'
                    : 'bg-slate-800 text-slate-400'
                  }`}>{ex.state}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
