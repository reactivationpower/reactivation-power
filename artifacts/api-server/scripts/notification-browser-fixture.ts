/** Disposable browser fixture; never calls Stripe, provisioning, or email. */
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { pool } from '@workspace/db'
import { getAdminClient } from '@/lib/supabase/admin'
import { DEFAULT_AGREEMENT_BODY } from '@/lib/agreements/template'

const file = process.argv[3] ?? '/tmp/notification-browser-fixture.json'
const supabase = getAdminClient()
const command = process.argv[2]
try {
  if (command === 'create') {
    const id = randomUUID().replaceAll('-', '')
    const email = `notification-${id}@example.invalid`
    const password = randomUUID() + 'Aa1!'
    const result = await supabase.auth.admin.createUser({
      email, password, email_confirm: true,
      app_metadata: { admin_role: 'sales_rep', admin_active: true },
      user_metadata: { full_name: 'Notification Fixture Rep' },
    })
    if (result.error || !result.data.user) throw new Error('Could not create disposable test rep')
    const adminId = result.data.user.id
    // Persist identity immediately so cleanup remains possible after setup error.
    writeFileSync(file, JSON.stringify({ id, email, password, adminId }))
    await pool.query(`INSERT INTO customers (id,full_name,business_name,business_address,phone,owner_name,owner_phone,email,created_by_id)
      VALUES ($1,'Alex Fixture','Notification Fixture Practice','Disposable test address','555','Alex','555',$2,$3)`, [id, email, adminId])
    const link = await supabase.from('payment_links').insert({
      token: randomUUID().replaceAll('-', ''), name: 'Alex Fixture', email, amount_cents: 49900,
    }).select('id').single()
    if (link.error || !link.data) throw new Error('Could not create disposable link')
    const linkId = link.data.id
    writeFileSync(file, JSON.stringify({ id, email, password, adminId, linkId }))
    await pool.query(`INSERT INTO payment_link_terms (link_id,token,customer_id,type,rep_id,enrollment_flow,monthly_cents,setup_fee_cents)
      VALUES ($1,$2,$2,'subscription',$3,true,33000,49900)`, [linkId, id, adminId])
    await pool.query(`INSERT INTO agreements (id,token,customer_id,link_id,term_months,monthly_cents,setup_fee_cents,current_hash)
      VALUES ($1,$2,$1,$3,12,33000,49900,'fixture')`, [id, randomUUID().replaceAll('-', ''), linkId])
    await pool.query(`INSERT INTO agreement_versions (id,agreement_id,version,term_months,monthly_cents,setup_fee_cents,body,hash)
      VALUES ($1,$1,1,12,33000,49900,$2,'fixture')`, [id, DEFAULT_AGREEMENT_BODY])
    await pool.query(`INSERT INTO enrollment_notifications (agreement_id,milestone,occurred_at) VALUES ($1,'opened',now())`, [id])
    console.log('Disposable notification fixture created; credentials are only in the fixture file.')
  } else {
    const f = JSON.parse(readFileSync(file, 'utf8'))
    if (command === 'add') {
      const milestone = process.argv[4] ?? 'signed'
      if (!['signed', 'primary_card', 'backup_card', 'completed'].includes(milestone)) throw new Error('Invalid fixture milestone')
      await pool.query(`INSERT INTO enrollment_notifications (agreement_id,milestone,occurred_at)
        VALUES ($1,$2,now()) ON CONFLICT (agreement_id,milestone) DO NOTHING`, [f.id, milestone])
      console.log('Fixture event inserted.')
    } else if (command === 'cleanup') {
      await pool.query('DELETE FROM enrollment_notifications WHERE agreement_id=$1', [f.id])
      for (const table of ['agreement_events', 'agreement_initials', 'agreement_versions', 'agreement_deliveries']) {
        await pool.query(`DELETE FROM ${table} WHERE agreement_id=$1`, [f.id])
      }
      await pool.query('DELETE FROM agreements WHERE id=$1', [f.id])
      if (f.linkId) {
        await pool.query('DELETE FROM payment_link_terms WHERE link_id=$1 AND customer_id=$2', [f.linkId, f.id])
        await supabase.from('payment_links').delete().eq('id', f.linkId)
      }
      await pool.query('DELETE FROM customers WHERE id=$1', [f.id])
      await pool.query('DELETE FROM enrollment_notification_preferences WHERE admin_id=$1', [f.adminId])
      await pool.query('DELETE FROM enrollment_notification_state WHERE admin_id=$1', [f.adminId])
      await pool.query('DELETE FROM auth_idle_sessions WHERE subject_id=$1', [f.adminId])
      await supabase.auth.admin.deleteUser(f.adminId)
      console.log('Disposable notification fixture removed.')
    } else throw new Error('Expected create, add, or cleanup')
  }
} finally {
  await pool.end()
}
