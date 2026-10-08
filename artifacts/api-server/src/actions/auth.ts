import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { pool } from '@workspace/db'
import { getAdminClient } from '@/lib/supabase/admin'
import { clearSessionCookie, getClientIp, setSessionCookie } from '@/lib/auth/session'
import { accessOwnerId, getParticipantByEmail, getParticipantById } from '@/lib/data/participants'
import { billingBlockForOwner } from '@/lib/billing/dunning'
import { resolveLoginDestination } from '@/lib/auth/login-destination'
import { logEvent } from '@/lib/data/activity'
import { sendEmail } from '@/lib/mail/send'
import {
  authRateLimit, consumeLoginCode, createChallenge, invalidateChallenge,
  pendingChallenge, reserveAuthEmail, savePortalPassword,
} from '@/lib/auth/portal-challenges'
import {
  hashPortalPassword, verifyPortalPassword, MAX_PORTAL_PASSWORD_LENGTH,
  MIN_PORTAL_PASSWORD_LENGTH,
} from '@/lib/auth/portal-password'

const CHALLENGE_COOKIE = 'tp_login_challenge'
export interface LoginState {
  error?: string
  message?: string
  codeSent?: boolean
  email?: string
  attemptsRemaining?: number
  resendAfter?: number
  passwordSet?: boolean
  billing?: { reason: string; status: string; email: string }
}
const emailOf = (form: FormData) => String(form.get('email') ?? '').trim().toLowerCase()
async function challengeToken() { return (await cookies()).get(CHALLENGE_COOKIE)?.value ?? '' }
async function setChallengeCookie(token: string) {
  const h = await headers()
  const secure = h.get('x-forwarded-proto')?.split(',')[0].trim() === 'https' || process.env.NODE_ENV === 'production'
  ;(await cookies()).set(CHALLENGE_COOKIE, token, {
    httpOnly: true, secure, sameSite: secure ? 'none' : 'lax',
    partitioned: secure, path: '/', maxAge: 300,
  })
}
async function passwordAttemptAllowed(email: string) {
  const ip = await getClientIp() ?? 'unknown'
  const [account, address] = await Promise.all([
    authRateLimit('password-account', email, 10, 15 * 60),
    authRateLimit('password-ip', ip, 30, 15 * 60),
  ])
  return account && address
}

/** Password verification does not grant a session. Both roles require a code. */
export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = emailOf(form), password = String(form.get('password') ?? '')
  if (!email || !password) return { error: 'Please enter your email and password.' }
  if (email.length > 254 || password.length > MAX_PORTAL_PASSWORD_LENGTH ||
    !await passwordAttemptAllowed(email)) {
    return { error: 'Too many sign-in attempts. Please try again in 15 minutes.' }
  }
  const participant = await getParticipantByEmail(email)
  const credential = participant ? await pool.query(
    'SELECT password_hash, version FROM portal_auth_credentials WHERE participant_id = $1 AND email = $2',
    [participant.id, email],
  ) : null
  const row = credential?.rows[0]
  const valid = await verifyPortalPassword(password, row?.password_hash ?? null)
  if (!valid || !participant?.is_active) {
    return { error: 'Incorrect email or password. If you have not set a password yet, use “Set up or reset password”.' }
  }
  if (!participant.is_demo) {
    const block = await billingBlockForOwner(accessOwnerId(participant))
    if (block) return { error: 'There is a billing issue on this account, so access is paused.', billing: block }
  }
  if (!await reserveAuthEmail(participant.id)) {
    return { error: 'Please wait at least 60 seconds before requesting another email. You can request up to five emails per hour.' }
  }
  const created = await createChallenge({ id: participant.id, email }, 'login', row.version,
    String(form.get('next') ?? ''))
  const sent = await sendEmail('portal_login_code', email, { code: created.code! })
  if (!sent.ok) {
    await invalidateChallenge(created.token)
    return { error: 'We could not send your sign-in code. Please try again later.' }
  }
  await setChallengeCookie(created.token)
  return { codeSent: true, email, attemptsRemaining: 6, resendAfter: 60 }
}

/** Safe metadata only; the code and challenge secret never appear in page data. */
export async function getPortalLoginState(): Promise<LoginState | null> {
  const row = await pendingChallenge(await challengeToken(), 'login')
  return row ? {
    codeSent: true, email: row.email, attemptsRemaining: 6 - row.attempts,
    resendAfter: 60,
  } : null
}

