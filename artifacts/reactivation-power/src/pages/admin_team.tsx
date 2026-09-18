// @ts-nocheck
import { TeamManager } from '@/components/admin/team-manager'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'

export default function AdminTeamPage() {
  const { data, loading, error } = usePageData<any>('/admin/team')
  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />
  const { members, currentUserId } = data

  return (
    <div className="flex h-full flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Team</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Admin accounts for your staff. Invite salespeople as sales reps with
          a default commission rate, or add more super admins with full access.
        </p>
      </header>
      <div className="min-h-0 flex-1">
        <TeamManager members={members} currentUserId={currentUserId} />
      </div>
    </div>
  )
}
