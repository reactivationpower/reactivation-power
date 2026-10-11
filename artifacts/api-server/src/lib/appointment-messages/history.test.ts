import { beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ query: vi.fn(), admin: vi.fn() }))
vi.mock('@workspace/db', () => ({ pool: { query: mock.query } }))
vi.mock('../auth/admin-session', () => ({ requireAdmin: mock.admin }))
import { appointmentEmailHistoryEntry, listAppointmentEmailHistory } from './history'

const row = {
  id:'delivery', appointment_id:'appointment', kind:'confirmation', state:'sent',
  snapshot:{rendered:{subject:'Original subject',html:'<p>Original content</p>'},recipient:'original@example.invalid',
    from:'Original sender',replyTo:'jacobb@patientpipeline.app',copy:{host:'Original host'}},
  provider_id:'resend-id',email_log_id:'log-id',claimed_at:'2026-10-12T14:00Z',sent_at:'2026-10-12T14:00:01Z',due_at:'2026-10-12T14:00Z',
}
describe('appointment email frozen history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mock.admin.mockResolvedValue({role:'sales_rep',userId:'staff'})
  })
  it('keeps the exact original content and distinguishes acceptance from delivery', () => {
    expect(appointmentEmailHistoryEntry(row)).toMatchObject({status:'accepted',subject:'Original subject',
      recipient:'original@example.invalid',html:'<p>Original content</p>',body:'Original content',contentAvailable:true})
    expect(appointmentEmailHistoryEntry({...row,email_status:'delivered',delivered_at:'2026-10-12T14:02Z'}).status).toBe('delivered')
  })
  it('does not relabel transport uncertainty as failure or invent a send time', () => {
    expect(appointmentEmailHistoryEntry({...row,state:'uncertain',provider_id:null,email_status:'failed'}))
      .toMatchObject({status:'uncertain',sentAt:null})
    expect(appointmentEmailHistoryEntry({...row,state:'uncertain',email_status:'bounced',last_event:'email.bounced'}).status).toBe('failed')
  })
  it('preserves a failure even if later delivery evidence exists', () => {
    expect(appointmentEmailHistoryEntry({...row,email_status:'bounced',log_provider_id:'resend-id',delivered_at:'2026-10-12T14:02Z'}).status).toBe('failed')
  })
  it('never fabricates missing historical content', () => {
    expect(appointmentEmailHistoryEntry({...row,snapshot:null})).toMatchObject({subject:null,html:null,body:null,recipient:null,contentAvailable:false})
  })
  it('rejects another salesperson before querying message content', async () => {
    mock.query.mockResolvedValueOnce({rowCount:0,rows:[]})
    await expect(listAppointmentEmailHistory('lead')).rejects.toThrow('Lead not available')
    expect(mock.query).toHaveBeenCalledTimes(1)
    expect(mock.query.mock.calls[0][1]).toEqual(['lead',false,'staff'])
  })
  it('scopes both reads, bounds the result and signals truncated history', async () => {
    mock.query.mockResolvedValueOnce({rowCount:1,rows:[{id:'lead'}]})
      .mockResolvedValueOnce({rows:[row,{...row,id:'older'}]})
    const result=await listAppointmentEmailHistory('lead',1)
    expect(result.messages).toHaveLength(1)
    expect(result.hasMore).toBe(true)
    expect(mock.query.mock.calls[1][1]).toEqual(['lead',false,'staff',2])
    expect(mock.query.mock.calls[1][0]).toContain('l.assignee_id=$3')
  })
})
