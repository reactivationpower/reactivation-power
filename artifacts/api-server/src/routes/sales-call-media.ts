import { Router, type IRouter } from 'express'
import { pool } from '@workspace/db'
import { getAdminSessionFromRequest } from '@/lib/auth/admin-session'
import { CallMediaProvider, CallMediaError, providerId } from '@/lib/sales-call-media/provider'

const explanations = {
  missing: 'GoHighLevel did not return this media. It may not have been created.',
  permission_unavailable: 'GoHighLevel media permission or integration authorization is unavailable.',
  provider_failure: 'GoHighLevel could not safely return this media. Try again later.',
  expired: 'GoHighLevel reports that this media has expired.',
  unavailable: 'GoHighLevel rejected this media request; availability is not confirmed.',
  too_large: 'This recording exceeds the portal playback limit. Open the contact in GoHighLevel.',
}
export function audioRange(value: string | undefined, size: number) {
  if (!value) return { start: 0, end: size - 1 }
  const m = /^bytes=(\d*)-(\d*)$/.exec(value)
  if (!m || (!m[1] && !m[2])) return null
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]))
  const end = m[1] ? (m[2] ? Math.min(Number(m[2]), size - 1) : size - 1) : size - 1
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && start <= end && start < size ? { start, end } : null
}
export function createCallMediaRouter(deps = {
  session: getAdminSessionFromRequest,
  query: (sql: string, values: unknown[]) => pool.query(sql, values),
  provider: new CallMediaProvider(),
}) {
  const router: IRouter = Router()
  let active = 0
  const recent = new Map<string, { count: number; until: number }>()
  router.get('/sales/leads/:leadId/calls/:activityId/:resource', async (req, res) => {
    res.set({ 'Cache-Control': 'private, no-store', 'Pragma': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin', 'Vary': 'Cookie' })
    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), 30000)
    const close = () => abort.abort()
    res.once('close', close)
    let admitted = false
    try {
      if (req.get('sec-fetch-site') === 'cross-site') { res.status(403).json({ state: 'forbidden' }); return }
      const admin = await deps.session(req)
      if (!admin) { res.status(401).json({ state: 'unauthorized' }); return }
      const { leadId, activityId, resource } = req.params
      if (!providerId(leadId) || !providerId(activityId) || !['details','recording','transcript'].includes(String(resource)) || Object.keys(req.query).length) {
        res.status(400).json({ state: 'invalid_request' }); return
      }
      const now = Date.now()
      for (const [key, value] of recent) if (value.until < now) recent.delete(key)
      const quota = recent.get(admin.userId) ?? { count: 0, until: now + 60000 }
      recent.set(admin.userId, quota)
      if (++quota.count > 60 || active >= 4) { res.status(429).set('Retry-After','60').json({ state: 'rate_limited' }); return }
      active++; admitted = true
      // Single short query; no connection held during remote reads. Never trust client provider IDs.
      const row = (await deps.query(`SELECT l.ghl_contact_id,a.provider_id
        FROM sales_leads l JOIN sales_activities a ON a.lead_id=l.id
        WHERE l.id=$1 AND a.id=$2 AND a.kind='provider_call'
        AND l.assignee_id IS NOT NULL AND ($3 OR l.assignee_id=$4)`,
      [leadId, activityId, admin.role === 'super_admin', admin.userId])).rows[0]
      const notFound = () => { res.status(404).json({ state: 'not_found', explanation: 'Call not available.' }) }
      if (!row || !providerId(row.ghl_contact_id) || !providerId(row.provider_id)) { notFound(); return }
      let metadata
      try { metadata = await deps.provider.verify(row.ghl_contact_id, row.provider_id, abort.signal) }
      catch (e) { if (e instanceof CallMediaError && e.state === 'missing') { notFound(); return }; throw e }
      if (!metadata) { notFound(); return }
      const root = `/api/sales/leads/${leadId}/calls/${activityId}`
      if (resource === 'details') {
        res.json({ ...metadata, recording: { state: 'not_checked', playbackUrl: `${root}/recording` },
          transcript: { state: 'not_checked', url: `${root}/transcript` } }); return
      }
      if (resource === 'transcript') {
        res.json({ state: 'available', segments: await deps.provider.transcript(row.provider_id, abort.signal) }); return
      }
      // GHL documents full WAV, not Range semantics. Bounded ephemeral buffering lets
      // Safari's 0-1 probe and seeking work even when GHL ignores Range.
      const { bytes, type } = await deps.provider.audio(row.provider_id, abort.signal)
      const range = req.get('if-range') ? undefined : req.get('range')
      const slice = audioRange(range, bytes.length)
      if (!slice) { res.status(416).set('Content-Range', `bytes */${bytes.length}`).end(); return }
      res.set({ 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': String(slice.end - slice.start + 1) })
      if (range) res.status(206).set('Content-Range', `bytes ${slice.start}-${slice.end}/${bytes.length}`)
      res.end(req.method === 'HEAD' ? undefined : bytes.subarray(slice.start, slice.end + 1))
    } catch (e) {
      // No raw provider errors/headers/URLs can reach global logging or responses.
      const error = e instanceof CallMediaError ? e : new CallMediaError('provider_failure')
      if (!res.headersSent) res.status(error.status).json({ state: error.state, explanation: explanations[error.state] })
      else res.end()
    } finally {
      if (admitted) active--
      clearTimeout(timer); res.off('close', close)
    }
  })
  return router
}
export default createCallMediaRouter()
