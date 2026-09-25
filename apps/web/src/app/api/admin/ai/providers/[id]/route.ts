export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const { prisma } = await import('@robotspace/db')
    await prisma.ai_provider_credentials.deleteMany({ where: { provider_id: id } })
    await prisma.ai_models.deleteMany({ where: { provider_id: id } })
    await prisma.ai_providers.delete({ where: { id } })
    return Response.redirect(new URL('/admin/ai/providers', req.url), 303)
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
