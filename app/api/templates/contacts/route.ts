import { accessOwnerId, getCurrentParticipant } from '@/lib/data/participants'
import { getOwnerNiches } from '@/lib/data/reactivation'
import { getOwnerSectors } from '@/lib/data/courses'

/**
 * Personalized CSV import template.
 *
 * The Niche column is the point of this file: an office exports their
 * patients from their own CRM, drops the niche each patient was treated
 * for into that column, and every contact arrives tagged with the right
 * script — so a caller working a mixed list never has to switch scripts
 * by hand. Sample rows are filled with this account's own niche names so
 * the spelling always matches.
 */

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function csvRow(cells: string[]): string {
  return cells.map(csvCell).join(',')
}

const HEADERS = [
  'First Name',
  'Last Name',
  'Phone',
  'Email',
  'Niche',
  'Last Service',
  'Previously Treated For',
  'Notes',
]

/** Realistic example content, matched to a niche where it makes sense */
const EXAMPLES: Array<{
  first: string
  last: string
  phone: string
  email: string
  service: string
  complaint: string
  notes: string
}> = [
  {
    first: 'SAMPLE - delete this row',
    last: 'Sample',
    phone: '(555) 123-4567',
    email: 'jane.sample@email.com',
    service: 'Initial exam',
    complaint: 'Lower back pain',
    notes: 'Prefers morning appointments',
  },
  {
    first: 'SAMPLE - delete this row',
    last: 'Example',
    phone: '555-987-6543',
    email: 'john.example@email.com',
    service: 'Follow-up visit',
    complaint: '',
    notes: 'Referred by his wife',
  },
  {
    first: 'SAMPLE - delete this row',
    last: 'Demo',
    phone: '(555) 555-0100',
    email: '',
    service: 'Package of 6',
    complaint: 'Tooth sensitivity',
    notes: 'Last visit was over a year ago',
  },
]

export async function GET() {
  const participant = await getCurrentParticipant()
  if (!participant) {
    return new Response('Not signed in', { status: 401 })
  }

  const ownerId = accessOwnerId(participant)
  const sectors = await getOwnerSectors(ownerId)
  const niches = await getOwnerNiches(ownerId, sectors)

  // One sample row per example, cycling through the account's own niches
  const lines = [csvRow(HEADERS)]
  EXAMPLES.forEach((ex, i) => {
    const nicheName = niches.length > 0 ? niches[i % niches.length].name : ''
    lines.push(
      csvRow([
        ex.first,
        ex.last,
        ex.phone,
        ex.email,
        nicheName,
        ex.service,
        ex.complaint,
        ex.notes,
      ]),
    )
  })

  const csv = `${lines.join('\r\n')}\r\n`

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition':
        'attachment; filename="reactivation-power-import-template.csv"',
      'Cache-Control': 'no-store',
    },
  })
}
