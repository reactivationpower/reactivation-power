import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { getAdminClient } from '@/lib/supabase/admin'
import { isAdminRole, type AdminRole } from '@/lib/auth/admin-token'
import { appOrigin } from '@/lib/app-origin'
import { sendEmail } from '@/lib/mail/send'

/**
 * Admin (staff) accounts live in Supabase Auth. The admin profile — role,
 * default commission rate, active flag — is stored in the user's
 * `app_metadata`, which only the service role can write, so it is
 * tamper-proof from the client. Deactivation additionally bans the auth
 * user so Supabase itself refuses the credentials.
 */

const ROLE_KEY = 'admin_role'
const ACTIVE_KEY = 'admin_active'
const SERVICES_KEY = 'admin_manage_services'
const RATE_KEY = 'default_commission_rate'
const INVITED_BY_KEY = 'invited_by'
const PERMANENT_BAN = '876000h' // ~100 years

export interface AdminUser {
  id: string
  email: string
  name: string | null
  role: AdminRole
  /** Default commission rate for this rep, as a percentage (0–100). */
  defaultCommissionRate: number
  active: boolean
  canManageServices: boolean
  invitedBy: string | null
  /** Set once the user has accepted the invite / set a password. */
  confirmedAt: string | null
  lastSignInAt: string | null
  createdAt: string
}

function fullName(user: User): string | null {
  const n = user.user_metadata?.full_name
  return typeof n === 'string' && n.trim() ? n.trim() : null
}

/** Map an auth user to an admin profile, or null if they are not an admin. */
export function toAdminUser(user: User): AdminUser | null {
  const meta = (user.app_metadata ?? {}) as Record<string, unknown>
  const role = meta[ROLE_KEY]
  if (!isAdminRole(role) || !user.email) return null
  const rate = Number(meta[RATE_KEY])
  return {
    id: user.id,
    email: user.email,
    name: fullName(user),
    role,
    defaultCommissionRate: Number.isFinite(rate) ? rate : 0,
    active: meta[ACTIVE_KEY] !== false,
    canManageServices: meta[SERVICES_KEY] === true,
    invitedBy: typeof meta[INVITED_BY_KEY] === 'string' ? (meta[INVITED_BY_KEY] as string) : null,
    confirmedAt: user.email_confirmed_at ?? null,
    lastSignInAt: user.last_sign_in_at ?? null,
    createdAt: user.created_at,
  }
}

/**
 * A throwaway auth client for credential checks. The shared service-role
 * client must never call signIn/verifyOtp: that would attach the user's
 * session to every later database call it makes.
 */
export function freshAuthClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const supabase = getAdminClient()
  const users: AdminUser[] = []
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(`Could not list admin users: ${error.message}`)
    for (const u of data.users) {
      const admin = toAdminUser(u)
      if (admin) users.push(admin)
    }
    if (data.users.length < 200) break
  }
  users.sort((a, b) => {
    if (a.role !== b.role) return a.role === 'super_admin' ? -1 : 1
    return (a.name ?? a.email).localeCompare(b.name ?? b.email)
  })
  return users
}

export async function getAdminUserById(id: string): Promise<AdminUser | null> {
  const { data, error } = await getAdminClient().auth.admin.getUserById(id)
  if (error || !data.user) return null
  return toAdminUser(data.user)
}

export async function findAuthUserByEmail(email: string): Promise<User | null> {
  const supabase = getAdminClient()
  const target = email.trim().toLowerCase()
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(`Could not look up user: ${error.message}`)
    const hit = data.users.find((u) => u.email?.toLowerCase() === target)
    if (hit) return hit
    if (data.users.length < 200) break
  }
  return null
}

// ---------------------------------------------------------------------------
// Live-profile cache. Cookies are self-contained, so every authorization
// check re-reads the user's *current* role and active flag from Supabase
// (a demoted or deactivated admin loses access at once, not at cookie
// expiry). A short TTL keeps that off the hot path; every mutation below
// invalidates the entry.
// ---------------------------------------------------------------------------

const PROFILE_TTL_MS = 60 * 1000
const profileCache = new Map<string, { profile: AdminUser | null; expires: number }>()

/** Current admin profile for an auth user id, or null if not an admin. */
export async function getLiveAdminProfile(userId: string): Promise<AdminUser | null> {
  const cached = profileCache.get(userId)
  if (cached && cached.expires > Date.now()) return cached.profile
  const profile = await getAdminUserById(userId)
  profileCache.set(userId, { profile, expires: Date.now() + PROFILE_TTL_MS })
  return profile
}

export function invalidateAdminProfile(userId: string): void {
  profileCache.delete(userId)
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function normalizeRate(input: unknown): number {
  const n = typeof input === 'number' ? input : Number(String(input ?? '').trim())
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, Math.round(n * 100) / 100))
}

export { appOrigin }

/** Set-password URL that verifies a Supabase one-time token hash server-side. */
function inviteUrl(tokenHash: string): string {
  return `${appOrigin()}/admin-login?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink`
}

