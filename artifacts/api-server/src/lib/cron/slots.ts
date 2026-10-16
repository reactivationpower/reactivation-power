/**
 * Daily-slot arithmetic shared by the scheduler, the HTTP trigger and the
 * dashboard. A slot is identified by the America/New_York calendar day
 * (YYYY-MM-DD) of the run it stands for; claiming that key in cron_runs is
 * what makes "once a day" hold across instances and trigger types.
 */

const ET = 'America/New_York'

function etParts(d: Date): { y: number; mo: number; d: number; h: number } {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: ET,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(d)
  const get = (t: string) => Number(f.find((p) => p.type === t)?.value ?? '0')
  // Some engines format midnight as "24".
  return { y: get('year'), mo: get('month'), d: get('day'), h: get('hour') % 24 }
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * The due key for a job at `now`: the ET date of the latest daily slot that
 * has already started. Before the slot hour it is yesterday's date.
 */
export function dueKeyFor(hourEt: number, now: Date = new Date()): string {
  const p = etParts(now)
  if (p.h >= hourEt) return `${p.y}-${pad(p.mo)}-${pad(p.d)}`
  // Step back one calendar day using UTC arithmetic on the ET date parts.
  const prev = new Date(Date.UTC(p.y, p.mo - 1, p.d) - 24 * 60 * 60_000)
  return `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}-${pad(prev.getUTCDate())}`
}

/** Hours elapsed since the slot for `dueKey` at `hourEt` ET began. */
export function hoursSinceSlot(dueKey: string, hourEt: number, now: Date = new Date()): number {
  // Find the UTC instant of `dueKey hourEt:00 ET` by probing the ET offset at that date.
  const [y, mo, d] = dueKey.split('-').map(Number)
  const guess = Date.UTC(y, mo - 1, d, hourEt + 5) // ET is UTC-4/-5; start from -5 and correct
  const parts = etParts(new Date(guess))
  const offsetHours = (((parts.h - hourEt) % 24) + 24) % 24 // 0 when EST, 1 when EDT
  const slotStart = guess - offsetHours * 3_600_000
  return (now.getTime() - slotStart) / 3_600_000
}
