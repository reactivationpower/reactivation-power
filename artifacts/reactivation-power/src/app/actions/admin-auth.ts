// Thin client stubs for the server actions in artifacts/api-server/src/actions/admin-auth.ts
import { action } from '@/lib/api'

export type AdminRole = 'super_admin' | 'sales_rep'
export interface AdminIdentity {
  userId: string
  email: string
  name: string | null
  role: AdminRole
  canManageServices?: boolean
}

export const adminLogin = action<any>('admin-auth', 'adminLogin')
export const completeAdminInvite = action<any>('admin-auth', 'completeAdminInvite')
export const getCurrentAdmin = action<AdminIdentity | null>('admin-auth', 'getCurrentAdmin')
export const adminLogout = action<any>('admin-auth', 'adminLogout')
