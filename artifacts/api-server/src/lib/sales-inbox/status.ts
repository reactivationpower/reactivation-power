/** Provider acceptance is not carrier delivery. Unknown values stay unknown. */
export function canonicalSmsStatus(raw: unknown) {
  const status = String(raw ?? '').toLowerCase()
  if (['pending','queued','accepted'].includes(status)) return 'accepted'
  if (['failed','undelivered'].includes(status)) return 'failed'
  if (['delivered','received','read','sent','sending','uncertain'].includes(status)) return status
  return 'unknown'
}
