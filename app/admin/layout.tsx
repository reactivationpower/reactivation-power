import type React from 'react'
import { AdminSidebar } from '@/components/admin/sidebar'
import { UploadTray } from '@/components/admin/upload-tray'

export const metadata = {
  title: 'Admin | Training Portal',
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-border bg-card px-6">
          <p className="text-sm text-muted-foreground">Training Admin</p>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              A
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-semibold leading-tight text-foreground">
                Admin
              </p>
              <p className="text-xs leading-tight text-muted-foreground">
                Super Admin
              </p>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
      </div>
      <UploadTray />
    </div>
  )
}
