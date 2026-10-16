
import { requireAdmin } from '@/lib/auth/admin-session'
import { isAdminRole } from '@/lib/auth/admin-token'
import {
  countActiveSuperAdmins,
  createInviteLink,
  emailInviteLink,
  getAdminUserById,
  inviteAdminUser,
  listAdminUsers,
  normalizeRate,
  setAdminUserActive,
  updateAdminUser,
  type AdminUser,
  type InviteResult,
} from '@/lib/data/admin-users'

export type { AdminUser, InviteResult }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function listTeam(): Promise<AdminUser[]> {
  await requireAdmin('super_admin')
  return (await listAdminUsers()).filter(u => !u.role.startsWith('reseller_'))
}

export async function inviteTeamMember(formData: FormData): Promise<InviteResult> {
  const actor = await requireAdmin('super_admin')
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const name = String(formData.get('name') ?? '').trim().slice(0, 120) || null
  const role = String(formData.get('role') ?? 'sales_rep')
  const rate = normalizeRate(formData.get('rate'))
  if (!EMAIL_RE.test(email)) throw new Error('Please enter a valid email address.')
  if (role !== 'super_admin' && role !== 'sales_rep') throw new Error('Unknown staff role.')
  return inviteAdminUser({
    email, name, role, defaultCommissionRate: rate,
    invitedBy: actor.userId, invitedByName: actor.name ?? actor.email,
  })
}

export async function updateTeamMember(formData: FormData): Promise<AdminUser> {
  const actor = await requireAdmin('super_admin')
  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('Missing user id.')
  const target = await getAdminUserById(id)
  if (target?.role.startsWith('reseller_')) throw new Error('Manage reseller members from Resellers.')
  const patch: { role?: 'super_admin' | 'sales_rep'; defaultCommissionRate?: number; name?: string | null } = {}
  const role = formData.get('role')
  if (role != null) {
    if (role !== 'super_admin' && role !== 'sales_rep') throw new Error('Unknown staff role.')
    patch.role = role
  }
  const rate = formData.get('rate')
  if (rate != null) patch.defaultCommissionRate = normalizeRate(rate)
  const name = formData.get('name')
  if (name != null) patch.name = String(name).trim().slice(0, 120) || null

  if (patch.role === 'sales_rep') {
    const current = await getAdminUserById(id)
    if (current?.role === 'super_admin' && current.active && (await countActiveSuperAdmins()) <= 1) {
      throw new Error('You cannot demote the last active super admin.')
    }
    if (id === actor.userId) throw new Error('You cannot change your own role.')
  }
  return updateAdminUser(id, patch)
}

export async function setTeamMemberActive(formData: FormData): Promise<AdminUser> {
  const actor = await requireAdmin('super_admin')
  const id = String(formData.get('id') ?? '')
  const active = String(formData.get('active') ?? '') === 'true'
  if (!id) throw new Error('Missing user id.')
  if (!active) {
    if (id === actor.userId) throw new Error('You cannot deactivate your own account.')
    const current = await getAdminUserById(id)
    if (current?.role === 'super_admin' && current.active && (await countActiveSuperAdmins()) <= 1) {
      throw new Error('You cannot deactivate the last active super admin.')
    }
  }
  return setAdminUserActive(id, active)
}

/** A fresh one-time set-password link to share with a team member. */
export async function getTeamInviteLink(formData: FormData): Promise<{ link: string }> {
  await requireAdmin('super_admin')
  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('Missing user id.')
  return { link: await createInviteLink(id) }
}

/** Email a fresh one-time set-password link to a team member. */
export async function resendTeamInvite(formData: FormData): Promise<InviteResult> {
  const actor = await requireAdmin('super_admin')
  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('Missing user id.')
  return emailInviteLink(id, actor.name ?? actor.email)
}
