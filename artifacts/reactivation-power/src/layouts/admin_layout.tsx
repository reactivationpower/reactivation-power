import type React from 'react'
import { AdminSidebar } from '@/components/admin/sidebar'
import type { AdminIdentity } from '@/app/actions/admin-auth'
import { UploadTray } from '@/components/admin/upload-tray'
import { Toaster } from '@/components/ui/sonner'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'
import { AuthenticatedSession } from '@/components/authenticated-session'

const ROLE_LABEL = { super_admin: 'Super Admin', sales_rep: 'Sales Rep' } as const

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AuthenticatedSession kind="admin"><AdminContent>{children}</AdminContent></AuthenticatedSession>
}

function AdminContent({ children }: { children: React.ReactNode }) {
  const { data, loading, error } = usePageData<{ admin: AdminIdentity }>('/admin/_layout')
  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />
  const admin = data?.admin ?? null
  const displayName = admin?.name || admin?.email || 'Admin'
  const initial = displayName.trim().charAt(0).toUpperCase() || 'A'

  return (
    <div className="flex min-h-screen">
      <AdminSidebar admin={admin} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-border bg-card px-6">
          <p className="text-sm text-muted-foreground">Training Admin</p>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {initial}
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-semibold leading-tight text-foreground" data-testid="text-admin-name">
                {displayName}
              </p>
              <p className="text-xs leading-tight text-muted-foreground" data-testid="text-admin-role">
                {admin ? ROLE_LABEL[admin.role] : ''}
              </p>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
      </div>
      <UploadTray />
      <Toaster position="bottom-right" richColors closeButton />
    </div>
  )
}
