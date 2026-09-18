// @ts-nocheck

import { AdminLoginForm } from '@/components/admin/admin-login-form'



export default function AdminLoginPage() {
  const params = useParams();

  const searchParams = new URLSearchParams(window.location.search);
  const next  = searchParams.get("next ");
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <img
            src="/images/logo.png"
            alt="Reactivation Power"
            width={200}
            height={60}
            className="h-auto w-[200px]"
            priority
          />
        </div>
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h1 className="mb-1 text-lg font-semibold text-foreground">
            Admin access
          </h1>
          <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
            Enter the admin password to continue.
          </p>
          <AdminLoginForm next={next} />
        </div>
      </div>
    </main>
  )
}
