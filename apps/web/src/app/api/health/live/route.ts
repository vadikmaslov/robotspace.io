/**
 * Health check endpoint handler (Route Handler)
 * GET /api/health/live
 */

export async function GET() {
  return Response.json({ status: 'ok', service: 'robotspace-web' })
}
