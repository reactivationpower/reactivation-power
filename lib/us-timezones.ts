/**
 * US timezones offered on the booking calendar, covering every DST wrinkle:
 * Arizona (no DST), Hawaii (no DST), Alaska. IANA zone names handle daylight
 * saving automatically.
 */
export const US_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Phoenix', label: 'Arizona (no DST)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)' },
] as const

export type UsTimezone = (typeof US_TIMEZONES)[number]['value']

export const DEFAULT_TIMEZONE: UsTimezone = 'America/New_York'

export function isUsTimezone(tz: string): tz is UsTimezone {
  return US_TIMEZONES.some((z) => z.value === tz)
}

export function timezoneLabel(tz: string): string {
  return US_TIMEZONES.find((z) => z.value === tz)?.label ?? tz
}
