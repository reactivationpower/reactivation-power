
import { cookies, headers } from 'next/headers'
import { randomUUID } from 'node:crypto'
import { createIdleSession, revokeIdleSession } from '@/lib/auth/idle-session'
import { decodeAdminSession } from '@/lib/auth/admin-token'
import { redirect } from 'next/navigation'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  ADMIN_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE,
  encodeAdminSession,
  type AdminIdentity,
} from '@/lib/auth/admin-token'
import { adminHomeFor, getAdminSession } from '@/lib/auth/admin-session'
import { freshAuthClient, toAdminUser, type AdminUser } from '@/lib/data/admin-users'

const MAX_ATTEMPTS_PER_HOUR = 5
const MIN_PASSWORD_LENGTH = 8

async function clientIp(): Promise<string> {
  const h = await headers()
  const fwd = h.get('x-forwarded-for')
  return (fwd ? fwd.split(',')[0].trim() : h.get('x-real-ip')) || 'unknown'
}

function identityOf(user: AdminUser): AdminIdentity {
  return { userId: user.id, email: user.email, name: user.name, role: user.role, canManageServices: user.canManageServices }
}

async function issueAdminCookie(user: AdminUser): Promise<void> {
  const cookieStore = await cookies()
  const sessionId = randomUUID()
  await createIdleSession(sessionId, 'admin', user.id, Date.now() + ADMIN_SESSION_MAX_AGE * 1000)
  const old = decodeAdminSession(cookieStore.get(ADMIN_COOKIE_NAME)?.value ?? '')
  if (old) await revokeIdleSession(old.sessionId, 'admin')
  const h = await headers()
  const proto = h.get('x-forwarded-proto')
  const secure = proto
    ? proto.split(',')[0].trim() === 'https'
    : process.env.NODE_ENV === 'production'
  cookieStore.set(ADMIN_COOKIE_NAME, encodeAdminSession(identityOf(user), sessionId), {
    httpOnly: true,
    // The preview runs in a cross-origin iframe: cookies must be
    // SameSite=None + Secure + Partitioned to survive navigation there.
    sameSite: secure ? 'none' : 'lax',
    secure,
    partitioned: secure,
    path: '/',
    maxAge: ADMIN_SESSION_MAX_AGE,
  })
}

/** Only follow same-origin /admin paths, and only ones this role may open. */
function landingFor(user: AdminUser, next: string): string {
  if (user.role.startsWith('reseller_')) return adminHomeFor(user.role)
  if (!/^\/admin(\/|\?|$)/.test(next)) return adminHomeFor(user.role)
  const permitted = /^\/admin\/payments(\/|\?|$)/.test(next) ||
    (user.canManageServices && /^\/admin\/participants(\/|\?|$)/.test(next))
  if (user.role !== 'super_admin' && !permitted) {
    return adminHomeFor(user.role)
  }
  return next
}

export async function adminLogin(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const next = String(formData.get('next') ?? '') || '/admin'
  if (!email || !password) return { error: 'Please enter your email and password.' }

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

  const { data, error } = await freshAuthClient().auth.signInWithPassword({ email, password })
  const user = data?.user ? toAdminUser(data.user) : null

  if (error || !user || !user.active) {
    await supabase.from('admin_login_attempts').insert({ ip, success: false })
    const remaining = MAX_ATTEMPTS_PER_HOUR - (count ?? 0) - 1
    if (error?.code === 'user_banned' || (user && !user.active)) {
      return { error: 'This admin account has been deactivated.' }
    }
    if (data?.user && !user) {
      return { error: 'This account does not have admin access.' }
    }
    return {
      error:
        remaining > 0
          ? `Incorrect email or password. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before lockout.`
          : 'Incorrect email or password. Access is now locked for one hour.',
    }
  }

  // Successful login clears this IP's failed attempts so the counter resets.
  await supabase.from('admin_login_attempts').insert({ ip, success: true })
  await supabase
    .from('admin_login_attempts')
    .delete()
    .eq('ip', ip)
    .eq('success', false)

  await issueAdminCookie(user)
  redirect(landingFor(user, next))
}

/**
 * Finish an invite (or password reset): verify the one-time token, set the
 * chosen password and sign the user in. Accepts either the token hash from
 * our own invite links or the access token Supabase puts in the URL hash
 * after its default invite email.
 */
export async function completeAdminInvite(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const password = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')
  const tokenHash = String(formData.get('token_hash') ?? '').trim()
  const tokenType = String(formData.get('type') ?? '').trim()
  const accessToken = String(formData.get('access_token') ?? '').trim()

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }
  }
  if (password !== confirm) return { error: 'Passwords do not match.' }

  const verifier = freshAuthClient()
  let userId: string | null = null
  if (tokenHash) {
    const type = tokenType === 'invite' || tokenType === 'recovery' || tokenType === 'email'
      ? tokenType
      : 'magiclink'
    const { data, error } = await verifier.auth.verifyOtp({ token_hash: tokenHash, type })
    if (error || !data.user) {
      return { error: 'This invite link is invalid or has expired. Ask an admin to send a new one.' }
    }
    userId = data.user.id
  } else if (accessToken) {
    const { data, error } = await verifier.auth.getUser(accessToken)
    if (error || !data.user) {
      return { error: 'This invite link is invalid or has expired. Ask an admin to send a new one.' }
    }
    userId = data.user.id
  } else {
    return { error: 'Missing invite token. Open the link from your invitation email.' }
  }

  const supabase = getAdminClient()
  const { data: updated, error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
  })
  if (updateError || !updated.user) {
    return { error: `Could not set your password: ${updateError?.message ?? 'unknown error'}` }
  }
  const user = toAdminUser(updated.user)
  if (!user) return { error: 'This account does not have admin access.' }
  if (!user.active) return { error: 'This admin account has been deactivated.' }

  await issueAdminCookie(user)
  redirect(adminHomeFor(user.role))
}

/** The signed-in admin, for the SPA header/sidebar. */
export async function getCurrentAdmin(): Promise<AdminIdentity | null> {
  const session = await getAdminSession()
  if (!session) return null
  return { userId: session.userId, email: session.email, name: session.name, role: session.role, canManageServices: session.canManageServices }
}

export async function adminLogout() {
  const cookieStore = await cookies()
  const old = decodeAdminSession(cookieStore.get(ADMIN_COOKIE_NAME)?.value ?? '')
  if (old) await revokeIdleSession(old.sessionId, 'admin')
  cookieStore.delete(ADMIN_COOKIE_NAME)
  redirect('/admin-login')
}
