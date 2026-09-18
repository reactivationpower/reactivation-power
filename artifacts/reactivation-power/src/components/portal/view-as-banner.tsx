// @ts-nocheck

import { Link } from 'wouter'
import { Eye } from 'lucide-react'
import { usePageData } from '@/hooks/use-page-data'

/**
 * Shown when a super admin opened this portal account via "View as client".
 * The admin cookie is untouched, so the admin area is one click away.
 */
export function ViewAsBanner() {
  const { data } = usePageData<any>('/portal/_layout')
  const viewingAs = data?.viewingAs
  const participant = data?.participant
  if (!viewingAs || !participant) return null
  return (
    <div
      className="flex items-center justify-center gap-3 bg-amber-100 px-4 py-2 text-sm text-amber-950"
      data-testid="banner-view-as"
    >
      <Eye className="size-4" />
      <span>
        Viewing as <strong>{participant.first_name} {participant.last_name}</strong> ({participant.email}) — signed in as admin {viewingAs.email}
      </span>
      <Link href={`/admin/participants/${participant.id}`} className="font-medium underline underline-offset-2">
        Back to admin
      </Link>
    </div>
  )
}
