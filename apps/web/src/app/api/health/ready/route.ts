/**
 * Health check endpoint handler
 * GET /api/health/ready
 * Returns 200 when DB is reachable, 503 otherwise
 */

import { prisma } from '@robotspace/db'

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return Response.json({
      status: 'ready',
      database: 'connected',
    })
  } catch (error) {
    return Response.json(
      {
        status: 'not_ready',
        database: 'disconnected',
        ...(process.env.NODE_ENV !== 'production' && error instanceof Error ? { error: error.message } : {}),
      },
      { status: 503 },
    )
  }
}
