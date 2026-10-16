// @ts-nocheck


import { Link } from "wouter";
import { useLocation, useParams } from "wouter";
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/how-it-works', label: 'How It Works' },
] as const

export function SiteHeader({ simplified = false }: { simplified?: boolean }) {
  const [pathname] = useLocation();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:gap-4 md:px-6">
        <Link href="/" aria-label="Patient Pipeline — Home" className="min-w-0 shrink">
          <img
            src="/images/patient-pipeline-logo.png"
            alt="Patient Pipeline"
            width={2172}
            height={724}
            className="h-14 w-auto max-w-full object-contain object-left md:h-16"
          />
        </Link>

        <nav aria-label="Main" className="flex shrink-0 items-center gap-1 md:gap-2">
          {!simplified && NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'hidden rounded-md px-3 py-2 text-sm font-medium transition-colors sm:block',
                pathname === item.href
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {item.label}
            </Link>
          ))}
          {!simplified && <Link
            href="/login"
            className="hidden rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground md:block"
          >
            Client Login
          </Link>}
          <Link
            href="/schedule-a-call"
            className={simplified
              ? "whitespace-nowrap rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent/90 sm:px-5 sm:text-[15px] md:px-7 md:py-3 md:text-base"
              : "rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"}
          >
            Schedule a Call
          </Link>
        </nav>
      </div>
    </header>
  )
}