export interface InviteResult {
  user: AdminUser
  /** True if the branded invite email was accepted for delivery. */
  emailSent: boolean
  /** Fallback link to share manually when the email could not be sent. */
  inviteLink: string | null
  emailError: string | null
}

export async function inviteAdminUser(input: {
  email: string
  name: string | null
  role: AdminRole
  defaultCommissionRate: number
  invitedBy: string | null
  invitedByName?: string | null
}): Promise<InviteResult> {
  const supabase = getAdminClient()
  const email = input.email.trim().toLowerCase()

  const existing = await findAuthUserByEmail(email)
  if (existing && toAdminUser(existing)) {
    throw new Error('An admin account with that email already exists.')
  }

  let user: User | null = existing

  if (!user) {
    // Create the auth user without triggering Supabase's own mailer; the
    // branded invite goes out through Resend below.
    const created = await supabase.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { data: input.name ? { full_name: input.name } : undefined },
    })
    if (created.error || !created.data.user) {
      throw new Error(`Could not create the admin account: ${created.error?.message ?? 'unknown error'}`)
    }
    user = created.data.user
  }

  const updated = await supabase.auth.admin.updateUserById(user.id, {
    app_metadata: {
      [ROLE_KEY]: input.role,
      [ACTIVE_KEY]: true,
      [RATE_KEY]: normalizeRate(input.defaultCommissionRate),
      [INVITED_BY_KEY]: input.invitedBy,
    },
    ...(input.name ? { user_metadata: { ...(user.user_metadata ?? {}), full_name: input.name } } : {}),
  })
  if (updated.error || !updated.data.user) {
    throw new Error(`Could not save the admin profile: ${updated.error?.message ?? 'unknown error'}`)
  }
  invalidateAdminProfile(user.id)
  const admin = toAdminUser(updated.data.user)
  if (!admin) throw new Error('Admin profile could not be read back.')

  // One-time set-password link, delivered by our branded email. If sending
  // fails the link is handed back so the UI can offer it for manual sharing.
  const inviteLink = await createInviteLink(admin.id)
  const sent = await sendEmail('admin_invite', admin.email, {
    name: admin.name,
    role: admin.role,
    invitedByName: input.invitedByName ?? null,
    inviteUrl: inviteLink,
  }, { metadata: { adminUserId: admin.id, invitedBy: input.invitedBy } })
  return {
    user: admin,
    emailSent: sent.ok,
    inviteLink: sent.ok ? null : inviteLink,
    emailError: sent.ok ? null : (sent.error ?? 'Email could not be sent'),
  }
}

/** Email a fresh one-time set-password link to an existing admin. */
export async function emailInviteLink(userId: string, invitedByName: string | null): Promise<InviteResult> {
  const admin = await getAdminUserById(userId)
  if (!admin) throw new Error('Admin user not found.')
  const inviteLink = await createInviteLink(admin.id)
  const sent = await sendEmail('admin_invite', admin.email, {
    name: admin.name,
    role: admin.role,
    invitedByName,
    inviteUrl: inviteLink,
  }, { metadata: { adminUserId: admin.id, resend: true } })
  return {
    user: admin,
    emailSent: sent.ok,
    inviteLink: sent.ok ? null : inviteLink,
    emailError: sent.ok ? null : (sent.error ?? 'Email could not be sent'),
  }
}

/**
 * Build a one-time set-password link for an existing admin (resend / copy).
 * Uses a magic-link token hash verified by our own server action, so it does
 * not depend on the Supabase redirect allow-list or email delivery.
 */
export async function createInviteLink(userId: string): Promise<string> {
  const admin = await getAdminUserById(userId)
  if (!admin) throw new Error('Admin user not found.')
  const { data, error } = await getAdminClient().auth.admin.generateLink({
    type: 'magiclink',
    email: admin.email,
  })
  const hash = data?.properties?.hashed_token
  if (error || !hash) throw new Error(`Could not create invite link: ${error?.message ?? 'no token'}`)
  return inviteUrl(hash)
}

export async function updateAdminUser(
  userId: string,
  patch: { role?: AdminRole; defaultCommissionRate?: number; name?: string | null; canManageServices?: boolean },
): Promise<AdminUser> {
  const supabase = getAdminClient()
  const { data: current, error: readError } = await supabase.auth.admin.getUserById(userId)
  if (readError || !current.user || !toAdminUser(current.user)) throw new Error('Admin user not found.')
  const meta = { ...(current.user.app_metadata ?? {}) } as Record<string, unknown>
  if (patch.role) meta[ROLE_KEY] = patch.role
  if (patch.canManageServices !== undefined) meta[SERVICES_KEY] = patch.canManageServices
  if (patch.defaultCommissionRate !== undefined) meta[RATE_KEY] = normalizeRate(patch.defaultCommissionRate)
  const attrs: Parameters<typeof supabase.auth.admin.updateUserById>[1] = { app_metadata: meta }
  if (patch.name !== undefined) {
    attrs.user_metadata = { ...(current.user.user_metadata ?? {}), full_name: patch.name ?? '' }
  }
  const { data, error } = await supabase.auth.admin.updateUserById(userId, attrs)
  if (error || !data.user) throw new Error(`Could not update admin user: ${error?.message ?? 'unknown error'}`)
  invalidateAdminProfile(userId)
  const admin = toAdminUser(data.user)
  if (!admin) throw new Error('Admin profile could not be read back.')
  return admin
}

