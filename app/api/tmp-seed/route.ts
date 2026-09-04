// TEMPORARY dev-only trigger for verifying the demo seeder. Deleted after use.
import { NextResponse } from 'next/server'
import { seedDemoData } from '@/lib/demo/seed'
import { getAdminClient } from '@/lib/supabase/admin'
import { setSessionCookie } from '@/lib/auth/session'
import { DEMO_OWNER, demoEmail } from '@/lib/demo/config'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'disabled' }, { status: 404 })
  }
  const url = new URL(req.url)
  if (url.searchParams.get('login') === '1') {
    const supabase = getAdminClient()
    const { data: owner } = await supabase
      .from('participants')
      .select('id')
      .eq('email', demoEmail(DEMO_OWNER.email))
      .single()
    const { data: session } = await supabase
      .from('sessions')
      .insert({ participant_id: owner!.id })
      .select('id')
      .single()
    await setSessionCookie({
      participantId: owner!.id,
      sessionId: session!.id,
      issuedAt: Date.now(),
    })
    return new NextResponse(null, {
      status: 302,
      headers: { Location: '/portal' },
    })
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
