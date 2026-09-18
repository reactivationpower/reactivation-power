import { toast } from 'sonner';

export type LeadState = any;
export type LoginState = any;
export const lookupZip = async (...args: any[]) => { return { city: 'Anytown', state: 'NY', success: true }; };
export const submitHealthcareLead = async (...args: any[]) => { toast.error('Backend operations are disabled in this read-only port.'); return { success: false, error: 'Backend operations are disabled in this read-only port.' }; };
