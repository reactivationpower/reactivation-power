/**
 * Format up to 10 US digits as (555) 555-1234 while typing. Formatting
 * kicks in from the FIRST digit ("(5") so the caller sees the shape
 * immediately, not after the third character.
 */
export function maskPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').replace(/^1(?=\d{10})/, '').slice(0, 10)
  if (d.length === 0) return ''
  if (d.length < 4) return `(${d}`
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

/** Display an already-stored phone in the (555) 555-1234 shape. */
export function formatPhone(stored: string | null | undefined): string {
  if (!stored) return ''
  const d = stored.replace(/\D/g, '')
  const local = d.length === 11 && d.startsWith('1') ? d.slice(1) : d
  if (local.length !== 10) return stored
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`
}
