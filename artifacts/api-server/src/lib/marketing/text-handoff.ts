import { strToU8, zipSync } from 'fflate'
import { MARKETING_TEXTS, MARKETING_TEXT_URL } from '@workspace/shared/marketing-texts'

export const TEXT_HANDOFF_INSTRUCTIONS = `Patient Pipeline — Dr. Jason's marketing text handoff

This package contains 20 ordered messages for Dr. Jason's existing chiropractor clients who offer chiropractic and ChiroThin. Red light and SoftWave wording is conditional on the recipient offering those services.

1. Open texts.csv in a spreadsheet using UTF-8. It includes the complete message bodies, with paragraph breaks inside quoted cells. Alternatively, use the numbered UTF-8 files in texts/ or read SEQUENCE.txt.
2. Replace Dr. [Last Name] with the correct recipient name, or replace [Last Name] with a platform-specific last-name field ONLY after verifying that field in your sending platform. No GoHighLevel last-name merge tag has been assumed. Preview with a real test contact; never send the literal placeholder.
3. Keep the full body, paragraph breaks, punctuation, sender identity, and exact tracking URL. These are long-form marketing texts and may use multiple SMS segments; check platform length limits and costs before loading.
4. Numbers 01–20 are sequence order, NOT sending dates or a delivery schedule. Choose sending dates separately. Confirm permission to contact recipients, sender setup, applicable messaging rules, and the sending platform's opt-out handling before sending. Review a test message in your external platform.
5. This library and download do not send, schedule, import recipients, or launch campaigns. An assistant loads the messages externally. External imports do not update automatically; replace them manually if you download revised copy.

Tracking URL (unchanged in every message):
${MARKETING_TEXT_URL}

Read-only database verification on October 12, 2026: the existing link, its source, and its destination page were active. Its configured destination was /strategy-call (Strategy call). The redirect handler requires all three to be active. No link/source records were changed, no campaign events were created, and no messages were sent to verify this. This is a dated configuration check, not a promise that the link will remain active; recheck before sending.

All 20 texts share this link. It groups attribution together rather than distinguishing which text a recipient clicked. Do not replace it with per-message links.

Historical context: Dr. Jason used the original reactivation system in his former practice, has sold his offices, and does not currently use Patient Pipeline in an office. The 30–40% figure describes his former office's historical reactivation into a new plan of care—not one or two visits, and not a guaranteed Patient Pipeline result.
`

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

export function buildTextHandoff(): Uint8Array {
  const files: Record<string, Uint8Array> = {
    'START-HERE.txt': strToU8(TEXT_HANDOFF_INSTRUCTIONS),
    'texts.csv': strToU8('\uFEFF' + [
      ['Sequence order', 'Title', 'Message body', 'Tracking URL'],
      ...MARKETING_TEXTS.map(text => [
        String(text.number).padStart(2, '0'), text.title, text.body, MARKETING_TEXT_URL,
      ]),
    ].map(row => row.map(csvCell).join(',')).join('\r\n')),
    'SEQUENCE.txt': strToU8(MARKETING_TEXTS.map(text =>
      `Text ${String(text.number).padStart(2, '0')} — ${text.title}\n\n${text.body}`,
    ).join('\n\n' + '='.repeat(72) + '\n\n')),
  }
  for (const text of MARKETING_TEXTS) {
    files[`texts/${String(text.number).padStart(2, '0')}.txt`] = strToU8(text.body)
  }
  return zipSync(files, { level: 6 })
}
