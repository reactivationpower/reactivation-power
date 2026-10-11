import { describe, expect, it } from 'vitest'
import { nextSmsWindow, scheduleMessages, smsAllowed } from './schedule'
import { renderAppointmentMessage } from './content'
import { eventState, meetLink } from './store'
describe('appointment reminder schedule', () => {
  const zone = 'America/New_York'
  it('9 PM to noon: email now, text at 8 AM, then 2-hour and 5-minute email + text', () => {
    const slots = scheduleMessages(new Date('2026-10-11T01:00:00Z'), new Date('2026-10-11T16:00:00Z'), zone, 'confirmation')
    expect(slots.map(s => [s.kind,s.channel,s.dueAt.toISOString()]).sort()).toEqual([
      ['confirmation','email','2026-10-11T01:00:00.000Z'],
      ['twelve_hours','email','2026-10-11T04:00:00.000Z'],
      ['confirmation','sms','2026-10-11T12:00:00.000Z'],
      ['two_hours','email','2026-10-11T14:00:00.000Z'],
      ['two_hours','sms','2026-10-11T14:00:00.000Z'],
      ['starting','email','2026-10-11T15:55:00.000Z'],
      ['starting','sms','2026-10-11T15:55:00.000Z'],
    ].sort())
  })
  it('sends every reminder by email and text for an early daytime booking', () => {
    // Call Monday 4 PM Eastern; 12-hour mark (4 AM) is at night, so that text waits until 8 AM.
    const slots = scheduleMessages(new Date('2026-10-10T16:00:00Z'), new Date('2026-10-12T20:00:00Z'), zone, 'confirmation')
    expect(slots.map(s => `${s.kind}:${s.channel}`).sort()).toEqual([
      'confirmation:email','confirmation:sms','day_before:email','day_before:sms','twelve_hours:email','twelve_hours:sms',
      'two_hours:email','two_hours:sms','starting:email','starting:sms'].sort())
    expect(slots.find(s => s.kind === 'twelve_hours' && s.channel === 'sms')!.dueAt.toISOString()).toBe('2026-10-12T12:00:00.000Z')
  })
  it('uses inclusive 8 AM and exclusive 8 PM, including weekends', () => {
    expect(smsAllowed(new Date('2026-10-10T11:59Z'),zone)).toBe(false)
    expect(smsAllowed(new Date('2026-10-10T12:00Z'),zone)).toBe(true)
    expect(smsAllowed(new Date('2026-10-10T23:59Z'),zone)).toBe(true)
    expect(smsAllowed(new Date('2026-10-11T00:00Z'),zone)).toBe(false)
  })
  it.each([
    ['2026-11-01T01:00Z','2026-11-01T13:00:00.000Z'],
    ['2026-03-08T02:00Z','2026-03-08T12:00:00.000Z'],
  ])('handles DST from %s', (now, expected) => expect(nextSmsWindow(new Date(now),zone)?.toISOString()).toBe(expected))
  it('does not infer an unknown device zone or delay a final reminder past its meeting', () => {
    expect(nextSmsWindow(new Date(),null)).toBeNull()
    expect(scheduleMessages(new Date('2026-10-10T16:00Z'),new Date('2026-10-12T16:00Z'),null,'confirmation').every(s => s.channel==='email')).toBe(true)
    // 7 AM call: every text time is before 8 AM, so only emails go out.
    const early = scheduleMessages(new Date('2026-10-11T01:00Z'),new Date('2026-10-11T11:00Z'),zone,'confirmation')
    expect(early.every(s => s.channel==='email')).toBe(true)
  })
  it('a last-minute booking gets the confirmation and the 5-minute reminder, nothing in between', () => {
    const soon = scheduleMessages(new Date('2026-10-12T15:20Z'),new Date('2026-10-12T16:00Z'),zone,'confirmation')
    expect(soon.filter(s => s.channel==='sms').map(s=>s.kind)).toEqual(['confirmation','starting'])
    expect(soon.filter(s => s.channel==='email').map(s=>s.kind)).toEqual(['confirmation','starting'])
  })
  it('cancellation sends only change notices, no further reminders', () => {
    expect(scheduleMessages(new Date('2026-10-10T16:00Z'),new Date('2026-10-12T16:00Z'),zone,'cancelled').map(s=>s.kind)).toEqual(['cancelled','cancelled'])
  })
})
describe('personal host content and provider input', () => {
  const copy = { firstName:'Alex',host:'Morgan',start:'2026-10-12T16:00Z',timezone:'America/New_York',meetingUrl:'https://meet.google.com/abc-defg-hij',walkthroughUrl:'https://patientpipeline.app/walkthrough',kind:'confirmation' as const }
  it('uses the assigned host, walkthrough, computer instruction, and conditional email note', () => {
    const message = renderAppointmentMessage(copy)
    expect(message.sms).toContain('Morgan with Patient Pipeline')
    expect(message.html).toContain('grow your practice’s revenue')
    expect(message.sms).toContain('4-minute')
    expect(message.html).toContain('computer')
    expect(message.sms).not.toContain('received a confirmation email')
    expect(renderAppointmentMessage({...copy,emailAccepted:true}).sms).toContain('spam or junk')
    expect(renderAppointmentMessage({...copy,kind:'final'}).sms).not.toContain('walkthrough')
    expect(renderAppointmentMessage({...copy,kind:'starting'}).sms).toContain('starts in 5 minutes')
    expect(renderAppointmentMessage({...copy,kind:'two_hours'}).sms).toContain('in 2 hours')
    expect(renderAppointmentMessage({...copy,kind:'starting'}).html).toContain(copy.meetingUrl)
  })
  it('escapes untrusted text and accepts only genuine Meet links', () => {
    expect(renderAppointmentMessage({...copy,host:'<script>'}).html).toContain('&lt;script&gt;')
    expect(meetLink('https://meet.google.com/abc-defg-hij')).toBe(copy.meetingUrl)
    expect(meetLink('https://meet.google.com.evil.example/abc-defg-hij')).toBe('')
    expect(eventState({appointmentStatus:'cancelled'})).toBe('cancelled')
    expect(eventState({appointmentStatus:'showed'})).toBe('hold')
  })
  it.each(['confirmation','day_before','twelve_hours','two_hours','starting','rescheduled','cancelled'] as const)('brands %s in the recipient timezone', kind => {
    const message=renderAppointmentMessage({...copy,kind,timezone:'America/Los_Angeles'})
    expect(message.html).toContain('patient-pipeline-logo.png')
    expect(message.html).toContain('Morgan')
    expect(message.html).toContain('9:00 AM')
    expect(message.html).toContain('PDT')
    expect(message.html).toContain('strategy call')
    if(kind!=='cancelled') {
      if(!['starting'].includes(kind)) expect(message.html).toContain('4-minute')
      expect(message.html).toContain('computer')
      expect(message.html).toContain(copy.meetingUrl)
    }
  })
})
