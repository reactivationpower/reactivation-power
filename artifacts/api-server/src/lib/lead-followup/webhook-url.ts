import { appOrigin } from '@/lib/app-origin'

/** The public intake URL for a campaign token, as shown on the Lead sources tab. */
export const leadWebhookUrl = (token: string) => `${appOrigin()}/api/webhooks/leads/${token}`
