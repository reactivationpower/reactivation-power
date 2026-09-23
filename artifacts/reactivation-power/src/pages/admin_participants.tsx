// @ts-nocheck
import { useSearch } from 'wouter';
import { Link } from "wouter";
import { formatDuration } from '@workspace/shared/format'
import { Badge } from '@/components/ui/badge'
import { NewParticipantButton } from '@/components/admin/new-participant-dialog'
import { ViewerSearch } from '@/components/admin/viewer-search'
import { formatDateTime } from '@workspace/shared/format'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'

export default function ViewersPage() {
  const searchParams = new URLSearchParams(useSearch())
  const q = searchParams.get('q') || '';
  const openNew = searchParams.get('new');
  const status = searchParams.get('status') || 'active';
  const { data, loading, error } = usePageData<any>('/admin/participants', {
    q, new: openNew ?? undefined, status,
  })
  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />
  const { showDisabled, viewers, videoCount, query, activeCount, disabledCount, owners, staffByParent } = data

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-accent">Training</p>
          <h1 className="mt-1 text-3xl font-bold text-foreground">Viewers</h1>
          <p className="mt-1 text-muted-foreground">
            Everyone who can enter the email gate — click a viewer for their
            full activity profile
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {owners.length} viewer{owners.length === 1 ? '' : 's'}
          </span>
          <NewParticipantButton
            owners={viewers
              .filter((v) => v.role === 'owner')
              .map((v) => ({
                id: v.id,
                name: `${v.first_name} ${v.last_name}`,
              }))}
            defaultOpen={openNew === '1'}
          />
        </div>
      </div>

      <ViewerSearch initialQuery={q} />

      <div className="mt-4 flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1 w-fit">
        <Link
          href={`/admin/participants${q ? `?q=${encodeURIComponent(q)}` : ''}`}
          className={
            !showDisabled
              ? 'rounded-md bg-card px-4 py-1.5 text-sm font-medium text-foreground shadow-sm'
              : 'rounded-md px-4 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground'
          }
        >
          Active ({activeCount})
        </Link>
        <Link
          href={`/admin/participants?status=disabled${q ? `&q=${encodeURIComponent(q)}` : ''}`}
          className={
            showDisabled
              ? 'rounded-md bg-card px-4 py-1.5 text-sm font-medium text-foreground shadow-sm'
              : 'rounded-md px-4 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground'
          }
        >
          Disabled ({disabledCount})
        </Link>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left">
              <th className="p-4 font-medium uppercase tracking-wider text-muted-foreground text-xs">
                Name
              </th>
              <th className="p-4 font-medium uppercase tracking-wider text-muted-foreground text-xs">
                Email
              </th>
              <th className="p-4 font-medium uppercase tracking-wider text-muted-foreground text-xs">
                Phone
              </th>
              <th className="p-4 font-medium uppercase tracking-wider text-muted-foreground text-xs">
                Staff
              </th>
              <th className="p-4 text-right font-medium uppercase tracking-wider text-muted-foreground text-xs">
                Sessions
              </th>
              <th className="p-4 text-right font-medium uppercase tracking-wider text-muted-foreground text-xs">
                Watch time
              </th>
              <th className="p-4 text-right font-medium uppercase tracking-wider text-muted-foreground text-xs">
                Progress
              </th>
              <th className="p-4 text-right font-medium uppercase tracking-wider text-muted-foreground text-xs">
                Last seen
              </th>
            </tr>
          </thead>
          <tbody>
            {owners.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="p-8 text-center text-muted-foreground"
                >
                  {query
                    ? 'No viewers match your search.'
                    : showDisabled
                      ? 'No disabled participants.'
                      : 'No participants yet. Add your first participant to grant course access.'}
                </td>
              </tr>
            )}
            {owners.map((viewer) => {
              const staff = staffByParent[viewer.id] ?? []
              return (
                <tr
                  key={viewer.id}
                  className="border-b border-border last:border-b-0 hover:bg-muted/30"
                >
                  <td className="p-4">
                    <Link
                      href={`/admin/participants/${viewer.id}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {viewer.first_name} {viewer.last_name}
                    </Link>
                    {viewer.is_demo && (
                      <Badge
                        variant="outline"
                        className="ml-2 border-accent/40 text-accent"
                        title={viewer.practice_name ?? undefined}
                      >
                        Demo
                      </Badge>
                    )}
                    {!viewer.is_active && (
                      <Badge
                        variant="outline"
                        className="ml-2 border-destructive/40 text-destructive"
                      >
                        Disabled
                      </Badge>
                    )}
                  </td>
                  <td className="p-4 text-muted-foreground">{viewer.email}</td>
                  <td className="p-4 text-muted-foreground">
                    {viewer.phone ?? '—'}
                  </td>
                  <td className="p-4 text-muted-foreground">
                    {staff.length > 0 ? `${staff.length} / 3` : '—'}
                  </td>
                  <td className="p-4 text-right text-foreground">
                    {viewer.sessionCount}
                  </td>
                  <td className="p-4 text-right text-foreground">
                    {formatDuration(viewer.watchSeconds)}
                  </td>
                  <td className="p-4 text-right text-foreground">
                    {viewer.completedVideos}/{videoCount}
                  </td>
                  <td className="p-4 text-right text-muted-foreground">
                    {formatDateTime(viewer.lastSeen)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
