import { NextResponse } from 'next/server'
import { seedDemoData } from '@/lib/demo/seed'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Nightly demo regeneration (see vercel.json). Vercel Cron sends
 * `Authorization: Bearer ${CRON_SECRET}`; anything else is rejected so the
 * route can't be used to churn the demo from outside.
 */
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  const expected = process.env.CRON_SECRET
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const summary = await seedDemoData()
    return NextResponse.json({ ok: true, ...summary })
  } catch (err) {
    console.error('[demo-reset]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'seed failed' },
      { status: 500 },
    )
  }
}
