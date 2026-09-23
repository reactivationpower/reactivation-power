import { describe, expect, it } from 'vitest'
import {
  buildTestPayload,
  detectWebhookSource,
  flattenPayload,
  GHL_FIELD_TABLE,
  GHL_SAMPLE_PAYLOAD,
  mapWebhookPayload,
  sanitizeFieldMapping,
  WEBHOOK_FIELDS,
} from '@workspace/shared/lead-webhooks'

/** The field-mapping rules the intake route and the Lead sources tab share. */

describe('mapWebhookPayload defaults', () => {
  it('maps snake_case, camelCase and spaced keys the same way', () => {
    for (const body of [
      { first_name: 'Ana', last_name: 'Ruiz', phone: '303-555-0100', email: 'a@x.com', requested_time: 'Tue 3pm', message: 'hi' },
      { firstName: 'Ana', lastName: 'Ruiz', phoneNumber: '303-555-0100', emailAddress: 'a@x.com', preferredTime: 'Tue 3pm', notes: 'hi' },
      { 'First Name': 'Ana', 'Last Name': 'Ruiz', 'Mobile Phone': '303-555-0100', 'E-mail': 'a@x.com', 'Best time to call': 'Tue 3pm', Comments: 'hi' },
    ]) {
      const res = mapWebhookPayload(body)
      expect(res.ok, JSON.stringify(body)).toBe(true)
      if (res.ok) {
        expect(res.lead).toEqual({
          firstName: 'Ana',
          lastName: 'Ruiz',
          phone: '303-555-0100',
          email: 'a@x.com',
          requestedTime: 'Tue 3pm',
          message: 'hi',
        })
        expect(res.hits.phone?.via).toBe('auto')
      }
    }
  })

  it('splits a single full name and joins a separate date and time', () => {
    const res = mapWebhookPayload({ name: 'Mary Ann Lee', phone: '7205550123', date: '9/30', time: '10am' })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.lead.firstName).toBe('Mary Ann')
      expect(res.lead.lastName).toBe('Lee')
      expect(res.lead.requestedTime).toBe('9/30 10am')
    }
  })

  it('reads Facebook lead-form field_data entries', () => {
    const res = mapWebhookPayload({
      id: '123',
      created_time: '2026-09-22T10:00:00Z',
      field_data: [
        { name: 'full_name', values: ['Sam Ortiz'] },
        { name: 'phone_number', values: ['+17205550111'] },
        { name: 'email', values: ['sam@example.com'] },
      ],
    })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.lead).toMatchObject({ firstName: 'Sam', lastName: 'Ortiz', phone: '+17205550111', email: 'sam@example.com' })
  })

  it('rejects a payload without a phone and names the fields it did see', () => {
    const res = mapWebhookPayload({ first_name: 'Ana', zip: '80202' })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toMatch(/phone number/)
      expect(res.error).toMatch(/first_name, zip/)
    }
  })

  it('rejects a phone with too few digits, an empty body and non-objects', () => {
    const short = mapWebhookPayload({ first_name: 'Ana', phone: '12345' })
    expect(short.ok).toBe(false)
    if (!short.ok) expect(short.error).toMatch(/fewer than 7 digits/)
    expect(mapWebhookPayload({}).ok).toBe(false)
    expect(mapWebhookPayload('nope').ok).toBe(false)
    expect(mapWebhookPayload([{ phone: '3035550100' }]).ok).toBe(false)
  })
})

describe('owner mapping', () => {
  it('wins over the defaults per field and leaves the rest automatic', () => {
    const body = { first_name: 'Wrong', patient: 'Right', phone: '3035550100', mobile: '7205550100', email: 'r@x.com' }
    const res = mapWebhookPayload(body, { firstName: 'patient', phone: 'mobile' })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.lead.firstName).toBe('Right')
      expect(res.lead.phone).toBe('7205550100')
      expect(res.lead.email).toBe('r@x.com')
      expect(res.hits.firstName?.via).toBe('mapping')
      expect(res.hits.email?.via).toBe('auto')
    }
  })

  it('reaches nested keys by dotted path', () => {
    const res = mapWebhookPayload(
      { lead: { who: 'Ana Ruiz' }, answers: { q3: '3035550100', q7: 'Any weekday morning' } },
      { firstName: 'lead.who', phone: 'answers.q3', requestedTime: 'answers.q7' },
    )
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.lead).toMatchObject({ firstName: 'Ana Ruiz', phone: '3035550100', requestedTime: 'Any weekday morning' })
  })

  it('a mapped key that is absent does not fall back to a default silently', () => {
    const res = mapWebhookPayload({ first_name: 'Ana', phone: '3035550100' }, { phone: 'cell_number' })
    expect(res.ok).toBe(false)
  })

  it('sanitizeFieldMapping keeps known fields only, trimmed, without blanks', () => {
    expect(sanitizeFieldMapping({ phone: '  Phone Number ', firstName: '', bogus: 'x', email: 42 })).toEqual({ phone: 'Phone Number' })
    expect(sanitizeFieldMapping(null)).toEqual({})
  })
})

describe('GoHighLevel', () => {
  it('detects the workflow webhook envelope and maps the contact without any mapping', () => {
    expect(detectWebhookSource(GHL_SAMPLE_PAYLOAD)).toBe('gohighlevel')
    expect(detectWebhookSource({ first_name: 'x', phone: 'y' })).toBe('webhook')
    expect(detectWebhookSource({ contact: { locationId: 'loc', firstName: 'x' } })).toBe('gohighlevel')

    const res = mapWebhookPayload(GHL_SAMPLE_PAYLOAD)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.lead).toEqual({
        firstName: 'Jordan',
        lastName: 'Reyes',
        email: 'jordan.reyes@example.com',
        phone: '+13035550142',
        requestedTime: 'Tuesday after 3pm',
        message: 'Lower back has been bad for two weeks',
      })
    }
  })

  it('the field table in the guide agrees with what the mapper does', () => {
    const res = mapWebhookPayload(GHL_SAMPLE_PAYLOAD)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    for (const row of GHL_FIELD_TABLE) {
      if (!row.field) continue
      expect(res.hits[row.field]?.key, row.ghlKey).toBe(row.ghlKey)
    }
  })

  it('maps a nested contact object too', () => {
    const res = mapWebhookPayload({ contact: { firstName: 'Lee', lastName: 'Park', phone: '+13035550199', locationId: 'loc' } })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.lead).toMatchObject({ firstName: 'Lee', lastName: 'Park', phone: '+13035550199' })
  })
})

describe('helpers', () => {
  it('flattenPayload joins scalar arrays and indexes object arrays', () => {
    expect(flattenPayload({ a: { b: 1 }, tags: ['x', 'y'], list: [{ k: 'v' }] })).toEqual({ 'a.b': '1', tags: 'x, y', 'list.0.k': 'v' })
  })

  it('buildTestPayload uses the mapped key names so a custom mapping is what gets tested', () => {
    const plain = buildTestPayload()
    expect(Object.keys(plain)).toEqual(expect.arrayContaining(['first_name', 'phone', 'test']))
    const custom = buildTestPayload({ phone: 'Cell Number' })
    expect(custom['Cell Number']).toBe('(555) 010-0100')
    expect(custom.phone).toBeUndefined()
    const mapped = mapWebhookPayload(custom, { phone: 'Cell Number' })
    expect(mapped.ok).toBe(true)
    expect(WEBHOOK_FIELDS).toHaveLength(6)
  })
})
