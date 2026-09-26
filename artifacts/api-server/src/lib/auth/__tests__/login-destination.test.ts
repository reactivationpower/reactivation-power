import { describe, expect, it } from 'vitest'
import { resolveLoginDestination } from '../login-destination'

describe('resolveLoginDestination', () => {
  it.each(['', ' ', '/portal', '/portal/', '/portal?tab=courses', '/portal/#courses'])(
    'sends a normal login (%s) to the chooser regardless of product access',
    (next) => {
      expect(resolveLoginDestination(next)).toBe('/portal/start')
    },
  )

  it.each(['/portal/start', '/portal/campaigns/abc', '/portal/dialer', '/portal/course/example/video/123?from=email#play'])(
    'preserves the specific deep link %s',
    (next) => {
      expect(resolveLoginDestination(next)).toBe(next)
    },
  )

  it.each(['https://evil.example', '//evil.example', '/\\evil.example'])(
    'ignores unsafe return path %s',
    (next) => {
      expect(resolveLoginDestination(next)).toBe('/portal/start')
    },
  )
})