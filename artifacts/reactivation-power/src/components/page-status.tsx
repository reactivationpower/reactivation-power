import { Loader2 } from 'lucide-react'

export function PageLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
      <Loader2 className="mr-2 size-5 animate-spin" aria-hidden="true" />
      <span className="text-sm">Loading…</span>
    </div>
  )
}

export function PageError({ error }: { error: Error }) {
  return (
    <div className="mx-auto my-12 max-w-lg rounded-lg border border-destructive/30 bg-destructive/5 p-6">
      <h1 className="font-semibold text-foreground">Unable to load this page</h1>
      <p className="mt-2 text-sm text-destructive" role="alert">
        {error.message}
      </p>
    </div>
  )
}