import { describe, expect, it } from 'vitest'
import { assertPrices, canSeeProspect, eligibleRelationship, reversalTarget } from './policy'
import { recurringCollected } from './ledger'

describe('reseller pure price, ownership and revenue rules',()=>{
  const prices={lifetime_cents:500000,monthly_cents:30000,setup_cents:50000,version:1}
  it('exact caps allowed; one cent beyond, above standard, setup waiver and invalid cents refused',()=>{
    expect(()=>assertPrices(prices,'one_time',400000,0,0)).not.toThrow()
    expect(()=>assertPrices(prices,'subscription',0,20000,50000)).not.toThrow()
    for(const args of [
      ['one_time',399999,0,0],['one_time',500001,0,0],['subscription',0,19999,50000],
      ['subscription',0,30001,50000],['subscription',0,30000,49999],['subscription',0,30000,0],
      ['one_time',NaN,0,0],['one_time',500000.5,0,0],['other',0,0,0],
    ] as const) expect(()=>assertPrices(prices,args[0],args[1],args[2],args[3])).toThrow()
    expect(()=>assertPrices(null,'one_time',500000,0,0)).toThrow('configures')
  })
  it('even a low catalog price must stay at the minimum charge',()=>{
    expect(()=>assertPrices({...prices,lifetime_cents:500},'one_time',49,0,0)).toThrow()
    expect(()=>assertPrices({...prices,monthly_cents:500},'subscription',0,50,50000)).not.toThrow()
  })
  it('company managers are not global managers; reps do not become managers by supplying an id',()=>{
    const p={company_id:'a',salesperson_id:'r'}
    expect(canSeeProspect({role:'reseller_manager',userId:'m',companyId:'a'},p)).toBe(true)
    expect(canSeeProspect({role:'reseller_manager',userId:'m',companyId:'b'},p)).toBe(false)
    expect(canSeeProspect({role:'reseller_salesperson',userId:'other',companyId:'a'},p)).toBe(false)
    expect(canSeeProspect({role:'sales_rep',userId:'r'},p)).toBe(false)
  })
  it('effective termination boundary excludes the instant of termination',()=>{
    const c={activated_at:'2026-01-01',terminated_at:'2026-03-01'}
    expect(eligibleRelationship(c,new Date('2026-02-28'))).toBe(true)
    expect(eligibleRelationship(c,new Date('2026-03-01'))).toBe(false)
    expect(eligibleRelationship(c,new Date('2025-12-31'))).toBe(false)
  })
  it('overlapping unproven losses take max; proven separate losses sum; deduction never exceeds earnings',()=>{
    expect(reversalTarget(2000,10000,2500,10000,0)).toBe(2000)
    expect(reversalTarget(2000,10000,2500,0,5000)).toBe(1500)
    expect(reversalTarget(2000,10000,10000,10000,10000)).toBe(2000)
    expect(reversalTarget(2000,10000,2500,0,0)).toBe(500)
  })
  it('mixed invoice actual collection is allocated to recurring items without catalog assumptions',()=>{
    const invoice={total:12000,lines:{data:[{amount:5000},{amount:10000,parent:{subscription_item_details:{}}}]}}
    expect(recurringCollected(invoice,12000)).toBe(8000)
    expect(()=>recurringCollected({...invoice,lines:{...invoice.lines,has_more:true}},12000)).toThrow()
    expect(recurringCollected({total:5000,lines:{data:[{amount:5000}]}},5000)).toBe(0)
  })
})
