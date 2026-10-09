import { describe, expect, it } from 'vitest'
import { historyOfferState } from './admin_customers_id'
import { customerIdFor } from './admin_billing'

describe('customer helpers', () => {
  it('classifies history rows by offer presence', () => {
    const ids = new Set(['a'])
    expect(historyOfferState({ link_id: 'a' }, ids)).toEqual({ kind: 'live', id: 'a' })
    expect(historyOfferState({ link_id: 'gone' }, ids)).toEqual({ kind: 'missing', id: 'gone' })
    expect(historyOfferState({ link_id: null }, ids)).toEqual({ kind: 'none' })
  })
  it('resolves billing customer ids per row kind', () => {
    expect(customerIdFor({ id: 'h1', customer_id: 'c1' }, 'ledger')).toBe('c1')
    expect(customerIdFor({ id: 'c2' }, 'customer')).toBe('c2')
  })
})
