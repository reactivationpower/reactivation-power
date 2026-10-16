import { describe, expect, it } from 'vitest'
import { RunBudget, VERCEL_FUNCTION_MAX_SECONDS, CRON_RUN_BUDGET_MS, cronRunBudgetMs, pastDeadline, timeLeft } from '@/lib/cron/budget'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('run budgets', () => {
  it('stay below the Vercel function limit configured in vercel.json', () => {
    const vercel = JSON.parse(readFileSync(resolve(__dirname, '../../../../../../vercel.json'), 'utf8')) as { functions: Record<string, { maxDuration: number }>; crons: { path: string; schedule: string }[] }
    expect(vercel.functions['api/index.mjs']?.maxDuration).toBe(VERCEL_FUNCTION_MAX_SECONDS)
    expect(CRON_RUN_BUDGET_MS).toBeLessThan(VERCEL_FUNCTION_MAX_SECONDS * 1000)
    // The env override cannot push a run past the limit.
    expect(cronRunBudgetMs({ CRON_RUN_BUDGET_MS: '600000' })).toBe(CRON_RUN_BUDGET_MS)
    expect(cronRunBudgetMs({ CRON_RUN_BUDGET_MS: '120000' })).toBe(120_000)
    expect(cronRunBudgetMs({})).toBe(CRON_RUN_BUDGET_MS)
  })

  it('schedules every job, both UTC hours of each Eastern daily slot, and the five-minute pass off the hour', () => {
    const vercel = JSON.parse(readFileSync(resolve(__dirname, '../../../../../../vercel.json'), 'utf8')) as { crons: { path: string; schedule: string }[] }
    const byPath = Object.fromEntries(vercel.crons.map((c) => [c.path, c.schedule]))
    // 03:00 ET = 07:00 UTC (EDT) or 08:00 UTC (EST); likewise 04:00 and 06:00 ET.
    expect(byPath['/api/cron/demo-reset']).toBe('0 7,8 * * *')
    expect(byPath['/api/cron/auth-cleanup']).toBe('0 8,9 * * *')
    expect(byPath['/api/cron/billing-retry']).toBe('0 10,11 * * *')
    // Off the hour so the daily cron claims its slot with a full budget first.
    expect(byPath['/api/cron/workers']).toBe('1,6,11,16,21,26,31,36,41,46,51,56 * * * *')
    // Patient texting stays unscheduled while texting is off.
    expect(byPath['/api/cron/patient-texting']).toBeUndefined()
  })

  it('measures, slices and reports exhaustion against a fixed clock', () => {
    const now = 1_000_000
    const budget = RunBudget.of(60_000, now)
    expect(budget.remaining(now + 10_000)).toBe(50_000)
    expect(budget.exhausted(0, now + 59_999)).toBe(false)
    expect(budget.exhausted(5_000, now + 56_000)).toBe(true)
    expect(budget.remaining(now + 90_000)).toBe(0)
    // A slice never outlives its parent.
    expect(budget.slice(120_000, now).deadline).toBe(budget.deadline)
    expect(budget.slice(10_000, now).deadline).toBe(now + 10_000)
    expect(timeLeft(undefined)).toBe(Number.POSITIVE_INFINITY)
    expect(pastDeadline(undefined)).toBe(false)
    expect(pastDeadline(now + 1_000, 2_000, now)).toBe(true)
  })
})
