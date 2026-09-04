'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { maskPhone } from '@/lib/phone'

type Props = Omit<
  React.ComponentProps<typeof Input>,
  'value' | 'onChange' | 'defaultValue' | 'type'
> & {
  /** Initial stored value (any format) — masked on mount */
  defaultValue?: string | null
  /** Controlled value; when provided, defaultValue is ignored */
  value?: string
  onValueChange?: (masked: string) => void
}

/**
 * Phone field that formats as (555) 555-1234 from the FIRST digit typed.
 * Works uncontrolled (submits via `name`) or controlled via value/onValueChange.
 */
export function PhoneInput({
  defaultValue,
  value,
  onValueChange,
  ...rest
}: Props) {
  const [inner, setInner] = useState(() => maskPhone(defaultValue ?? ''))
  const shown = value !== undefined ? value : inner

  return (
    <Input
      {...rest}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      value={shown}
      onChange={(e) => {
        const masked = maskPhone(e.target.value)
        if (value === undefined) setInner(masked)
        onValueChange?.(masked)
      }}
      placeholder={rest.placeholder ?? '(555) 555-1234'}
    />
  )
}
