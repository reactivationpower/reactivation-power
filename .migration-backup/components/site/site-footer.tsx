import Image from 'next/image'
import Link from 'next/link'

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-4 py-10 text-center md:px-6">
        <Image
          src="/images/logo-slogan.png"
          alt="Reactivation Power — Turning Old Business Into New Business & New Money!"
          width={1189}
          height={578}
          className="h-14 w-auto"
        />
        <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-6 gap-y-2">
          <Link
            href="/"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Home
          </Link>
          <Link
            href="/how-it-works"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            How It Works
          </Link>
          <Link
            href="/schedule-a-call"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Schedule a Call
          </Link>
          <Link
            href="/login"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Client Login
          </Link>
        </nav>
        <p className="text-xs text-muted-foreground">
          {`© ${new Date().getFullYear()} Reactivation Power. All rights reserved.`}
        </p>
      </div>
    </footer>
  )
}
