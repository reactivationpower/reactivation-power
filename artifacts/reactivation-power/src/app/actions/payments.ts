import { toast } from 'sonner';

export type LeadState = any;
export type LoginState = any;
export const confirmPayment = async (...args: any[]) => { toast.error('Backend operations are disabled in this read-only port.'); return { success: false, error: 'Backend operations are disabled in this read-only port.' }; };
export const deletePaymentLink = async (...args: any[]) => { toast.error('Backend operations are disabled in this read-only port.'); return { success: false, error: 'Backend operations are disabled in this read-only port.' }; };
export const provisionAccountsNow = async (...args: any[]) => { toast.error('Backend operations are disabled in this read-only port.'); return { success: false, error: 'Backend operations are disabled in this read-only port.' }; };
export const startPaymentCheckout = async (...args: any[]) => { toast.error('Backend operations are disabled in this read-only port.'); return { success: false, error: 'Backend operations are disabled in this read-only port.' }; };
export const createPaymentLink = async (...args: any[]) => { toast.error('Backend operations are disabled in this read-only port.'); return { success: false, error: 'Backend operations are disabled in this read-only port.' }; };
export const listPaymentLinks = async (...args: any[]) => { toast.error('Backend operations are disabled in this read-only port.'); return []; };
export const getPaymentDetail = async (...args: any[]) => { toast.error('Backend operations are disabled in this read-only port.'); return null; };
export const getPaymentLinkPublic = async (...args: any[]) => { toast.error('Backend operations are disabled in this read-only port.'); return { success: false, error: 'Backend operations are disabled in this read-only port.' }; };
