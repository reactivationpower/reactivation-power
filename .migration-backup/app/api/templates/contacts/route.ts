import { accessOwnerId, getCurrentParticipant } from '@/lib/data/participants'
import { getOwnerNiches } from '@/lib/data/reactivation'
import { getOwnerSectors } from '@/lib/data/courses'
import { suggestNicheForService } from '@/lib/niche-match'

/**
 * Personalized CSV upload template — doubles as the in-app demo file.
 *
 * ONE realistic sample patient per niche enabled on this account, so the
 * row count equals the niche count and every script the office owns is
 * represented. Two variants:
 *
 *   ?variant=niche     (default) includes a Niche column — the clean path,
 *                      every contact arrives tagged with the right script.
 *   ?variant=services  drops the Niche column and leaves only "Last Service"
 *                      labels, which lets a demo walk through the
 *                      service → niche mapping step.
 *
 * Service labels are chosen so the keyword matcher resolves them back to the
 * intended niche — so the "services" variant actually demos a clean match.
 */

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function csvRow(cells: string[]): string {
  return cells.map(csvCell).join(',')
}

/** Realistic office-speak for each niche: what the EHR would actually say */
const NICHE_SAMPLES: Record<string, { service: string; complaint: string }> = {
  Chiropractic: { service: 'Adjustment', complaint: 'Lower back pain' },
  Decompression: { service: 'Spinal Decompression', complaint: 'Herniated disc L4-L5' },
  Neuropathy: { service: 'Neuropathy Treatment', complaint: 'Numbness in both feet' },
  'Joint Pain': { service: 'Knee Injection', complaint: 'Right knee pain' },
  'Acoustic Wave Therapy': { service: 'Softwave', complaint: 'Plantar fasciitis' },
  Acupuncture: { service: 'Acupuncture', complaint: 'Migraines' },
  'Massage Therapy': { service: '60 min Massage', complaint: 'Neck and shoulder tension' },
  'Gut Health': { service: 'Gut Health Program', complaint: 'Bloating and IBS' },
  ChiroThin: { service: 'ChiroThin', complaint: '' },
  'Weight Loss (Not ChiroThin)': { service: 'Weight Loss Program', complaint: '' },
  'GLP Patients': { service: 'Semaglutide', complaint: '' },
  'Skin Tightening': { service: 'RF Skin Tightening', complaint: '' },
  'Cellulite Reduction': { service: 'Cellulite Treatment', complaint: '' },
  'Red Light / Body Contouring': { service: 'Red Light Therapy', complaint: '' },
  'Laser Hair Removal': { service: 'Laser Hair Removal', complaint: '' },
  'Body Waxing': { service: 'Brazilian Wax', complaint: '' },
  Botox: { service: 'Botox 40u', complaint: '' },
  'Teeth Whitening': { service: 'Zoom Whitening', complaint: '' },
  'Clear Aligners': { service: 'Invisalign Consult', complaint: '' },
  'Orthodontics / Braces': { service: 'Braces Consult', complaint: '' },
  'Dental Implants': { service: 'Implant Consult', complaint: 'Missing molar' },
  HVAC: { service: 'AC Tune-Up', complaint: '' },
  Plumbing: { service: 'Water Heater Service', complaint: '' },
}

/** Sample people — cycled in order so the file reads like a real list */
const PEOPLE: Array<{ first: string; last: string; note: string }> = [
  { first: 'Maria', last: 'Gonzalez', note: 'Prefers mornings' },
  { first: 'James', last: 'Whitaker', note: '' },
  { first: 'Priya', last: 'Natarajan', note: 'Ask about her daughter' },
  { first: 'Robert', last: 'Chen', note: '' },
  { first: 'Angela', last: 'Brooks', note: 'Moved last spring, still local' },
  { first: 'Marcus', last: 'Reed', note: '' },
  { first: 'Linda', last: 'Okafor', note: 'Call after 3pm' },
  { first: 'Daniel', last: 'Kim', note: '' },
  { first: 'Susan', last: 'Alvarez', note: 'Referred by her sister' },
  { first: 'Thomas', last: 'Nguyen', note: '' },
  { first: 'Karen', last: 'Fitzgerald', note: '' },
  { first: 'Miguel', last: 'Santos', note: 'Works nights' },
  { first: 'Rachel', last: 'Adler', note: '' },
  { first: 'Kevin', last: 'Patel', note: '' },
  { first: 'Denise', last: 'Harmon', note: 'Leave voicemail OK' },
  { first: 'Anthony', last: 'Rossi', note: '' },
  { first: 'Jessica', last: 'Thornton', note: '' },
  { first: 'Brian', last: 'Delgado', note: '' },
  { first: 'Patricia', last: 'Lindqvist', note: 'Snowbird — back in October' },
  { first: 'George', last: 'Abara', note: '' },
  { first: 'Heather', last: 'Moss', note: '' },
  { first: 'Samuel', last: 'Ortiz', note: '' },
  { first: 'Nicole', last: 'Bergman', note: '' },
]

/** Fake-but-valid-looking 555 numbers, deterministic per row */
function samplePhone(i: number): string {
  const area = ['407', '813', '561', '904', '727', '321', '941', '850'][i % 8]
  const line = String(100 + ((i * 37) % 900)).padStart(4, '0')
  return `(${area}) 555-${line}`
}

function sampleEmail(first: string, last: string): string {
  return `${first}.${last}@example.com`.toLowerCase().replace(/[^a-z0-9.@]/g, '')
}

export async function GET(request: Request) {
  const participant = await getCurrentParticipant()
  if (!participant) {
    return new Response('Not signed in', { status: 401 })
  }

  const url = new URL(request.url)
  const variant = url.searchParams.get('variant') === 'services' ? 'services' : 'niche'

  const ownerId = accessOwnerId(participant)
  const sectors = await getOwnerSectors(ownerId)
  const niches = await getOwnerNiches(ownerId, sectors)

  const headers =
    variant === 'niche'
      ? ['First Name', 'Last Name', 'Phone', 'Email', 'Niche', 'Last Service', 'Previously Treated For', 'Notes']
      : ['First Name', 'Last Name', 'Phone', 'Email', 'Last Service', 'Previously Treated For', 'Notes']

  const lines = [csvRow(headers)]

  niches.forEach((niche, i) => {
    const person = PEOPLE[i % PEOPLE.length]
    const sample = NICHE_SAMPLES[niche.name]
    // Fall back to the niche's own name as the service label — the matcher
    // resolves exact names, so the row still lands on the right script.
    let service = sample?.service ?? niche.name
    if (variant === 'services') {
      const hit = suggestNicheForService(service, niches)
      if (!hit || hit.id !== niche.id) service = niche.name
    }
    const cells = [
      person.first,
      person.last,
      samplePhone(i),
      sampleEmail(person.first, person.last),
    ]
    if (variant === 'niche') cells.push(niche.name)
    cells.push(service, sample?.complaint ?? '', person.note)
    lines.push(csvRow(cells))
  })

  const csv = `${lines.join('\r\n')}\r\n`
  const filename =
    variant === 'niche'
      ? 'reactivation-power-demo-with-niche.csv'
      : 'reactivation-power-demo-services-only.csv'

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
