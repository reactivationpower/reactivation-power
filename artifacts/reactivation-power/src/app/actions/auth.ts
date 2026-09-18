// Thin client stubs for the server actions in artifacts/api-server/src/actions/auth.ts
import { action } from '@/lib/api'

export interface LoginState {
  error?: string
}

export const login = action<any>('auth', 'login')
export const logout = action<any>('auth', 'logout')
