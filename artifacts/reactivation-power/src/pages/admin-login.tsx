// @ts-nocheck

import { useMemo } from 'react'
import { useSearch } from 'wouter'
import {
  AdminLoginForm,
  AdminSetPasswordForm,
  type InviteToken,
} from '@/components/admin/admin-login-form'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'

/** Read an invite token from the query string or the URL hash (Supabase). */
function readInviteToken(search: string): { token: InviteToken | null; hashError: string | null } {
  const query = new URLSearchParams(search)
  const tokenHash = query.get('token_hash')
  if (tokenHash) return { token: { tokenHash, type: query.get('type') ?? undefined }, hashError: null }

  const rawHash = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : ''
  if (!rawHash) return { token: null, hashError: null }
  const hash = new URLSearchParams(rawHash)
  const accessToken = hash.get('access_token')
  const type = hash.get('type')
  if (accessToken && (type === 'invite' || type === 'recovery' || type === 'magiclink' || type === 'signup')) {
    return { token: { accessToken, type }, hashError: null }
  }
  const description = hash.get('error_description') || hash.get('error')
  return { token: null, hashError: description ? description.replace(/\+/g, ' ') : null }
}

export default function AdminLoginPage() {
  const search = useSearch()
  const searchParams = new URLSearchParams(search)
  const requestedNext = searchParams.get('next') ?? undefined
  const { token, hashError } = useMemo(() => readInviteToken(search), [search])
  const { data, loading, error } = usePageData<any>('/admin-login', {
    next: requestedNext,
    reason: searchParams.get('reason') ?? undefined,
    session: searchParams.get('session') ?? undefined,
    token_hash: token?.tokenHash,
  })
  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />
  const { next } = data
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <img
            src="/images/patient-pipeline-logo.png"
            alt="Patient Pipeline"
            width={2172}
            height={724}
            className="h-auto w-[200px]"
          />
        </div>
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          {searchParams.get('reason') === 'inactivity' && (
            <p role="status" className="mb-4 text-sm text-muted-foreground">You were signed out after 30 minutes of inactivity. Please sign in again.</p>
          )}
          {token ? (
            <>
              <h1 className="mb-1 text-lg font-semibold text-foreground">
                Welcome to the team
              </h1>
              <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
                Choose a password to finish setting up your admin account.
              </p>
              <AdminSetPasswordForm token={token} />
            </>
          ) : (
            <>
              <h1 className="mb-1 text-lg font-semibold text-foreground">
                Admin access
              </h1>
              <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
                Sign in with your admin email and password.
              </p>
              {hashError ? (
                <p role="alert" className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  {hashError}. Ask an admin to send a new invite link.
                </p>
              ) : null}
              <AdminLoginForm next={next} />
            </>
          )}
        </div>
      </div>
    </main>
  )
}
