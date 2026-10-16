'use server'

import { timingSafeEqual } from 'crypto'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  ADMIN_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE,
  encodeAdminSession,
} from '@/lib/auth/admin-token'

const MAX_ATTEMPTS_PER_HOUR = 5

async function clientIp(): Promise<string> {
  const h = await headers()
  const fwd = h.get('x-forwarded-for')
  return (fwd ? fwd.split(',')[0].trim() : h.get('x-real-ip')) || 'unknown'
}

function passwordsMatch(input: string, expected: string): boolean {
  const a = Buffer.from(input)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function adminLogin(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const password = String(formData.get('password') ?? '').trim()
  const next = String(formData.get('next') ?? '') || '/admin'
  if (!password) return { error: 'Please enter the admin password.' }

  const expected = process.env.ADMIN_PASSWORD?.trim()
  if (!expected) {
    return {
      error:
        'Admin password is not configured. Set the ADMIN_PASSWORD environment variable.',
    }
  }

  const supabase = getAdminClient()
  const ip = await clientIp()
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  // Lockout: 5 failed attempts from this IP within the last hour
  const { count } = await supabase
    .from('admin_login_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .eq('success', false)
    .gte('attempted_at', oneHourAgo)

  if ((count ?? 0) >= MAX_ATTEMPTS_PER_HOUR) {
    return {
      error:
        'Too many incorrect attempts. Access is locked for one hour — please try again later.',
    }
  }

  if (!passwordsMatch(password, expected)) {
    await supabase.from('admin_login_attempts').insert({ ip, success: false })
    const remaining = MAX_ATTEMPTS_PER_HOUR - (count ?? 0) - 1
    return {
      error:
        remaining > 0
          ? `Incorrect password. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before lockout.`
          : 'Incorrect password. Access is now locked for one hour.',
    }
  }

  // Successful login clears this IP's failed attempts so the counter resets.
  await supabase.from('admin_login_attempts').insert({ ip, success: true })
  await supabase
    .from('admin_login_attempts')
    .delete()
    .eq('ip', ip)
    .eq('success', false)

  const cookieStore = await cookies()
  const h = await headers()
  const proto = h.get('x-forwarded-proto')
  const secure = proto
    ? proto.split(',')[0].trim() === 'https'
    : process.env.NODE_ENV === 'production'
  cookieStore.set(ADMIN_COOKIE_NAME, encodeAdminSession(), {
    httpOnly: true,
    // The preview runs in a cross-origin iframe: cookies must be
    // SameSite=None + Secure + Partitioned to survive navigation there.
    sameSite: secure ? 'none' : 'lax',
    secure,
    partitioned: secure,
    path: '/',
    maxAge: ADMIN_SESSION_MAX_AGE,
  })

  redirect(next.startsWith('/admin') ? next : '/admin')
}

export async function adminLogout() {
  const cookieStore = await cookies()
  cookieStore.delete(ADMIN_COOKIE_NAME)
  redirect('/admin-login')
}
