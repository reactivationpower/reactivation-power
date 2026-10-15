import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { pool } from '@workspace/db'
import { getAdminClient } from '@/lib/supabase/admin'
import { clearSessionCookie, getClientIp, setSessionCookie } from '@/lib/auth/session'
import { decodeSession, SESSION_COOKIE_NAME } from '@/lib/auth/token'
import { forgetDevice, isRememberedDevice, rememberDevice } from '@/lib/auth/remembered-device'
import type { Participant } from '@workspace/shared/types'
import { accessOwnerId, getParticipantByEmail, getParticipantById } from '@/lib/data/participants'
import { billingBlockForOwner } from '@/lib/billing/dunning'
import { resolveLoginDestination } from '@/lib/auth/login-destination'
import { logEvent } from '@/lib/data/activity'
import { sendEmail } from '@/lib/mail/send'
import {
  authRateLimitWait, consumeLoginCode, createChallenge, invalidateChallenge, loginCodeWait,
  pendingChallenge, recordLoginCodeEmail, reserveLoginCodeEmail, reservePasswordEmail,
  savePortalPassword, type SavedPassword,
} from '@/lib/auth/portal-challenges'
import {
  hashPortalPassword, verifyPortalPassword, waitText, MAX_CODE_ATTEMPTS,
  MAX_PORTAL_PASSWORD_LENGTH, MIN_PORTAL_PASSWORD_LENGTH,
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
const codeWaitError = (wait: number) =>
  `Please wait ${waitText(wait)} before requesting another sign-in code. You can get up to 10 codes per hour.`
async function passwordAttemptWait(email: string) {
  const ip = await getClientIp() ?? 'unknown'
  const waits = await Promise.all([
    authRateLimitWait('password-account', email, 10, 15 * 60),
    authRateLimitWait('password-ip', ip, 30, 15 * 60),
  ])
  return Math.max(...waits)
}

/** Starts a portal session after every account and billing check has passed. */
async function startPortalSession(participant: Participant, credentialVersion: string,
  nextPath: string, emailCode: boolean): Promise<LoginState> {
  const supabase = getAdminClient()
  const ip = await getClientIp()
  const { data: session, error } = await supabase.from('sessions').insert({
    participant_id: participant.id, ip_address: ip,
    user_agent: (await headers()).get('user-agent'),
  }).select('id').single()
  if (error || !session) return { error: 'Could not start your session. Please sign in again.' }
  await setSessionCookie({
    participantId: participant.id, sessionId: session.id, issuedAt: Date.now(), credentialVersion,
  })
  if (emailCode) {
    // A correct code remembers this browser for 48 hours. Failing to remember must not block sign-in.
    await rememberDevice(participant.id, credentialVersion).catch((failure: unknown) => {
      console.error('Could not remember this computer after a correct code', failure)
    })
  }
  await logEvent({
    participantId: participant.id, sessionId: session.id, eventType: 'login', ipAddress: ip,
    metadata: emailCode
      ? { authentication: 'password_and_email_code', emailCode: true }
      : { authentication: 'password_and_remembered_computer', emailCode: false },
  })
  redirect(resolveLoginDestination(nextPath))
}

/**
 * Password verification alone does not grant a session. Both roles need a
 * code, unless this browser entered a correct code for this same person and
 * password in the last 48 hours.
 */
export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = emailOf(form), password = String(form.get('password') ?? '')
  if (!email || !password) return { error: 'Please enter your email and password.' }
  if (email.length > 254 || password.length > MAX_PORTAL_PASSWORD_LENGTH) {
    return { error: 'Please check your email and password.' }
  }
  const attemptWait = await passwordAttemptWait(email)
  if (attemptWait) return { error: `Too many sign-in attempts. Please try again in ${waitText(attemptWait)}.` }
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
  if (await isRememberedDevice(participant.id, row.version)) {
    ;(await cookies()).delete(CHALLENGE_COOKIE)
    return startPortalSession(participant, row.version, String(form.get('next') ?? ''), false)
  }
  const emailWait = await reserveLoginCodeEmail(participant.id)
  if (emailWait) return { error: codeWaitError(emailWait) }
  const created = await createChallenge({ id: participant.id, email }, 'login', row.version,
    String(form.get('next') ?? ''))
  const sent = await sendEmail('portal_login_code', email, { code: created.code! })
  if (!sent.ok) {
    await invalidateChallenge(created.token)
    return { error: 'We could not send your sign-in code. Please try again later.' }
  }
  await setChallengeCookie(created.token)
  return { codeSent: true, email, attemptsRemaining: MAX_CODE_ATTEMPTS,
    resendAfter: await loginCodeWait(participant.id) }
}

/** Safe metadata only; the code and challenge secret never appear in page data. */
export async function getPortalLoginState(): Promise<LoginState | null> {
  const row = await pendingChallenge(await challengeToken(), 'login')
  return row ? {
    codeSent: true, email: row.email, attemptsRemaining: MAX_CODE_ATTEMPTS - row.attempts,
    resendAfter: await loginCodeWait(row.participant_id),
  } : null
}

