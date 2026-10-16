import { describe, expect, it } from 'vitest'
import { CONCERN_OPTIONS, HBOT_NICHE_NAME, SERVICE_GROUPS, suggestNicheForService } from '@workspace/niche-catalog'
import { readFlowFile } from './lib'

describe('one regular customer-facing HBOT service', () => {
  it('retains the already published Chiro niche instead of adding a second hyperbaric niche', () => {
    const flow = readFlowFile('hbot')
    expect(flow.niche).toMatchObject({ name: HBOT_NICHE_NAME, is_active: true, sector: 'healthcare' })
    const services = SERVICE_GROUPS.flatMap((g) => g.services)
      .filter((s) => /hbot|hyperbaric/i.test(s.niche))
    expect(services).toEqual([{ label: 'HBOT', niche: HBOT_NICHE_NAME }])
    expect(CONCERN_OPTIONS[HBOT_NICHE_NAME]).toHaveLength(8)
    expect(suggestNicheForService('Hyperbaric Oxygen Therapy', [{ name: HBOT_NICHE_NAME }]))
      .toEqual({ name: HBOT_NICHE_NAME })
    expect(suggestNicheForService('fatigue and brain fog', [{ name: HBOT_NICHE_NAME }])).toBeNull()
  })
})
