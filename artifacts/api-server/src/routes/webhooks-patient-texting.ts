import { Router } from 'express'
import { findOfficeMessagingAccount, unsealCredential } from '../lib/patient-texting/connections'
import { LIVE_PATIENT_TEXTING, validIndependentSignature, validGhlSignature } from '../lib/patient-texting/providers'
import { applyAuthenticatedInbound } from '../lib/patient-texting/live'

const router = Router()
/**
 * Intentional failure, not an acknowledgement. Office credentials being stored
 * does not commission callback authenticity, sender ownership, or consent.
 * Do not accept a patient event (or dispatch anything) until those are verified.
 */
router.post('/patient-texting/webhooks/:provider', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  if (req.params.provider === 'independent') {
    const account = typeof req.body?.AccountSid === 'string' ? await findOfficeMessagingAccount('independent', req.body.AccountSid) : null
    // A trusted canonical URL must be commissioned; never sign a URL supplied by
    // request Host/X-Forwarded-* headers or arbitrary account input.
    const callbackUrl = process.env.PATIENT_TEXT_INDEPENDENT_CALLBACK_URL
    if (account && callbackUrl) {
      const params = req.body as Record<string, string>
      if (Object.values(params).some(v => typeof v !== 'string') || !validIndependentSignature(
        unsealCredential(account.ownerId, 'messaging', account.encrypted), req.get('X-Twilio-Signature') ?? '', callbackUrl, params)) {
        res.status(401).json({ error: 'Invalid callback signature.' }); return
      }
      if (LIVE_PATIENT_TEXTING) {
        // Only inbound messages are supported here; delivery events require a
        // verified sender/message-ID mapping, so remain rejected.
        if (!params.From || !params.Body || !params.MessageSid || params.MessageStatus !== 'received') {
          res.status(422).json({ error: 'Unsupported event; no delivery status was inferred.' }); return
        }
        const digits = params.From.replace(/\D/g, '')
        const phoneKey = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
        res.json(await applyAuthenticatedInbound(account.ownerId, phoneKey, `twilio/${params.MessageSid}`, params.Body)); return
      }
    }
  } else if (req.params.provider === 'ghl') {
    const raw = (req as typeof req & { rawBody?: Buffer }).rawBody
    if (!raw || !validGhlSignature(raw, req.get('X-GHL-Signature') ?? '')) {
      res.status(401).json({ error: 'Invalid callback signature.' }); return
    }
    // GHL contact-to-office mapping/scopes are not commissioned; a valid
    // marketplace signature alone is not office-level authorization.
  } else { res.status(404).json({ error: 'Unknown provider.' }); return }
  res.status(503).json({ ok: false, state: 'disabled', error: 'Patient texting callbacks are not commissioned. No event was accepted.' })
})
export default router
