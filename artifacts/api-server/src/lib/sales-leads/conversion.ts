import { pool } from '@workspace/db'
import { activity, id, stop, transaction } from './store'
/** Explicit enrollment handoff; no payment rules or customer-practice access changes. */
export async function linkSalesCustomer(leadId: string, customerId: string, email: string, actor: { userId: string; name: string | null; email: string }) {
  await transaction(async c => {
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`sales-send:${leadId}`])
    const lead = (await c.query('SELECT * FROM sales_leads WHERE id=$1 FOR UPDATE', [leadId])).rows[0]
    if (!lead || lead.email !== email.trim().toLowerCase()) throw new Error('Enrollment email must match the selected lead')
    if (lead.customer_id && lead.customer_id !== customerId) throw new Error('This lead already has a different customer record')
    await c.query("UPDATE sales_leads SET customer_id=$2,stage='Won',revision=revision+1,updated_at=now() WHERE id=$1", [leadId, customerId])
    await stop(c, leadId, 'converted')
    // Preserve protected attribution even after a staff email correction. An
    // existing customer attribution is never replaced by this handoff.
    await c.query('SELECT id FROM customers WHERE id=$1 FOR UPDATE', [customerId])
    if (lead.affiliate_id && !(await c.query('SELECT id FROM affiliate_attributions WHERE customer_id=$1 LIMIT 1', [customerId])).rows.length) {
      const eligible = (await c.query("SELECT id FROM affiliates WHERE id=$1 AND status='approved' AND email<>$2", [lead.affiliate_id, email])).rows[0]
      if (eligible) {
        await c.query(`INSERT INTO affiliate_attributions(id,customer_id,affiliate_id,actor,reason) VALUES($1,$2,$3,'intake','Preserved internal sales lead attribution')`, [id(), customerId, lead.affiliate_id])
        await c.query(`INSERT INTO affiliate_activity(id,affiliate_id,action,actor,customer_id,reason) VALUES($1,$2,'customer_attributed',$3,$4,'Preserved internal sales lead attribution')`, [id(), lead.affiliate_id, actor.userId, customerId])
      }
    }
    await activity(c, leadId, { kind: 'conversion', body: 'Linked to customer enrollment; no payment collected by conversion', authorId: actor.userId, authorName: actor.name || actor.email, dedupeKey: `sales-conversion:${leadId}:${customerId}` })
  })
}
