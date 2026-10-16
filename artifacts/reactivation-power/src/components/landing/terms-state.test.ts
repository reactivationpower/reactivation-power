import { describe, expect, it } from 'vitest'
import { nextAccepted } from './terms-state'

const v = (id: string) => ({ active: true as const, version: { id, label: '', content: '', content_hash: '', checkbox_wording: 'w', published_at: '' } })
describe('nextAccepted', () => {
  it('keeps acceptance when version unchanged', () => expect(nextAccepted(v('a'), v('a'), true)).toBe(true))
  it('resets when version changes', () => expect(nextAccepted(v('a'), v('b'), true)).toBe(false))
  it('resets when first loaded', () => expect(nextAccepted(null, v('a'), true)).toBe(false))
  it('resets when deactivated', () => expect(nextAccepted(v('a'), { active: false, version: null }, true)).toBe(false))
})
