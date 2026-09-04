// TEMPORARY dev-only trigger for verifying the demo seeder. Deleted after use.
import { NextResponse } from 'next/server'
import { seedDemoData } from '@/lib/demo/seed'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'disabled' }, { status: 404 })
  }
  const t0 = Date.now()
  try {
    const summary = await seedDemoData()
    return NextResponse.json({ ok: true, ms: Date.now() - t0, summary })
  } catch (e) {
    return NextResponse.json(
      { ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : null },
      { status: 500 },
    )
  }
}
