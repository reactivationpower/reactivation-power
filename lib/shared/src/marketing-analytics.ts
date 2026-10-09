/** Versioned, deliberately closed telemetry contract. Never send URLs or form values. */
export const ANALYTICS_VERSION = 1
export const ANALYTICS_DEFAULTS = { attributionDays: 90, sessionMinutes: 30, retentionDays: 180, observationDays: 90 }
export const MARKETING_PAGES = [
  { id: 'home', path: '/', label: 'Main website', funnel: 'website' },
  { id: 'walkthrough', path: '/walkthrough', label: 'Full walkthrough', funnel: 'website' },
  { id: 'healthcare', path: '/healthcare', label: 'Healthcare', funnel: 'website' },
  { id: 'schedule', path: '/schedule-a-call', label: 'Schedule a call', funnel: 'website' },
  { id: 'calendar', path: '/healthcare/book-a-call', label: 'Calendar', funnel: 'website' },
  { id: 'confirmation', path: '/schedule-a-call/confirmation', label: 'Website confirmation', funnel: 'website' },
  { id: 'strategy', path: '/strategy-call', label: 'Strategy call', funnel: 'strategy' },
  { id: 'strategy-schedule', path: '/strategy-call/schedule', label: 'Strategy schedule', funnel: 'strategy' },
  { id: 'strategy-rejected', path: '/strategy-call/providers-only', label: 'Providers only', funnel: 'strategy' },
  { id: 'strategy-confirmation', path: '/healthcare/thank-you', label: 'Strategy confirmation', funnel: 'strategy' },
  { id: 'analytics-test', path: '/analytics-test', label: 'Instrumentation test', funnel: 'test' },
] as const
export const EVENT_TYPES = ['page_view', 'link_internal', 'link_outbound', 'cta', 'form_start', 'form_validation', 'form_attempt',
  'calendar_arrival', 'slot_selected', 'booking_attempt', 'booking_failure', 'video_play', 'video_pause', 'video_seek',
  'video_progress', 'video_complete', 'video_error', 'runtime_error', 'request_error'] as const
export const MARKETING_CONTROLS = ['lead-form','confirm-booking','calendar-slot','external-link','test-cta','audience-provider','audience-patient'] as const
export const WALKTHROUGH_PLACEMENTS = ['walkthrough','walkthrough-page','booking-walkthrough','strategy-walkthrough','video'] as const
export type EventType = typeof EVENT_TYPES[number]
export interface MarketingEvent {
  id: string; version: 1; at: string; page: string; type: EventType
  control?: string; category?: 'validation' | 'network' | 'unavailable' | 'runtime' | 'media'
  video?: 'walkthrough'; placement?: string
  intervals?: [number, number][]; elapsed?: number; position?: number
}
export interface SourceInput { id?: string; name: string; notes: string; active: boolean }
export interface LinkInput { id?: string; sourceId: string; campaign: string; channel: string; page: string; active: boolean }
export interface ReportInput {
  from?: string; to?: string; timezone?: string; source?: string; campaign?: string; channel?: string; page?: string
  funnel?: string; model?: 'first' | 'last'; observationDays?: number; includeExcluded?: boolean
}
export function unionIntervals(intervals: readonly (readonly [number, number])[], duration = 240): [number, number][] {
  const sorted = intervals.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .map(([a, b]) => [Math.max(0, Math.min(duration, a)), Math.max(0, Math.min(duration, b))] as [number, number])
    .filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0])
  const out: [number, number][] = []
  for (const pair of sorted) {
    const last = out.at(-1)
    if (last && pair[0] <= last[1]) last[1] = Math.max(last[1], pair[1])
    else out.push([...pair])
  }
  return out
}
export function contentSeconds(intervals: readonly (readonly [number, number])[]) {
  return unionIntervals(intervals).reduce((n, [a, b]) => n + b - a, 0)
}
export function safeCampaignValue(value: unknown): string | null {
  // Restrict to campaign labels; reject addresses, URLs, phones and token-like long strings.
  return typeof value === 'string' && /^[a-zA-Z][a-zA-Z0-9 _.-]{0,59}$/.test(value) && !/[0-9]{7,}/.test(value) ? value : null
}
export function referringDomain(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 255) return null
  const domain = value.toLowerCase()
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(domain) ? domain : null
}