export async function setAdminUserActive(userId: string, active: boolean): Promise<AdminUser> {
  const supabase = getAdminClient()
  const { data: current, error: readError } = await supabase.auth.admin.getUserById(userId)
  if (readError || !current.user || !toAdminUser(current.user)) throw new Error('Admin user not found.')
  const meta = { ...(current.user.app_metadata ?? {}), [ACTIVE_KEY]: active }
  const { data, error } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: meta,
    ban_duration: active ? 'none' : PERMANENT_BAN,
  })
  if (error || !data.user) throw new Error(`Could not update admin user: ${error?.message ?? 'unknown error'}`)
  invalidateAdminProfile(userId)
  const admin = toAdminUser(data.user)
  if (!admin) throw new Error('Admin profile could not be read back.')
  return admin
}

export async function countActiveSuperAdmins(): Promise<number> {
  const users = await listAdminUsers()
  return users.filter((u) => u.role === 'super_admin' && u.active).length
}

// ---------------------------------------------------------------------------
// First super admin. SUPER_ADMIN_EMAIL names the bootstrap account. Seeding
// only runs while the project has *no* super admin profile at all; once one
// exists (active, deactivated or demoted) restarts never touch it, so a
// revoked bootstrap account stays revoked. If SUPER_ADMIN_INITIAL_PASSWORD is
// set the account is created ready to sign in, otherwise an invite email is
// sent. Invite links are never logged: if the email cannot be delivered, set
// the initial password and restart (applied only while the bootstrap account
// has never signed in).
// ---------------------------------------------------------------------------

export interface SeedLogger {
  info: (o: object, msg: string) => void
  warn: (o: object, msg: string) => void
}

export type SeedOutcome =
  | 'skipped_no_email'
  | 'skipped_super_admin_exists'
  | 'set_initial_password'
  | 'promoted_existing'
  | 'created_with_password'
  | 'created_and_invited'
  | 'created_email_failed'

export async function seedSuperAdmin(log: SeedLogger): Promise<SeedOutcome> {
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase()
  if (!email) {
    log.warn({}, 'SUPER_ADMIN_EMAIL is not set; no admin can sign in until it is')
    return 'skipped_no_email'
  }
  const password = process.env.SUPER_ADMIN_INITIAL_PASSWORD
  const supabase = getAdminClient()

  const admins = await listAdminUsers()
  const superAdmins = admins.filter((a) => a.role === 'super_admin')
  if (superAdmins.length > 0) {
    // Recovery for a bootstrap account whose invite email never arrived: an
    // initial password may be applied only while it has never signed in.
    const bootstrap = superAdmins.find((a) => a.email === email)
    if (password && bootstrap && bootstrap.active && !bootstrap.lastSignInAt) {
      const { error } = await supabase.auth.admin.updateUserById(bootstrap.id, { password, email_confirm: true })
      if (error) throw new Error(`Could not set the super admin password: ${error.message}`)
      invalidateAdminProfile(bootstrap.id)
      log.info({ email }, 'applied SUPER_ADMIN_INITIAL_PASSWORD to the bootstrap super admin')
      return 'set_initial_password'
    }
    return 'skipped_super_admin_exists'
  }

  const existing = await findAuthUserByEmail(email)
  if (existing) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      app_metadata: {
        ...(existing.app_metadata ?? {}),
        [ROLE_KEY]: 'super_admin',
        [ACTIVE_KEY]: true,
        [RATE_KEY]: Number(existing.app_metadata?.[RATE_KEY]) || 0,
      },
      ban_duration: 'none',
      ...(password && !existing.last_sign_in_at ? { password, email_confirm: true } : {}),
    })
    if (error) throw new Error(`Could not promote super admin: ${error.message}`)
    invalidateAdminProfile(existing.id)
    log.info({ email }, 'promoted existing account to super admin')
    return 'promoted_existing'
  }

  if (password) {
    const { error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { [ROLE_KEY]: 'super_admin', [ACTIVE_KEY]: true, [RATE_KEY]: 0, [INVITED_BY_KEY]: null },
    })
    if (error) throw new Error(`Could not create super admin: ${error.message}`)
    log.info({ email }, 'created super admin with initial password')
    return 'created_with_password'
  }

  const result = await inviteAdminUser({
    email, name: null, role: 'super_admin', defaultCommissionRate: 0, invitedBy: null,
  })
  if (result.emailSent) {
    log.info({ email }, 'created super admin and sent invite email')
    return 'created_and_invited'
  }
  log.warn({ email, emailError: result.emailError },
    'created super admin but the invite email could not be sent; set SUPER_ADMIN_INITIAL_PASSWORD and restart to finish setup')
  return 'created_email_failed'
}
