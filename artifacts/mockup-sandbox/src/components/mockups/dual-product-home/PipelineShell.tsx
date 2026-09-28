import { StaticLink } from './Shell'

// Header-only variant of Shell's SiteHeader: identical nav, links and layout,
// with the top-left Reactivation Power logo swapped for the Pipeline Power
// logo (2172x724, 3:1). Everything else (footer, copy, styles) is reused from
// the approved Shell untouched.

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/how-it-works', label: 'How It Works' },
] as const

export function SiteHeader() {
  const pathname = '/'

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2 md:px-6">
        <StaticLink href="/" aria-label="Pipeline Power — Home">
          <img
            src="/__mockup/images/pipeline-power-logo.png"
            alt="Pipeline Power — Every lead. Every past client. BOOKED!"
            width={2172}
            height={724}
            className="h-14 w-auto md:h-16"
          />
        </StaticLink>

        <nav aria-label="Main" className="flex items-center gap-1 md:gap-2">
          {NAV.map((item) => (
            <StaticLink
              key={item.href}
              href={item.href}
              className={`hidden rounded-md px-3 py-2 text-sm font-medium transition-colors sm:block ${
                pathname === item.href
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {item.label}
            </StaticLink>
          ))}
          <StaticLink
            href="/login"
            className="hidden rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground md:block"
          >
            Client Login
          </StaticLink>
          <StaticLink
            href="/schedule-a-call"
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
          >
            Schedule a Call
          </StaticLink>
        </nav>
      </div>
    </header>
  )
}
