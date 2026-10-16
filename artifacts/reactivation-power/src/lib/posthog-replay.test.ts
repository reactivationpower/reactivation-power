import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { CaptureResult, PostHog } from 'posthog-js'
import { isPublicPagePath, toAppPath } from '@/lib/posthog-public-pages'
import { __redactionTesting, observeUrl, redactUrl, scrubText } from '@/lib/posthog-redaction'
import {
  __testing, enterPublicPage, installPostHogRouteGuard, leavePublicPage, postHogReplayEnabled,
} from '@/lib/posthog-replay'

const LIVE_ENV = { MODE: 'development', BASE_URL: '/', VITE_POSTHOG_KEY: 'phc_test', VITE_POSTHOG_HOST: 'https://us.i.posthog.com' }

function fakePostHog() {
  const calls: string[] = []
  const client = {
    init: vi.fn(() => { calls.push(`init@${window.location.pathname}`) }),
    capture: vi.fn((name: string) => { calls.push(`capture:${name}@${window.location.pathname}`) }),
    set_config: vi.fn((config: Record<string, unknown>) => {
      calls.push(`${config.disable_session_recording ? 'off' : 'on'}@${window.location.pathname}`)
    }),
    identify: vi.fn(),
  }
  return { client, calls, loader: vi.fn(async () => client as unknown as PostHog) }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const go = (path: string) => window.history.pushState(null, '', path)

beforeAll(() => installPostHogRouteGuard())
afterEach(() => {
  __testing.reset()
  __redactionTesting.reset()
  window.history.replaceState(null, '', '/')
})

describe('public page allow-list', () => {
  it.each([
    '/', '/how-it-works', '/healthcare', '/healthcare/thank-you', '/strategy-call/schedule',
    '/schedule-a-call/confirmation', '/walkthrough', '/training-demo/video-2', '/demo',
    '/affiliates/apply', '/terms/abc', '/agreements/tok', '/billing', '/billing/tok', '/pay/tok',
    '/pay/tok/thank-you', '/login', '/admin-login', '/affiliates/access', '/login/', '/LOGIN',
    '/login?next=/portal',
  ])('records %s', (path) => expect(isPublicPagePath(path)).toBe(true))

  it.each([
    '/portal', '/portal/contacts/1', '/portal/leads/practice', '/admin', '/admin/customers/1',
    '/affiliates', '/affiliates/onboarding', '/resellers', '/resellers/onboarding',
    '/resellers/customers/1', '/analytics-test', '/some-new-page', '/pay/tok/extra',
    '/agreements', '/terms', '/healthcare/other', '/PORTAL', '//portal', '/login/x',
  ])('never records %s', (path) => expect(isPublicPagePath(path)).toBe(false))

  it('treats paths outside the app base as private', () => {
    expect(toAppPath('/app/login', '/app/')).toBe('/login')
    expect(toAppPath('/app', '/app/')).toBe('/')
    expect(toAppPath('/other/login', '/app/')).toBeNull()
    expect(toAppPath('/login', '/')).toBe('/login')
  })
})

describe('PostHog start and stop', () => {
  it('never starts during tests or without a key', async () => {
    const fake = fakePostHog()
    __testing.reset({ env: { ...LIVE_ENV, MODE: 'test' }, loader: fake.loader })
    expect(postHogReplayEnabled()).toBe(false)
    enterPublicPage()
    __testing.reset({ env: { ...LIVE_ENV, VITE_POSTHOG_KEY: '' }, loader: fake.loader })
    expect(postHogReplayEnabled()).toBe(false)
    enterPublicPage()
    await flush()
    expect(fake.loader).not.toHaveBeenCalled()
  })

  it('never loads PostHog when the visitor lands on a private page', async () => {
    const fake = fakePostHog()
    __testing.reset({ env: LIVE_ENV, loader: fake.loader })
    go('/portal')
    enterPublicPage()
    leavePublicPage()
    await flush()
    expect(fake.loader).not.toHaveBeenCalled()
  })

  it('starts on a public page with nothing masked and never identifies anyone', async () => {
    const fake = fakePostHog()
    __testing.reset({ env: LIVE_ENV, loader: fake.loader })
    go('/login')
    enterPublicPage()
    await flush()
    expect(fake.client.init).toHaveBeenCalledTimes(1)
    const [key, config] = fake.client.init.mock.calls[0] as unknown as [string, Record<string, any>]
    expect(key).toBe('phc_test')
    expect(config.api_host).toBe('https://us.i.posthog.com')
    expect(config.respect_dnt).toBe(false)
    expect(config.capture_pageview).toBe(false)
    // Masking functions see every value and return it unchanged (owner decision).
    const replay = config.session_recording
    expect(replay.maskInputFn('my-secret-password')).toBe('my-secret-password')
    expect(replay.maskTextFn('Sign in')).toBe('Sign in')
    expect(replay.maskTextSelector).toBe('*')
    expect(replay.blockSelector).toContain('input[type="hidden"]')
    expect(config.disable_capture_url_hashes).toBe(true)
    expect(fake.calls).toEqual(['init@/login', 'capture:$pageview@/login'])
    expect(fake.client.identify).not.toHaveBeenCalled()
  })

  it('switches off before the address becomes private and back on after a public page renders', async () => {
    const fake = fakePostHog()
    __testing.reset({ env: LIVE_ENV, loader: fake.loader })
    go('/login')
    enterPublicPage()
    await flush()
    fake.calls.length = 0

    go('/portal')
    // Switched off while the address was still the public login page.
    expect(fake.calls).toEqual(['off@/login'])
    expect(__testing.isActive()).toBe(false)
    expect(__testing.guardEvent({ event: '$pageview', properties: {} } as unknown as CaptureResult)).toBeNull()
    expect(__testing.guardEvent({ event: '$autocapture', properties: {} } as unknown as CaptureResult)).toBeNull()
    // The tail of the public recording keeps its public address.
    const tail = __testing.guardEvent({
      event: '$snapshot', properties: { $current_url: 'http://localhost:3000/portal', $pathname: '/portal' },
    } as unknown as CaptureResult)
    expect(tail?.properties).toMatchObject({ $current_url: 'http://localhost:3000/login', $pathname: '/login' })

    leavePublicPage()
    go('/portal/contacts/1')
    expect(fake.calls).toEqual(['off@/login'])

    go('/')
    expect(fake.calls).toEqual(['off@/login'])
    enterPublicPage()
    expect(fake.calls).toEqual(['off@/login', 'on@/', 'capture:$pageview@/'])
    expect(__testing.guardEvent({ event: '$pageview', properties: {} } as unknown as CaptureResult)).not.toBeNull()
  })

  it('switches off on the back button to a private page', async () => {
    const fake = fakePostHog()
    __testing.reset({ env: LIVE_ENV, loader: fake.loader })
    go('/admin')
    go('/admin-login')
    enterPublicPage()
    await flush()
    fake.calls.length = 0
    window.history.back()
    await new Promise<void>((resolve) => window.addEventListener('popstate', () => resolve(), { once: true }))
    expect(window.location.pathname).toBe('/admin')
    expect(fake.calls).toEqual(['off@/admin'])
  })

  it('does not start if the visitor moved to a private page while PostHog downloaded', async () => {
    const fake = fakePostHog()
    __testing.reset({ env: LIVE_ENV, loader: fake.loader })
    go('/pay/tok')
    enterPublicPage()
    go('/portal')
    await flush()
    expect(fake.client.init).not.toHaveBeenCalled()
    go('/pay/tok')
    enterPublicPage()
    await flush()
    expect(fake.client.init).toHaveBeenCalledTimes(1)
  })
})

const TOKEN = 'tok_abcdefghijklmnop1234'

describe('one-time link tokens', () => {
  it('redacts link tokens from addresses and keeps marketing values', () => {
    const origin = 'http://localhost:3000'
    observeUrl(`/pay/${TOKEN}/thank-you?utm_source=mail&secret=${TOKEN}x#frag`, origin, '/')
    expect(redactUrl(`${origin}/pay/${TOKEN}/thank-you?utm_source=mail&secret=zzz#frag`, origin, '/'))
      .toBe(`${origin}/pay/:token/thank-you?utm_source=mail`)
    expect(redactUrl(`/agreements/${TOKEN}`, origin, '/')).toBe('/agreements/:token')
    expect(redactUrl(`/billing/${TOKEN}`, origin, '/')).toBe('/billing/:token')
    expect(scrubText(`Download /api/agreements/${TOKEN}/pdf`)).toBe('Download /api/agreements/[redacted]/pdf')
    expect(scrubText(`${TOKEN}x`)).toBe('[redacted]')
  })

  it('keeps only the site and path of addresses on other sites', () => {
    const origin = 'http://localhost:3000'
    expect(redactUrl('https://checkout.example.com/c/pay?client_secret=abc#frag', origin, '/'))
      .toBe('https://checkout.example.com/c/pay')
    expect(redactUrl('mailto:help@example.com', origin, '/')).toBe('mailto:help@example.com')
    expect(redactUrl('#pricing', origin, '/')).toBe('#')
  })

  it('records the sign-in page after an inactivity logout but never sends the session id', async () => {
    const fake = fakePostHog()
    __testing.reset({ env: LIVE_ENV, loader: fake.loader })
    const sessionId = 'sess_0123456789abcdef'
    go(`/login?reason=inactivity&session=${sessionId}`)
    enterPublicPage()
    await flush()
    expect(fake.client.init).toHaveBeenCalledTimes(1)
    const event = __testing.guardEvent({
      event: '$pageview',
      properties: { $current_url: window.location.href, title: `x ${sessionId}` },
      $set_once: { $initial_current_url: window.location.href },
    } as unknown as CaptureResult)
    expect(JSON.stringify(event)).not.toContain(sessionId)
    expect(event?.properties.$current_url).toBe('http://localhost:3000/login?reason=inactivity')
    const replay = (fake.client.init.mock.calls[0]![1] as unknown as Record<string, any>).session_recording
    expect(replay.maskCapturedNetworkRequestFn({ name: window.location.href }).name)
      .toBe('http://localhost:3000/login?reason=inactivity')
  })

  it.each([
    `/admin-login?token_hash=${TOKEN}&type=invite`,
    `/admin-login#access_token=${TOKEN}&type=invite`,
    `/affiliates/access#token=${TOKEN}`,
    `/affiliates/access#${TOKEN}`,
    `/affiliates/access?accessId=${TOKEN}`,
    `/login?setup=${TOKEN}`,
  ])('never records a sign-in page opened from a token link: %s', async (url) => {
    const fake = fakePostHog()
    __testing.reset({ env: LIVE_ENV, loader: fake.loader })
    go(url)
    enterPublicPage()
    // The page removes the token from the address; the visit stays private.
    window.history.replaceState(null, '', new URL(url, window.location.href).pathname)
    enterPublicPage()
    await flush()
    expect(fake.loader).not.toHaveBeenCalled()
    // Moving to another public page records again.
    go('/how-it-works')
    enterPublicPage()
    await flush()
    expect(fake.client.init).toHaveBeenCalledTimes(1)
  })

  it('records ordinary sign-in visits', async () => {
    const fake = fakePostHog()
    __testing.reset({ env: LIVE_ENV, loader: fake.loader })
    go('/login?next=%2Fportal&email=a%40b.co&reason=inactivity')
    enterPublicPage()
    await flush()
    expect(fake.client.init).toHaveBeenCalledTimes(1)
  })

  it('removes tokens from every event and from replay addresses on a link page', async () => {
    const fake = fakePostHog()
    __testing.reset({ env: LIVE_ENV, loader: fake.loader })
    go(`/agreements/${TOKEN}?k=${TOKEN}`)
    enterPublicPage()
    await flush()
    const event = __testing.guardEvent({
      event: '$autocapture',
      properties: {
        $current_url: window.location.href,
        $pathname: window.location.pathname,
        $elements_chain: `a:href="/api/agreements/${TOKEN}/pdf"`,
        title: `Agreement ${TOKEN}`,
        nested: [{ $session_entry_url: window.location.href }],
      },
      $set_once: { $initial_current_url: window.location.href },
    } as unknown as CaptureResult)
    const sent = JSON.stringify(event)
    expect(sent).not.toContain(TOKEN)
    expect(event?.properties.$current_url).toBe('http://localhost:3000/agreements/:token')
    expect(event?.properties.$pathname).toBe('/agreements/:token')

    const config = fake.client.init.mock.calls[0]![1] as unknown as Record<string, any>
    const replay = config.session_recording
    expect(replay.maskInputFn(TOKEN)).toBe('[redacted]')
    expect(replay.maskTextFn(`link ${TOKEN}`)).toBe('link [redacted]')
    expect(replay.maskAttributeFn('href', `/agreements/${TOKEN}#x`)).toBe('/agreements/:token')
    expect(replay.maskAttributeFn('data-x', `v-${TOKEN}`)).toBe('v-[redacted]')
    expect(replay.maskCapturedNetworkRequestFn({ name: window.location.href, requestBody: TOKEN }))
      .toEqual(expect.objectContaining({ name: 'http://localhost:3000/agreements/:token', requestBody: undefined }))
  })
})
