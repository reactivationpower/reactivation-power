import { toast } from 'sonner';

export type LeadState = any;
export type LoginState = any;
export const adminLogin = async (...args: any[]) => { toast.error('Backend operations are disabled in this read-only port.'); return { success: false, error: 'Backend operations are disabled in this read-only port.' }; };
