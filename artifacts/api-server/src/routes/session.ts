import { Router } from 'express'
import { decodeSession, SESSION_COOKIE_NAME } from '@/lib/auth/token'
import { decodeAdminSession, ADMIN_COOKIE_NAME } from '@/lib/auth/admin-token'
import { readIdleSession, revokeIdleSession, type SessionKind } from '@/lib/auth/idle-session'
import { portalCredentialIsCurrent } from '@/lib/auth/session'
import { readDemoSession } from '@/lib/auth/demo-session'

const router = Router()
router.all('/session/:kind', async (req, res): Promise<void> => {
  res.setHeader('Cache-Control', 'no-store')
  const kind = req.params.kind as SessionKind
  if (!['portal', 'admin'].includes(kind) || !['GET', 'POST', 'DELETE'].includes(req.method)) {
    res.sendStatus(404); return
  }
  const name = kind === 'portal' ? SESSION_COOKIE_NAME : ADMIN_COOKIE_NAME
  const payload = kind === 'portal'
    ? decodeSession(req.cookies?.[name] ?? '')
    : decodeAdminSession(req.cookies?.[name] ?? '')
  const subject = payload && ('participantId' in payload ? payload.participantId : payload.userId)
  // A delayed tab must not log out or update a newly logged-in session.
  const expected = req.get('X-Session-Id')
  if (req.method === 'DELETE' && !expected) {
    res.status(400).json({ error: 'Missing session id' }); return
  }
  if (!payload || !subject || (expected && expected !== payload.sessionId)) {
    res.status(401).json({ error: 'Session expired' }); return
  }
  if ('participantId' in payload && !await portalCredentialIsCurrent(payload)) {
    res.status(401).json({ error: 'Session expired' }); return
  }
  if (req.method === 'DELETE') {
    await revokeIdleSession(payload.sessionId, kind)
    const secure = req.get('x-forwarded-proto')?.split(',')[0].trim() === 'https' || req.secure
    res.clearCookie(name, { path: '/', secure, sameSite: secure ? 'none' : 'lax', partitioned: secure })
    res.json({ ok: true }); return
  }
  const age = req.body?.interactionAgeMs
  if (req.method === 'POST' && (!expected || !Number.isFinite(age) || age < 0 || age >= 300000)) {
    res.status(400).json({ error: 'Invalid activity' }); return
  }
  const state = ('participantId' in payload && !payload.credentialVersion ? await readDemoSession(payload) : null)
    ?? await readIdleSession(payload.sessionId, kind, subject, req.method === 'POST' ? age : undefined)
  if (!state) {
    res.status(401).json({ error: 'Session expired' }); return
  }
  res.json(state)
})
export default router
