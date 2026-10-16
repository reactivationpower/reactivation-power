import { z } from 'zod'
import { EVENT_TYPES, MARKETING_PAGES, safeCampaignValue, referringDomain } from '@workspace/shared/marketing-analytics'
const identifier = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/)
export const eventSchema = z.object({
  id: z.string().uuid(), version: z.literal(1), at: z.string().datetime({ offset: true }),
  page: identifier, type: z.enum(EVENT_TYPES),
  control: identifier.optional(),
  category: z.enum(['validation', 'network', 'unavailable', 'runtime', 'media']).optional(),
  video: z.literal('walkthrough').optional(), placement: identifier.optional(),
  intervals: z.array(z.tuple([z.number().min(0).max(240), z.number().min(0).max(240)]))
    .max(20).refine(xs => xs.every(([a,b]) => b > a && b-a <= 10)).optional(),
  elapsed: z.number().min(0).max(30).optional(), position: z.number().min(0).max(240).optional(),
}).strict().superRefine((e, ctx) => {
  if (e.type.startsWith('video_') && (!e.video || !e.placement)) ctx.addIssue({ code: 'custom', message: 'Video context required' })
  if (!e.type.startsWith('video_') && [e.video,e.placement,e.intervals,e.elapsed,e.position].some(x => x !== undefined))
    ctx.addIssue({ code: 'custom', message: 'Video properties on non-video event' })
})
export const batchSchema = z.object({ sessionId: z.string().uuid(), events: z.array(eventSchema).min(1).max(40) }).strict()
export const contextSchema = z.object({
  page: identifier, source: z.string().regex(/^[A-Za-z0-9_-]{16}$/).optional(),
  entry:z.boolean().optional(),
  utm: z.record(z.string(), z.string().max(60)).optional(), referrer: z.string().max(255).optional(),
  device: z.enum(['desktop','mobile','tablet','unknown']).default('unknown'),
}).strict()
export function cleanContext(input: z.infer<typeof contextSchema>) {
  const utm: Record<string,string> = {}
  for (const key of ['utm_source','utm_medium','utm_campaign','utm_term','utm_content']) {
    const value = safeCampaignValue(input.utm?.[key])
    if (value) utm[key] = value
  }
  return { utm, referrer: referringDomain(input.referrer) }
}
export function approvedPath(path: string) {
  return /^\/(?:[a-z0-9-]+\/?)*$/.test(path) && !path.startsWith('/api') && !path.startsWith('/admin') && !path.startsWith('/portal')
}
export const registeredDefaults = MARKETING_PAGES
