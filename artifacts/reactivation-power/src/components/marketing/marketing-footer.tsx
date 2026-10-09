export function MarketingFooter() {
  return (
    <footer className="w-full border-t border-border bg-card">
      <div className="mx-auto max-w-6xl px-4 py-8 text-center text-sm text-muted-foreground md:px-6">
        <p className="font-medium text-foreground">Patient Pipeline</p>
        <p className="mt-1">Patient reactivation and lead follow-up for healthcare practices.</p>
        <p className="mt-3 text-xs">&copy; {new Date().getFullYear()} Patient Pipeline. All rights reserved.</p>
      </div>
    </footer>
  )
}
