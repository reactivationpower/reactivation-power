import { useParams } from 'wouter'
import { useQuery } from '@tanstack/react-query'
import { loadPage } from '@/lib/api'
import { usePageMeta } from '@/components/marketing/use-page-meta'
import type { LeadTermsVersion } from '@workspace/shared/lead-terms'

export default function TermsPage() {
  usePageMeta('Terms of Service | Patient Pipeline', 'Published Terms of Service of Beyond Healthcare LLC for Patient Pipeline.')
  const { id = '' } = useParams<{ id: string }>()
  const q = useQuery({ queryKey: ['terms', id], queryFn: () => loadPage<{ version: LeadTermsVersion }>(`/terms/${encodeURIComponent(id)}`), retry: false })
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      {q.isLoading ? <div className="space-y-3" data-testid="terms-skeleton">{[0, 1, 2, 3].map((i) => <div key={i} className="h-4 animate-pulse rounded bg-muted" />)}</div>
        : q.isError || !q.data ? (
          <div role="alert" data-testid="terms-load-error"><p className="font-medium">These terms could not be found.</p>
            <button className="mt-2 text-sm underline" onClick={() => q.refetch()}>Retry</button></div>
        ) : (
          <article>
            <h1 className="text-2xl font-semibold" data-testid="text-terms-label">{q.data.version.label}</h1>
            <p className="mt-1 text-xs text-muted-foreground">Published {new Date(q.data.version.published_at).toLocaleString()}</p>
            <div className="mt-6 whitespace-pre-wrap break-words text-sm leading-relaxed" data-testid="text-terms-content">{q.data.version.content}</div>
          </article>
        )}
    </main>
  )
}
