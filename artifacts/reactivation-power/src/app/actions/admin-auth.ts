// Thin client stubs for the server actions in artifacts/api-server/src/actions/admin-auth.ts
import { action } from '@/lib/api'

export const adminLogin = action<any>('admin-auth', 'adminLogin')
export const adminLogout = action<any>('admin-auth', 'adminLogout')
