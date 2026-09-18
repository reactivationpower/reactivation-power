// Thin client stubs for the server actions in artifacts/api-server/src/actions/admin-team.ts
import { action } from '@/lib/api'
import type { AdminRole } from '@/app/actions/admin-auth'

export interface AdminUser {
  id: string
  email: string
  name: string | null
  role: AdminRole
  defaultCommissionRate: number
  active: boolean
  invitedBy: string | null
  confirmedAt: string | null
  lastSignInAt: string | null
  createdAt: string
}

export interface InviteResult {
  user: AdminUser
  emailSent: boolean
  inviteLink: string | null
  emailError: string | null
}

export const listTeam = action<AdminUser[]>('admin-team', 'listTeam')
export const inviteTeamMember = action<InviteResult>('admin-team', 'inviteTeamMember')
export const updateTeamMember = action<AdminUser>('admin-team', 'updateTeamMember')
export const setTeamMemberActive = action<AdminUser>('admin-team', 'setTeamMemberActive')
export const getTeamInviteLink = action<{ link: string }>('admin-team', 'getTeamInviteLink')
