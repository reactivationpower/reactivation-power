import { beforeEach, describe, expect, it, vi } from 'vitest'
const fx = vi.hoisted(() => ({
  role: 'super_admin', current: { enabled: false, readiness_confirmed_at: null as string | null }, caps: {} as Record<string, any>,
  healthy: true, hosts: 1, queries: [] as { sql: string; args: any[] }[],
}))
vi.mock('@workspace/db', () => ({ pool: { query: vi.fn() } }))
vi.mock('@/lib/auth/admin-session', () => ({ requireAdmin: async () => ({ role: fx.role, userId: 'owner' }) }))
vi.mock('@/lib/data/admin-users', () => ({ getAdminUserById: vi.fn(), listAdminUsers: vi.fn() }))
vi.mock('@/lib/sales-leads/provider', () => ({ provider: vi.fn(), locationId: () => 'loc' }))
vi.mock('@/lib/sales-leads/wake', () => ({ schedulerHealthy: () => fx.healthy }))
vi.mock('@/lib/appointment-messages/store', () => ({ APPOINTMENT_LOCK: 'lock', appointmentSettings: async () => fx.current }))
vi.mock('@/lib/sales-leads/store', () => ({
  settings: async () => ({ capabilities: fx.caps }),
  transaction: async (fn: any) => fn({ query: async (sql: string, args: any[] = []) => {
    fx.queries.push({ sql, args })
    return sql.includes('FROM appointment_hosts') ? { rowCount: fx.hosts, rows: [] } : { rowCount: 0, rows: [] }
  } }),
}))
import { saveAppointmentMessaging } from '../appointment-messages'

const saved = () => fx.queries.find(q => q.sql.includes('UPDATE appointment_message_settings'))!.args
const smsCap = () => JSON.parse(fx.queries.find(q => q.sql.includes('appointment_sms'))!.args[0])

beforeEach(() => {
  fx.role = 'super_admin'; fx.current = { enabled: false, readiness_confirmed_at: null }; fx.caps = {}
  fx.healthy = true; fx.hosts = 1; fx.queries = []
})

describe('saveAppointmentMessaging switches', () => {
  it('turns reminders on from the switch alone, without a separate attestation', async () => {
    await saveAppointmentMessaging({ enabled: true, smsEnabled: false })
    expect(saved()).toEqual([true, true])
    expect(smsCap()).toMatchObject({ enabled: false })
  })

  it('turns reminder texts on', async () => {
    fx.current = { enabled: true, readiness_confirmed_at: '2026-10-01' }
    await saveAppointmentMessaging({ enabled: true, smsEnabled: true })
    expect(smsCap()).toMatchObject({ enabled: true })
  })

  it('still requires a super admin', async () => {
    fx.role = 'admin'
    await expect(saveAppointmentMessaging({ enabled: true, smsEnabled: true })).rejects.toThrow('super admins')
  })

  it('gives plain reasons when reminders cannot turn on', async () => {
    fx.healthy = false
    await expect(saveAppointmentMessaging({ enabled: true })).rejects.toThrow('Needs the published app running')
    fx.healthy = true; fx.hosts = 0
    await expect(saveAppointmentMessaging({ enabled: true })).rejects.toThrow('Add who hosts the calls')
  })

  it('always lets reminder texts or all reminders turn off, even when the app is not running', async () => {
    fx.current = { enabled: true, readiness_confirmed_at: '2026-10-01' }; fx.caps = { appointment_sms: { enabled: true } }
    fx.healthy = false; fx.hosts = 0
    await saveAppointmentMessaging({ enabled: true, smsEnabled: false })
    expect(smsCap()).toMatchObject({ enabled: false })
    expect(fx.queries.some(q => q.sql.includes("channel='sms'") && q.sql.includes('cancelled'))).toBe(true)
    fx.queries = []
    await saveAppointmentMessaging({ enabled: false })
    expect(saved()[0]).toBe(false)
  })
})
