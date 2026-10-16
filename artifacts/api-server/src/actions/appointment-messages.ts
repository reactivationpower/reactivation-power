import { z } from 'zod'
import { pool } from '@workspace/db'
import { requireAdmin } from '@/lib/auth/admin-session'
import { getAdminUserById, listAdminUsers } from '@/lib/data/admin-users'
import { provider, locationId } from '@/lib/sales-leads/provider'
import { settings, transaction } from '@/lib/sales-leads/store'
import { schedulerHealthy } from '@/lib/sales-leads/wake'
import { APPOINTMENT_LOCK, appointmentSettings } from '@/lib/appointment-messages/store'
async function owner() {
  const admin = await requireAdmin()
  if (admin.role !== 'super_admin') throw new Error('Only super admins can configure appointment messages')
  return admin
}
export async function getAppointmentMessaging() {
  const admin = await requireAdmin()
  const [config, hosts, team, jobs, appointments, cfg] = await Promise.all([
    appointmentSettings(), pool.query('SELECT * FROM appointment_hosts ORDER BY name'), listAdminUsers(),
    pool.query(`SELECT d.id,d.appointment_id,d.kind,d.channel,d.state,d.due_at,d.sent_at,d.last_error,
        e.status AS email_status, l.first_name,l.last_name
      FROM appointment_deliveries d JOIN appointment_messages a USING(appointment_id)
      JOIN sales_leads l ON l.id=a.lead_id LEFT JOIN email_log e ON e.id=d.email_log_id
      WHERE $1 OR l.assignee_id=$2 ORDER BY d.due_at DESC LIMIT 100`, [admin.role === 'super_admin', admin.userId]),
    pool.query(`SELECT a.appointment_id,a.starts_at,a.last_error,a.stopped,l.first_name,l.last_name
      FROM appointment_messages a JOIN sales_leads l ON l.id=a.lead_id WHERE a.last_error IS NOT NULL AND ($1 OR l.assignee_id=$2)
      ORDER BY a.reconcile_at DESC LIMIT 20`, [admin.role === 'super_admin', admin.userId]), settings(),
  ])
  return { config: { ...config, sms_enabled: cfg.capabilities?.appointment_sms?.enabled === true }, hosts: hosts.rows, team: team.filter(u => u.active && u.confirmedAt).map(u => ({ id: u.id, name: u.name, email: u.email })),
    deliveries: jobs.rows, issues: appointments.rows, superAdmin: admin.role === 'super_admin', schedulerReady: schedulerHealthy(cfg.capabilities) }
}
export async function saveAppointmentHost(input: unknown) {
  await owner()
  const data = z.object({
    ghlUserId: z.string().regex(/^[A-Za-z0-9_-]{5,100}$/), adminId: z.string().uuid(),
    name: z.string().trim().min(1).max(70).regex(/^[^<>\r\n]+$/),
    replyEmail: z.string().trim().email().max(254), active: z.boolean(),
  }).parse(input)
  const user = await getAdminUserById(data.adminId)
  if (!user?.active || !user.confirmedAt) throw new Error('Choose an active, verified staff account')
  // Read-only membership verification; changing a messaging profile never changes the calendar host.
  if (data.active) {
    const result = await provider(`/users/?${new URLSearchParams({ locationId: locationId() })}`)
    if (!result.users?.some((u: any) => u.id === data.ghlUserId)) throw new Error('GHL user is not in the configured location')
  }
  await transaction(async c => {
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [APPOINTMENT_LOCK])
    await c.query(`INSERT INTO appointment_hosts(ghl_user_id,admin_id,name,reply_email,active) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(ghl_user_id) DO UPDATE SET admin_id=$2,name=$3,reply_email=$4,active=$5`,
      [data.ghlUserId, data.adminId, data.name, data.replyEmail, data.active])
    // Profile changes need readiness review again, not silent activation with a new inbox.
    await c.query("UPDATE appointment_message_settings SET enabled=false,readiness_confirmed_at=NULL WHERE id='strategy'")
  })
}
export async function saveAppointmentMessaging(input: unknown) {
  const admin = await owner()
  const data = z.object({ enabled: z.boolean(), confirmReadiness: z.boolean().optional(),
    smsEnabled: z.boolean().default(false) }).parse(input)
  await transaction(async c => {
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [APPOINTMENT_LOCK])
    const current = await appointmentSettings(c)
    const cfg = await settings(c)
    const smsOn = current.enabled && cfg.capabilities?.appointment_sms?.enabled === true
    // Only checks for turning something on. Turning reminder texts off (while
    // keeping emails on) or turning everything off must always work.
    // The super admin flipping the switch is the readiness confirmation.
    const turningOn = data.enabled && (!current.enabled || (data.smsEnabled && !smsOn))
    if (turningOn) {
      if (!schedulerHealthy(cfg.capabilities)) throw new Error('Needs the published app running')
      if (!(await c.query('SELECT 1 FROM appointment_hosts WHERE active=true LIMIT 1')).rowCount) throw new Error('Add who hosts the calls in Advanced first')
    }
    await c.query(`UPDATE sales_settings SET capabilities=jsonb_set(capabilities,'{appointment_sms}',$1::jsonb)
      WHERE id='internal'`, [JSON.stringify({ enabled: data.enabled && data.smsEnabled, confirmedBy: admin.userId })])
    if (!data.smsEnabled) await c.query(`UPDATE appointment_deliveries SET state='cancelled',last_error='Automatic appointment texts disabled'
      WHERE channel='sms' AND state IN ('pending','blocked')`)
    await c.query(`UPDATE appointment_message_settings SET enabled=$1,
      enabled_at=CASE WHEN $1 AND NOT enabled THEN now() ELSE enabled_at END,
      readiness_confirmed_at=CASE WHEN $2 THEN now() ELSE readiness_confirmed_at END WHERE id='strategy'`, [data.enabled, turningOn || !!data.confirmReadiness])
    if (!data.enabled) {
      await c.query("UPDATE appointment_deliveries SET state='cancelled',last_error='Automation disabled by administrator' WHERE state IN ('pending','blocked')")
      await c.query('UPDATE appointment_messages SET stopped=true WHERE NOT stopped')
    }
  })
}
