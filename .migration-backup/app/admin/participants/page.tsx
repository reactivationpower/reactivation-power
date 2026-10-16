import Link from 'next/link'
import { getViewerRows, formatDuration } from '@/lib/data/analytics'
import { getAdminClient } from '@/lib/supabase/admin'
import { Badge } from '@/components/ui/badge'
import { NewParticipantButton } from '@/components/admin/new-participant-dialog'
import { ViewerSearch } from '@/components/admin/viewer-search'
import { formatDateTime } from '@/lib/format'

export default async function ViewersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; new?: string; status?: string }>
}) {
  const { q = '', new: openNew, status = 'active' } = await searchParams
  const showDisabled = status === 'disabled'
  const [viewers, videoCount] = await Promise.all([
    getViewerRows(),
    (async () => {
      const supabase = getAdminClient()
      const { count } = await supabase
        .from('videos')
        .select('id', { count: 'exact', head: true })
      return count ?? 0
    })(),
  ])

  const query = q.trim().toLowerCase()
  const filtered = query
    ? viewers.filter(
        (v) =>
          `${v.first_name} ${v.last_name}`.toLowerCase().includes(query) ||
          v.email.toLowerCase().includes(query) ||
          (v.phone ?? '').toLowerCase().includes(query),
      )
    : viewers

  const allOwners = filtered.filter((v) => v.role === 'owner')
  const activeCount = allOwners.filter((v) => v.is_active).length
  const disabledCount = allOwners.length - activeCount
  const owners = allOwners.filter((v) =>
    showDisabled ? !v.is_active : v.is_active,
  )
  const staffByParent = new Map<string, typeof filtered>()
  for (const v of viewers.filter((v) => v.role === 'staff')) {
    const list = staffByParent.get(v.parent_id!) ?? []
    list.push(v)
    staffByParent.set(v.parent_id!, list)
  }

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
              const staff = staffByParent.get(viewer.id) ?? []
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
