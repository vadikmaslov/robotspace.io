import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { prisma } = await import('@robotspace/db')
    const body = await req.json()
    const model = await prisma.ai_models.create({
      data: {
        provider_id: body.provider_id,
        remote_model_id: body.remote_model_id,
        display_name: body.display_name || body.remote_model_id,
        enabled: true,
      },
    })
    return NextResponse.json(model, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
