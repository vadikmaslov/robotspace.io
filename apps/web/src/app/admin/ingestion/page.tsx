/**
 * Phase 5.4: Ingestion Runs Admin Page
 * Run history, per-stage duration, error samples, retry
 */

import { prisma } from '@robotspace/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function AdminIngestionPage() {
  const runs = await prisma.ingestion_runs.findMany({
    orderBy: { started_at: 'desc' },
    take: 50,
  })

  const running = runs.filter(r => r.state === 'RUNNING').length
  const succeeded = runs.filter(r => r.state === 'SUCCEEDED').length
  const failed = runs.filter(r => r.state === 'FAILED').length

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Ingestion</h1>
        <span className="text-xs text-slate-500">
          {running > 0 && `${running} running · `}{failed} failed · {succeeded} succeeded
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-left text-slate-500 font-medium">
              <th className="py-3 pr-4 font-mono text-xs">Run ID</th>
              <th className="py-3 pr-4">Source</th>
              <th className="py-3 pr-4">State</th>
              <th className="py-3 pr-4 text-right">Discovered</th>
              <th className="py-3 pr-4 text-right">Fetched</th>
              <th className="py-3 pr-4 text-right">Parsed</th>
              <th className="py-3 pr-4 text-right">Accepted</th>
              <th className="py-3 pr-4 text-right">Failed</th>
              <th className="py-3">Started</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-500">No ingestion runs yet</td>
              </tr>
            )}
            {runs.map((run) => (
              <tr key={run.id} className="border-b border-slate-800/50 text-slate-400 hover:bg-slate-900/30">
                <td className="py-3 pr-4 font-mono text-xs text-slate-500">{run.id.slice(0, 8)}</td>
                <td className="py-3 pr-4 font-mono text-xs">{run.source_id}</td>
                <td className="py-3 pr-4">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    run.state === 'SUCCEEDED' ? 'bg-green-900/30 text-green-400'
                    : run.state === 'RUNNING' ? 'bg-blue-900/30 text-blue-400'
                    : run.state === 'FAILED' ? 'bg-red-900/30 text-red-400'
                    : run.state === 'PARTIAL' ? 'bg-amber-900/30 text-amber-400'
                    : 'bg-slate-800 text-slate-400'
                  }`}>{run.state}</span>
                </td>
                <td className="py-3 pr-4 text-right">{run.discovered_count}</td>
                <td className="py-3 pr-4 text-right">{run.fetched_count}</td>
                <td className="py-3 pr-4 text-right">{run.parsed_count}</td>
                <td className="py-3 pr-4 text-right">{run.accepted_count}</td>
                <td className="py-3 pr-4 text-right">{run.failed_count}</td>
                <td className="py-3 text-xs text-slate-500">{new Date(run.started_at).toISOString().slice(11, 19)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
