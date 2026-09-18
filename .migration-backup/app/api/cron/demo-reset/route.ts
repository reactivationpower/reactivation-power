import { NextResponse } from 'next/server'
import { ensureDemoSeeded } from '@/lib/demo/seed'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Nightly demo regeneration (see vercel.json). Vercel Cron sends
 * `Authorization: Bearer ${CRON_SECRET}`; anything else is rejected so the
 * route can't be used to churn the demo from outside. Goes through the same
 * lock as the presenter-facing paths, so it can never overlap a rebuild that
 * someone started from the portal.
 */
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  const expected = process.env.CRON_SECRET
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await ensureDemoSeeded({ force: true })
  if (result.status === 'error') {
    console.error('[demo-reset]', result.message)
    return NextResponse.json({ error: result.message }, { status: 500 })
  }
  if (result.status === 'seeded') {
    return NextResponse.json({ ok: true, ...result.summary })
  }
  return NextResponse.json({ ok: true, status: result.status })
}
