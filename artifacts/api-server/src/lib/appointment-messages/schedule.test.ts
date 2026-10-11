import { describe, expect, it } from 'vitest'
import { nextSmsWindow, scheduleMessages, smsAllowed } from './schedule'
import { renderAppointmentMessage } from './content'
import { eventState, meetLink } from './store'
describe('appointment reminder schedule', () => {
  const zone = 'America/New_York'
  it('9 PM to noon: email now, text at 8 AM, no 24-hour reminder, final at 11:30', () => {
    const slots = scheduleMessages(new Date('2026-10-11T01:00:00Z'), new Date('2026-10-11T16:00:00Z'), zone, 'confirmation')
    expect(slots.map(s => [s.kind,s.channel,s.dueAt.toISOString()])).toEqual([
      ['confirmation','email','2026-10-11T01:00:00.000Z'],
      ['confirmation','sms','2026-10-11T12:00:00.000Z'],
      ['final','sms','2026-10-11T15:30:00.000Z'],
    ])
  })
  it('schedules the approved five messages for a sufficiently early booking', () => {
    const slots = scheduleMessages(new Date('2026-10-10T16:00:00Z'), new Date('2026-10-12T16:00:00Z'), zone, 'confirmation')
    expect(slots.map(s => `${s.kind}:${s.channel}`)).toEqual(['confirmation:email','confirmation:sms','day_before:email','day_before:sms','final:sms'])
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
    const early = scheduleMessages(new Date('2026-10-11T01:00Z'),new Date('2026-10-11T11:00Z'),zone,'confirmation')
    expect(early.every(s => s.channel==='email')).toBe(true)
  })
  it('does not send near-duplicate texts for last-minute booking or morning deferral', () => {
    const soon = scheduleMessages(new Date('2026-10-12T15:20Z'),new Date('2026-10-12T16:00Z'),zone,'confirmation')
    expect(soon.filter(s => s.channel==='sms').map(s=>s.kind)).toEqual(['confirmation'])
    const morning = scheduleMessages(new Date('2026-10-11T01:00Z'),new Date('2026-10-11T13:00Z'),zone,'confirmation')
    expect(morning.filter(s => s.channel==='sms').map(s=>s.kind)).toEqual(['confirmation'])
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
  })
  it('escapes untrusted text and accepts only genuine Meet links', () => {
    expect(renderAppointmentMessage({...copy,host:'<script>'}).html).toContain('&lt;script&gt;')
    expect(meetLink('https://meet.google.com/abc-defg-hij')).toBe(copy.meetingUrl)
    expect(meetLink('https://meet.google.com.evil.example/abc-defg-hij')).toBe('')
    expect(eventState({appointmentStatus:'cancelled'})).toBe('cancelled')
    expect(eventState({appointmentStatus:'showed'})).toBe('hold')
  })
  it.each(['confirmation','day_before','rescheduled','cancelled'] as const)('brands %s in the recipient timezone', kind => {
    const message=renderAppointmentMessage({...copy,kind,timezone:'America/Los_Angeles'})
    expect(message.html).toContain('patient-pipeline-logo.png')
    expect(message.html).toContain('Morgan')
    expect(message.html).toContain('9:00 AM')
    expect(message.html).toContain('PDT')
    expect(message.html).toContain('strategy call.')
    if(kind!=='cancelled') {
      expect(message.html).toContain('4-minute')
      expect(message.html).toContain('computer')
      expect(message.html).toContain(copy.meetingUrl)
    }
  })
})
