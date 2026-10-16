import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Request } from 'express'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { scheduledJobsBlockedReason } from '@/lib/deployment-safety'
import { dueKeyFor } from '@/lib/cron/slots'
import { appOrigin } from '@/lib/app-origin'

/**
 * Vercel scheduling: the jobs switch, the scheduled routes existing, the
 * daily calls landing on their America/New_York hour across DST, and Vercel
 * links/IPs. Budgets and the exact schedule are covered in budget.test.ts.
 */

const vercelJson = JSON.parse(readFileSync(fileURLToPath(new URL('../../../../../../vercel.json', import.meta.url)), 'utf8')) as {
  crons: { path: string; schedule: string }[]
}

describe('scheduled jobs switch', () => {
  it('runs on Replit, never on Preview, and on Vercel production only with SCHEDULED_JOBS=on', () => {
    expect(scheduledJobsBlockedReason({})).toBeNull()
    expect(scheduledJobsBlockedReason({ VERCEL: '1', VERCEL_ENV: 'preview', SCHEDULED_JOBS: 'on' })).toMatch(/Preview/)
    expect(scheduledJobsBlockedReason({ VERCEL: '1', VERCEL_ENV: 'production' })).toMatch(/until switch-over/)
    expect(scheduledJobsBlockedReason({ VERCEL: '1', VERCEL_ENV: 'production', SCHEDULED_JOBS: 'off' })).toMatch(/until switch-over/)
    expect(scheduledJobsBlockedReason({ VERCEL: '1', VERCEL_ENV: 'production', SCHEDULED_JOBS: ' On ' })).toBeNull()
  })
})

describe('vercel.json cron list', () => {
  const routes = readFileSync(fileURLToPath(new URL('../../../routes/cron.ts', import.meta.url)), 'utf8')
  const hoursOf = (path: string) => {
    const entry = vercelJson.crons.find((c) => c.path === path)
    expect(entry, path).toBeDefined()
    const [minute, hours] = entry!.schedule.split(' ')
    expect(minute).toBe('0')
    return hours!.split(',').map(Number)
  }

  it('only calls routes that exist', () => {
    for (const { path } of vercelJson.crons) {
      expect(path.startsWith('/api/cron/')).toBe(true)
      expect(routes).toContain(`"${path.replace('/api', '')}"`)
    }
  })

  it.each([
    ['/api/cron/demo-reset', 3],
    ['/api/cron/auth-cleanup', 4],
    ['/api/cron/billing-retry', 6],
  ])('%s fires at its ET hour in both summer and winter', (path, hourEt) => {
    const hours = hoursOf(path)
    for (const day of ['2026-07-15', '2026-01-15', '2026-03-09', '2026-11-02']) {
      // The UTC call that lands on the slot hour itself (not an hour early) claims that day's slot.
      const onTime = hours.filter((h) => {
        const at = new Date(`${day}T${String(h).padStart(2, '0')}:00:00Z`)
        const etHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(at))
        return etHour === hourEt && dueKeyFor(hourEt, at) === day
      })
      expect(onTime, `${path} on ${day}`).toHaveLength(1)
    }
  })

  it('has a safe hourly scheduler check', () => {
    expect(vercelJson.crons.find((c) => c.path === '/api/cron/heartbeat')?.schedule).toMatch(/^\d+ \* \* \* \*$/)
  })
})

describe('links and client IPs on Vercel', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('never puts a temporary Vercel address into email links', () => {
    expect(appOrigin({ VERCEL: '1', VERCEL_ENV: 'production', APP_URL: 'https://reactivation-power.vercel.app' })).toBe('https://patientpipeline.app')
    expect(appOrigin({ VERCEL: '1', VERCEL_ENV: 'production', APP_URL: 'https://www.patientpipeline.app/' })).toBe('https://www.patientpipeline.app')
    expect(appOrigin({ VERCEL: '1', VERCEL_ENV: 'preview' })).toBe('https://patientpipeline.app')
    // Replit keeps using APP_URL as given.
    expect(appOrigin({ APP_URL: 'https://example.replit.dev/' })).toBe('https://example.replit.dev')
  })

  it('uses the client address Vercel provides instead of its own proxy address', async () => {
    const { trustedAffiliateIp } = await import('@/lib/affiliates/access')
    const req = (headers: Record<string, string>, peer = '10.0.0.5') =>
      ({ socket: { remoteAddress: peer }, header: (n: string) => headers[n.toLowerCase()] }) as unknown as Request
    vi.stubEnv('VERCEL', '1')
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(trustedAffiliateIp(req({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '203.0.113.7' }))).toBe('203.0.113.7')
    expect(trustedAffiliateIp(req({ 'x-forwarded-for': '198.51.100.2, 10.0.0.1' }))).toBe('198.51.100.2')
    expect(trustedAffiliateIp(req({}))).toBeNull()
    vi.stubEnv('VERCEL', '')
    // Off Vercel the socket peer stays authoritative; a spoofed header is ignored.
    expect(trustedAffiliateIp(req({ 'x-real-ip': '203.0.113.7' }))).toBe('10.0.0.5')
  })
})
