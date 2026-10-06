import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AgreementTermsBox } from './agreement-document'

const summary = (noticeDays: number) => renderToStaticMarkup(
  <AgreementTermsBox
    amounts={{ term_months: 12, monthly_cents: 47500, setup_fee_cents: 47500, notice_days: noticeDays }}
    fields={{ start_date: 'November 5, 2026', end_date: 'November 5, 2027' }}
  />,
)

describe('agreement cancellation summary', () => {
  it('explains no advance notice and the actual cancellation effective boundary', () => {
    expect(summary(0)).toContain('No advance notice; ends at term or billing-period end')
    expect(summary(0)).not.toContain('0 days before')
  })
  it('retains historical positive notice terms rather than rewriting them', () => {
    expect(summary(30)).toContain('30 days before end of term')
  })
})