export async function verifyLoginCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  const ipWait = await authRateLimitWait('code-ip', await getClientIp() ?? 'unknown', 60, 300)
  if (ipWait) return { error: `Too many code attempts. Please wait ${waitText(ipWait)} and sign in again.` }
  const result = await consumeLoginCode(await challengeToken(), String(form.get('code') ?? '').trim())
  if (!result.ok) {
    if (!result.remaining) {
      ;(await cookies()).delete(CHALLENGE_COOKIE)
      return { error: `This code expired, was already used, or reached ${MAX_CODE_ATTEMPTS} incorrect attempts. Sign in again to request a new code.` }
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
  return startPortalSession(participant, result.challenge.credential_version!, result.challenge.next_path, true)
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
  const wait = await reserveLoginCodeEmail(current.participant_id)
  if (wait) {
    return { codeSent: true, email: current.email, attemptsRemaining: MAX_CODE_ATTEMPTS - current.attempts,
      error: codeWaitError(wait), resendAfter: wait }
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
  return { codeSent: true, email: current.email, attemptsRemaining: MAX_CODE_ATTEMPTS,
    resendAfter: await loginCodeWait(current.participant_id),
    message: 'A new code was sent. Only the newest code will work.' }
}

export async function requestPasswordSetup(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = emailOf(form)
  // Same reply whether or not the email is registered or limited, so it never reveals accounts.
  const message = 'If this email is registered, check your inbox for a password setup link. If you don\'t see it, check your spam or junk folder. You can request up to five password emails per hour. Use your own email, not a shared office inbox.'
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Please enter a valid registered email address.' }
  }
  const setupWait = await authRateLimitWait('setup-ip', await getClientIp() ?? 'unknown', 10, 3600)
  if (setupWait) return { error: `Too many requests. Please try again in ${waitText(setupWait)}.` }
  const participant = await getParticipantByEmail(email)
  if (!participant?.is_active || await reservePasswordEmail(participant.id)) return { message }
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
  const setWait = await authRateLimitWait('set-password-ip', await getClientIp() ?? 'unknown', 10, 900)
  if (setWait) return { error: `Too many attempts. Please try again in ${waitText(setWait)}.` }
  const token = String(form.get('token') ?? '')
  if (!await pendingChallenge(token, 'password')) return { error: 'This link is invalid or expired. Request a new password link.' }
  const saved = await savePortalPassword(token, await hashPortalPassword(password))
  if (!saved) return { error: 'This link is invalid or expired. Request a new password link.' }
  await clearSessionCookie()
  const sentCode = await sendFirstLoginCode(saved).catch((error: unknown): LoginState => {
    // The password is already saved; never report it as failed.
    console.error('First sign-in code after password setup failed', error)
    return { passwordSet: true, email: saved.email, message: PASSWORD_SET_MESSAGE }
  })
  if (!sentCode.codeSent) (await cookies()).delete(CHALLENGE_COOKIE)
  return sentCode
}

const PASSWORD_SET_MESSAGE = 'Your password is set. Sign in with your email and password, then enter the code we send you.'
/**
 * Saving a password never grants access: email the first sign-in code right away
 * so the person goes straight to code entry. This first code is always allowed.
 */
async function sendFirstLoginCode(saved: SavedPassword): Promise<LoginState> {
  const fallback: LoginState = { passwordSet: true, email: saved.email, message: PASSWORD_SET_MESSAGE }
  const participant = await getParticipantById(saved.participantId)
  if (!participant?.is_active || participant.email.toLowerCase() !== saved.email) return fallback
  if (!participant.is_demo) {
    const block = await billingBlockForOwner(accessOwnerId(participant))
    if (block) return { ...fallback, message: undefined, error: 'There is a billing issue on this account, so access is paused.', billing: block }
  }
  const created = await createChallenge({ id: saved.participantId, email: saved.email }, 'login', saved.version)
  const sent = await sendEmail('portal_login_code', saved.email, { code: created.code! })
  if (!sent.ok) {
    await invalidateChallenge(created.token)
    return fallback
  }
  await recordLoginCodeEmail(saved.participantId)
  await setChallengeCookie(created.token)
  return { codeSent: true, email: saved.email, attemptsRemaining: MAX_CODE_ATTEMPTS,
    resendAfter: await loginCodeWait(saved.participantId),
    message: 'Your password is set. We emailed you a sign-in code.' }
}

export async function logout() {
  // Only a manual log out forgets this computer; inactivity logout does not.
  const current = decodeSession((await cookies()).get(SESSION_COOKIE_NAME)?.value ?? '')
  if (current) await forgetDevice(current.participantId)
  await clearSessionCookie()
  ;(await cookies()).delete(CHALLENGE_COOKIE)
  redirect('/login')
}