export async function verifyLoginCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  if (!await authRateLimit('code-ip', await getClientIp() ?? 'unknown', 60, 300)) {
    return { error: 'Too many code attempts. Please wait five minutes and sign in again.' }
  }
  const result = await consumeLoginCode(await challengeToken(), String(form.get('code') ?? '').trim())
  if (!result.ok) {
    if (!result.remaining) {
      ;(await cookies()).delete(CHALLENGE_COOKIE)
      return { error: 'This code expired, was already used, or reached six incorrect attempts. Sign in again to request a new code.' }
    }
    return { codeSent: true, attemptsRemaining: result.remaining,
      error: `Incorrect code. ${result.remaining} attempt${result.remaining === 1 ? '' : 's'} remaining.` }
  }
  ;(await cookies()).delete(CHALLENGE_COOKIE)
  const participant = await getParticipantById(result.challenge.participant_id)
  if (!participant?.is_active || participant.email.toLowerCase() !== result.challenge.email) {
    return { error: 'This account is no longer available. Contact your administrator.' }
  }
  if (!participant.is_demo) {
    const block = await billingBlockForOwner(accessOwnerId(participant))
    if (block) return { error: 'Access is paused for a billing issue.', billing: block }
  }
  const supabase = getAdminClient()
  const ip = await getClientIp()
  const { data: session, error } = await supabase.from('sessions').insert({
    participant_id: participant.id, ip_address: ip,
    user_agent: (await headers()).get('user-agent'),
  }).select('id').single()
  if (error || !session) return { error: 'Could not start your session. Please sign in again.' }
  await setSessionCookie({
    participantId: participant.id, sessionId: session.id, issuedAt: Date.now(),
    credentialVersion: result.challenge.credential_version!,
  })
  await logEvent({
    participantId: participant.id, sessionId: session.id, eventType: 'login',
    ipAddress: ip, metadata: { authentication: 'password_and_email_code' },
  })
  redirect(resolveLoginDestination(result.challenge.next_path))
}

export async function resendLoginCode(): Promise<LoginState> {
  const token = await challengeToken()
  const current = await pendingChallenge(token, 'login')
  if (!current) return { error: 'Your code expired. Sign in again to request a new code.' }
  const participant = await getParticipantById(current.participant_id)
  const credential = await pool.query('SELECT version FROM portal_auth_credentials WHERE participant_id = $1 AND email = $2',
    [current.participant_id, current.email])
  if (!participant?.is_active || participant.email.toLowerCase() !== current.email ||
    credential.rows[0]?.version !== current.credential_version) {
    await invalidateChallenge(token)
    return { error: 'Your sign-in expired. Please sign in again.' }
  }
  if (!await reserveAuthEmail(current.participant_id)) {
    return { codeSent: true, error: 'Please wait at least 60 seconds between emails. Limit: five emails per hour.', resendAfter: 60 }
  }
  const next = await createChallenge({ id: current.participant_id, email: current.email },
    'login', current.credential_version, current.next_path)
  const sent = await sendEmail('portal_login_code', current.email, { code: next.code! })
  if (!sent.ok) {
    await invalidateChallenge(next.token)
    ;(await cookies()).delete(CHALLENGE_COOKIE)
    return { error: 'We could not send a new code. Please sign in again later.' }
  }
  await setChallengeCookie(next.token)
  return { codeSent: true, email: current.email, attemptsRemaining: 6, resendAfter: 60,
    message: 'A new code was sent. Only the newest code will work.' }
}

export async function requestPasswordSetup(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = emailOf(form)
  const message = 'If this email is registered, check your inbox for a password setup link. Wait at least 60 seconds between requests; maximum five emails per hour. Use your own email, not a shared office inbox.'
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Please enter a valid registered email address.' }
  }
  if (!await authRateLimit('setup-ip', await getClientIp() ?? 'unknown', 10, 3600)) {
    return { error: 'Too many requests. Please try again in one hour.' }
  }
  const participant = await getParticipantByEmail(email)
  if (!participant?.is_active || !await reserveAuthEmail(participant.id)) return { message }
  const challenge = await createChallenge({ id: participant.id, email }, 'password', null)
  const sent = await sendEmail('portal_password_setup', email, {
    setupUrl: `https://patientpipeline.app/login?setup=${encodeURIComponent(challenge.token)}`,
  })
  if (!sent.ok) {
    await invalidateChallenge(challenge.token)
    return { error: 'We could not send a password email right now. Please try again later.' }
  }
  return { message }
}

export async function setPortalPassword(_prev: LoginState, form: FormData): Promise<LoginState> {
  const password = String(form.get('password') ?? ''), confirm = String(form.get('confirm') ?? '')
  if (password.length < MIN_PORTAL_PASSWORD_LENGTH || password.length > MAX_PORTAL_PASSWORD_LENGTH) {
    return { error: `Use a password between ${MIN_PORTAL_PASSWORD_LENGTH} and ${MAX_PORTAL_PASSWORD_LENGTH} characters.` }
  }
  if (password !== confirm) return { error: 'Passwords do not match.' }
  if (!await authRateLimit('set-password-ip', await getClientIp() ?? 'unknown', 10, 900)) {
    return { error: 'Too many attempts. Please try again in 15 minutes.' }
  }
  const token = String(form.get('token') ?? '')
  if (!await pendingChallenge(token, 'password')) return { error: 'This link is invalid or expired. Request a new password link.' }
  const saved = await savePortalPassword(token, await hashPortalPassword(password))
  if (!saved) return { error: 'This link is invalid or expired. Request a new password link.' }
  await clearSessionCookie()
  ;(await cookies()).delete(CHALLENGE_COOKIE)
  return { passwordSet: true, message: 'Your password is set. Sign in with your email and password, then enter the code we send you.' }
}

export async function logout() {
  await clearSessionCookie()
  ;(await cookies()).delete(CHALLENGE_COOKIE)
  redirect('/login')
}
