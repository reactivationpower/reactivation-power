// Thin client stubs for the server actions in artifacts/api-server/src/actions/auth.ts
import { action } from '@/lib/api'

export interface LoginState {
  error?: string
  message?: string
  codeSent?: boolean
  email?: string
  attemptsRemaining?: number
  resendAfter?: number
  passwordSet?: boolean
  billing?: { reason: string; status: string; email: string }
}

export const login = action<any>('auth', 'login')
export const logout = action<any>('auth', 'logout')
export const verifyLoginCode = action<LoginState>('auth', 'verifyLoginCode')
export const resendLoginCode = action<LoginState>('auth', 'resendLoginCode')
export const requestPasswordSetup = action<LoginState>('auth', 'requestPasswordSetup')
export const setPortalPassword = action<LoginState>('auth', 'setPortalPassword')
