import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { pool } from '@workspace/db'
import { authDigest, hashPortalPassword } from '@/lib/auth/portal-password'
import { consumeLoginCode, createChallenge, pendingChallenge, reserveAuthEmail } from '@/lib/auth/portal-challenges'
import { decodeSession } from '@/lib/auth/token'
import { getSessionFromRequest } from '@/lib/auth/session'
import type { Request } from 'express'

const mail = vi.hoisted(() => ({ send: vi.fn(async () => ({ ok: true, logId: 'fake-log' })) }))
vi.mock('@/lib/mail/send', () => ({ sendEmail: mail.send }))
const { default: app } = await import('@/app')
process.env.SESSION_SECRET ||= 'portal-login-test-secret'
const subjects: string[] = [], limitKeys = new Set<string>()
const password = 'correct disposable password'
let server: Server | undefined, base = '', ip = ''
const rememberLimit = (scope: string, value: string) => limitKeys.add(authDigest(`${scope}:${value}`))
beforeAll(async () => {
  if (!process.env.SUPABASE_DB_URL) return
  pool.options.max = 1
  server = app.listen(0)
  await new Promise<void>(resolve => server!.on('listening', resolve))
  const address = server.address()
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/api/actions/auth/`
})
beforeEach(() => {
  mail.send.mockClear().mockResolvedValue({ ok: true, logId: 'fake-log' })
  ip = `test-${randomUUID()}`
  for (const scope of ['password-ip', 'code-ip', 'setup-ip', 'set-password-ip']) rememberLimit(scope, ip)
})
afterAll(async () => {
  await new Promise<void>(resolve => server ? server.close(() => resolve()) : resolve())
  if (subjects.length) {
    await pool.query('DELETE FROM auth_idle_sessions WHERE subject_id = ANY($1::text[])', [subjects])
    await pool.query('DELETE FROM portal_auth_challenges WHERE participant_id = ANY($1::uuid[])', [subjects])
    await pool.query('DELETE FROM portal_auth_credentials WHERE participant_id = ANY($1::uuid[])', [subjects])
    await pool.query('DELETE FROM participants WHERE id = ANY($1::uuid[])', [subjects])
  }
  if (limitKeys.size) await pool.query('DELETE FROM portal_auth_limits WHERE key = ANY($1::text[])', [[...limitKeys]])
  await pool.end()
})
async function subject(role: 'owner' | 'staff' = 'owner', withPassword = true) {
  const id = randomUUID(), email = `mfa-${id}@example.invalid`
  subjects.push(id)
  await pool.query(`INSERT INTO participants (id, email, first_name, last_name, role, is_active, is_demo)
    VALUES ($1, $2, 'MFA', 'Test', $3, true, true)`, [id, email, role])
  const version = randomUUID()
  if (withPassword) await pool.query(`INSERT INTO portal_auth_credentials (participant_id, email, password_hash, version)
    VALUES ($1, $2, $3, $4)`, [id, email, await hashPortalPassword(password), version])
  rememberLimit('password-account', email)
  rememberLimit('email-minute', id); rememberLimit('email-hour', id)
  return { id, email, version }
}
function cookieOf(res: Response, name: string) {
  return res.headers.getSetCookie().find(c => c.startsWith(name + '='))?.split(';')[0] ?? ''
}
async function invoke(fn: string, values: Record<string, string> = {}, cookie = '') {
  const response = await fetch(base + fn, {
    method: 'POST', headers: { cookie, 'content-type': 'application/json', 'x-real-ip': ip },
    body: JSON.stringify({ args: fn === 'resendLoginCode' ? [] : [{}, { __formData: Object.entries(values) }] }),
  })
  const json = await response.json() as { result: Record<string, any>; redirect?: string; ok: boolean }
  return { response, ...json }
}
async function begin(person: { email: string }) {
  const result = await invoke('login', { email: person.email, password })
  expect(result.result.codeSent).toBe(true)
  expect(cookieOf(result.response, 'tp_session')).toBe('')
  const cookie = cookieOf(result.response, 'tp_login_challenge')
  const code = (mail.send.mock.calls.at(-1) as unknown as [string, string, { code: string }])[2].code
  expect(code).toMatch(/^\d{6}$/)
  return { cookie, code }
}
const wrong = (code: string) => code === '000000' ? '000001' : '000000'

// These exercise multiple real database/HTTP round trips, including twelve
// serial guesses in one case. Allow network latency under parallel validation.
describe.skipIf(!process.env.SUPABASE_DB_URL)('owner and caller password plus email-code sign-in', { timeout: 30_000 }, () => {
  it.each(['owner', 'staff'] as const)('requires both factors for %s and rejects reused codes after logout', async role => {
    const person = await subject(role), auth = await begin(person)
    const verified = await invoke('verifyLoginCode', { code: auth.code }, auth.cookie)
    expect(verified.redirect).toBeTruthy()
    const cookie = cookieOf(verified.response, 'tp_session')
    expect(cookie).toBeTruthy()
    expect(await getSessionFromRequest({ cookies: { tp_session: cookie.split('=')[1] } } as unknown as Request)).not.toBeNull()
    await invoke('logout', {}, cookie)
    expect(await getSessionFromRequest({ cookies: { tp_session: cookie.split('=')[1] } } as unknown as Request)).toBeNull()
    const replay = await invoke('verifyLoginCode', { code: auth.code }, auth.cookie)
    expect(replay.result.error).toBeTruthy()
    expect(cookieOf(replay.response, 'tp_session')).toBe('')
  })
  it('never sends a code for a wrong password or creates a session from the old name-only login', async () => {
    const person = await subject()
    expect((await invoke('login', { email: person.email, password: 'wrong' })).result.error).toBeTruthy()
    expect((await invoke('login', { email: person.email, firstName: 'MFA', lastName: 'Test' })).result.error).toBeTruthy()
    expect(mail.send).not.toHaveBeenCalled()
  })
  it('allows a correct sixth attempt, but six incorrect guesses invalidate the challenge', async () => {
    const one = await subject(), first = await begin(one)
    for (let i = 0; i < 5; i++) {
      const result = await invoke('verifyLoginCode', { code: wrong(first.code) }, first.cookie)
      expect(result.result.attemptsRemaining).toBe(5 - i)
    }
    expect((await invoke('verifyLoginCode', { code: first.code }, first.cookie)).redirect).toBeTruthy()
    const two = await subject(), second = await begin(two)
    for (let i = 0; i < 6; i++) await invoke('verifyLoginCode', { code: wrong(second.code) }, second.cookie)
    const denied = await invoke('verifyLoginCode', { code: second.code }, second.cookie)
    expect(denied.result.error).toContain('six incorrect attempts')
    expect(cookieOf(denied.response, 'tp_session')).toBe('')
  })
  it('rejects the exact five-minute expiry, including the correct code', async () => {
    const person = await subject(), auth = await begin(person)
    await pool.query('UPDATE portal_auth_challenges SET expires_at = statement_timestamp() WHERE id = $1',
      [authDigest(auth.cookie.split('=')[1])])
    expect((await invoke('verifyLoginCode', { code: auth.code }, auth.cookie)).result.error).toBeTruthy()
  })
  it('requires a new password-and-code login after five-minute inactivity', async () => {
    const person = await subject(), auth = await begin(person)
    const verified = await invoke('verifyLoginCode', { code: auth.code }, auth.cookie)
    const signed = cookieOf(verified.response, 'tp_session').split('=')[1]
    const payload = decodeSession(signed)!
    await pool.query(`UPDATE auth_idle_sessions SET last_interaction_at = statement_timestamp() - interval '5 minutes'
      WHERE id = $1`, [payload.sessionId])
    expect(await getSessionFromRequest({ cookies: { tp_session: signed } } as unknown as Request)).toBeNull()
    expect((await invoke('verifyLoginCode', { code: auth.code }, auth.cookie)).result.error).toBeTruthy()
    await pool.query(`UPDATE portal_auth_limits SET window_start = statement_timestamp() - interval '61 seconds'
      WHERE key = $1`, [authDigest(`email-minute:${person.id}`)])
    const fresh = await begin(person)
    expect(fresh.cookie).not.toBe(auth.cookie)
    expect((await invoke('verifyLoginCode', { code: fresh.code }, fresh.cookie)).redirect).toBeTruthy()
  })
  it('enforces resend cooldown and only the newest code remains usable', async () => {
    const person = await subject(), old = await begin(person)
    expect((await invoke('resendLoginCode', {}, old.cookie)).result.error).toContain('60 seconds')
    expect(mail.send).toHaveBeenCalledTimes(1)
    await pool.query(`UPDATE portal_auth_limits SET window_start = statement_timestamp() - interval '61 seconds'
      WHERE key = $1`, [authDigest(`email-minute:${person.id}`)])
    const next = await invoke('resendLoginCode', {}, old.cookie)
    expect(next.result.codeSent).toBe(true)
    expect(await pendingChallenge(old.cookie.split('=')[1], 'login')).toBeNull()
    const cookie = cookieOf(next.response, 'tp_login_challenge')
    const code = (mail.send.mock.calls.at(-1) as unknown as [string, string, { code: string }])[2].code
    expect((await invoke('verifyLoginCode', { code }, cookie)).redirect).toBeTruthy()
  })
  it('caps authentication emails at five per hour even after each one-minute cooldown', async () => {
    const person = await subject()
    for (let i = 0; i < 5; i++) {
      expect(await reserveAuthEmail(person.id)).toBe(true)
      await pool.query(`UPDATE portal_auth_limits SET window_start = statement_timestamp() - interval '61 seconds'
        WHERE key = $1`, [authDigest(`email-minute:${person.id}`)])
    }
    expect(await reserveAuthEmail(person.id)).toBe(false)
  })
  it('securely enrolls existing users, consumes reset links once, and requires both factors afterwards', async () => {
    const person = await subject('owner', false)
    expect((await invoke('login', { email: person.email, password })).result.error).toBeTruthy()
    const requested = await invoke('requestPasswordSetup', { email: person.email })
    expect(requested.result.message).toContain('If this email is registered')
    const call = mail.send.mock.calls.at(-1) as unknown as [string, string, { setupUrl: string }]
    const link = new URL(call[2].setupUrl)
    expect(link.origin).toBe('https://patientpipeline.app')
    const token = link.searchParams.get('setup')!
    expect((await invoke('setPortalPassword', { token, password, confirm: password })).result.passwordSet).toBe(true)
    expect((await invoke('setPortalPassword', { token, password, confirm: password })).result.error).toBeTruthy()
    await pool.query(`UPDATE portal_auth_limits SET window_start = statement_timestamp() - interval '61 seconds'
      WHERE key = $1`, [authDigest(`email-minute:${person.id}`)])
    const auth = await begin(person)
    expect((await invoke('verifyLoginCode', { code: auth.code }, auth.cookie)).redirect).toBeTruthy()
  })
  it('password reset retires sessions and pending codes even if an old cookie is replayed', async () => {
    const person = await subject()
    const auth = await begin(person)
    const verified = await invoke('verifyLoginCode', { code: auth.code }, auth.cookie)
    const signed = cookieOf(verified.response, 'tp_session').split('=')[1]
    const before = decodeSession(signed)!
    const setup = await createChallenge(person, 'password', null)
    expect((await invoke('setPortalPassword', { token: setup.token, password: password + 'new', confirm: password + 'new' })).result.passwordSet).toBe(true)
    expect(await getSessionFromRequest({ cookies: { tp_session: signed } } as unknown as Request)).toBeNull()
    // Even a session issued by an in-flight old login after reset is denied by the password revision.
    await pool.query('UPDATE auth_idle_sessions SET revoked_at = NULL WHERE id = $1', [before.sessionId])
    expect(await getSessionFromRequest({ cookies: { tp_session: signed } } as unknown as Request)).toBeNull()
  })
  it('concurrent correct submissions consume a code only once', async () => {
    const person = await subject()
    const challenge = await createChallenge(person, 'login', person.version)
    const results = await Promise.all([
      consumeLoginCode(challenge.token, challenge.code!), consumeLoginCode(challenge.token, challenge.code!),
    ])
    expect(results.filter(r => r.ok)).toHaveLength(1)
  })
  it('fails explicitly when email delivery fails, without issuing an authentication cookie', async () => {
    const person = await subject()
    mail.send.mockResolvedValueOnce({ ok: false, logId: 'fake-log' })
    const result = await invoke('login', { email: person.email, password })
    expect(result.result.error).toContain('could not send')
    expect(cookieOf(result.response, 'tp_login_challenge')).toBe('')
    expect(cookieOf(result.response, 'tp_session')).toBe('')
  })
})
