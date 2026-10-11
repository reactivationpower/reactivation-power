/** Isolated, read-only GHL adapter. Never follows URLs from payloads or redirects. */
const ORIGIN = 'https://services.leadconnectorhq.com'
export const MAX_AUDIO_BYTES = 32 * 1024 * 1024
export type MediaState = 'missing' | 'permission_unavailable' | 'provider_failure' | 'expired' | 'unavailable' | 'too_large'
export class CallMediaError extends Error {
  constructor(public state: MediaState, public status = 502) { super(state) }
}
export const providerId = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(s)
export async function boundedBytes(response: Response, max: number) {
  const reader = response.body?.getReader()
  if (!reader) throw new CallMediaError('provider_failure')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > max) throw new CallMediaError('too_large', 413)
      chunks.push(part.value)
    }
    return Buffer.concat(chunks, size)
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
export class CallMediaProvider {
  constructor(private transport: typeof fetch = fetch) {}
  get location() {
    const id = process.env.GHL_LOCATION_ID
    if (!providerId(id)) throw new CallMediaError('unavailable', 503)
    return id
  }
  private async request(path: string, signal: AbortSignal) {
    const token = process.env.GHL_API_TOKEN
    if (!token) throw new CallMediaError('permission_unavailable', 503)
    try {
      const r = await this.transport(ORIGIN + path, {
        headers: { Authorization: `Bearer ${token}`, Version: '2021-07-28', 'Accept-Encoding': 'identity' },
        redirect: 'manual', signal,
      })
      if (r.status !== 200) {
        await r.body?.cancel()
        if ([401, 403].includes(r.status)) throw new CallMediaError('permission_unavailable', 403)
        if (r.status === 404) throw new CallMediaError('missing', 404)
        if (r.status === 410) throw new CallMediaError('expired', 410)
        if ([400, 422].includes(r.status)) throw new CallMediaError('unavailable', 424)
        throw new CallMediaError('provider_failure')
      }
      return r
    } catch (e) {
      if (e instanceof CallMediaError) throw e
      throw new CallMediaError('provider_failure')
    }
  }
  private async json(path: string, signal: AbortSignal) {
    const r = await this.request(path, signal)
    try { return JSON.parse((await boundedBytes(r, 1024 * 1024)).toString('utf8')) }
    catch (e) { if (e instanceof CallMediaError) throw e; throw new CallMediaError('provider_failure') }
  }
  async verify(contactId: string, messageId: string, signal: AbortSignal) {
    if (!providerId(contactId) || !providerId(messageId)) return null
    const location = this.location
    const contact = (await this.json(`/contacts/${contactId}`, signal)).contact
    if (contact?.id !== contactId || contact?.locationId !== location) return null
    const payload = await this.json(`/conversations/messages/${messageId}`, signal)
    const m = payload.message ?? payload
    if (m?.id !== messageId || m.contactId !== contactId || m.locationId !== location ||
      !(m.messageType ? ['TYPE_CALL', 'CALL', 'TYPE_CAMPAIGN_CALL', 'TYPE_CUSTOM_CALL', 'TYPE_IVR_CALL'].includes(m.messageType) : m.type === 1)) return null
    return {
      direction: ['inbound', 'outbound'].includes(m.direction) ? m.direction as string : null,
      timestamp: typeof m.dateAdded === 'string' && Number.isFinite(Date.parse(m.dateAdded)) ? new Date(m.dateAdded).toISOString() : null,
      outcome: typeof (m.meta?.callStatus ?? m.status) === 'string' && /^[a-z_-]{1,64}$/i.test(m.meta?.callStatus ?? m.status) ? (m.meta?.callStatus ?? m.status) as string : null,
      durationSeconds: typeof m.meta?.callDuration === 'number' && Number.isFinite(m.meta.callDuration) && m.meta.callDuration >= 0 ? m.meta.callDuration as number : null,
      ghlLink: { level: 'contact' as const, url: `https://app.gohighlevel.com/v2/location/${location}/contacts/detail/${contactId}` },
    }
  }
  async audio(messageId: string, signal: AbortSignal) {
    if (!providerId(messageId)) throw new CallMediaError('unavailable')
    const r = await this.request(`/conversations/messages/${messageId}/locations/${this.location}/recording`, signal)
    const type = r.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
    if (!type || !['audio/wav','audio/x-wav','audio/wave','audio/mpeg','audio/mp3','audio/ogg','audio/mp4','audio/webm'].includes(type)) {
      await r.body?.cancel(); throw new CallMediaError('provider_failure')
    }
    const bytes = await boundedBytes(r, MAX_AUDIO_BYTES)
    if (!bytes.length) throw new CallMediaError('missing', 404)
    return { bytes, type }
  }
  async transcript(messageId: string, signal: AbortSignal) {
    if (!providerId(messageId)) throw new CallMediaError('unavailable')
    const data = await this.json(`/conversations/locations/${this.location}/messages/${messageId}/transcription`, signal)
    const rows = Array.isArray(data) ? data : typeof data?.transcript === 'string' ? [data] : null
    if (!rows) throw new CallMediaError('provider_failure')
    if (!rows.length) throw new CallMediaError('missing', 404)
    if (rows.length > 5000 || rows.some(r => typeof r?.transcript !== 'string')) throw new CallMediaError('provider_failure')
    // Treat transcription as plain text; strip all URLs, not merely recognized signing keys.
    const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null
    return rows.map(r => ({
      text: r.transcript.replace(/https?:\/\/[^\s<>"']+/gi, '[link omitted]'),
      startMs: number(r.startTime), endMs: number(r.endTime), channel: number(r.mediaChannel),
    }))
  }
}
