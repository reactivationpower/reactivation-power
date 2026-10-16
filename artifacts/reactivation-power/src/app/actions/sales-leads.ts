import { action as untypedAction } from '@/lib/api'
/** Preserve the existing RPC envelope while declaring each action's input contract. */
function action<F extends (...args: any[]) => Promise<any>>(module: string, name: string): F {
  return untypedAction<Awaited<ReturnType<F>>>(module, name) as F
}
import type { SalesDashboard, SalesDetail, SalesImportPreview, SalesDisposition, SalesStage } from '@workspace/shared/sales-leads'
export const listSalesLeads = action<(input: { query?: string; stage?: string; source?: string; assignee?: string; page?: number }) => Promise<SalesDashboard>>('sales-leads', 'listSalesLeads')
export const getSalesLead = action<(id: string) => Promise<SalesDetail>>('sales-leads', 'getSalesLead')
export const createSalesLead = action<(input: { firstName: string; lastName: string; email: string; phone: string; practiceName: string; notes?: string; affiliateId?: string }) => Promise<{ id: string }>>('sales-leads', 'createSalesLead')
export const updateSalesLead = action<(id: string, input: { revision: number; stage?: SalesStage; assigneeId?: string | null; firstName?: string; lastName?: string; email?: string; phone?: string; practiceName?: string; timezone?: string; consentEvidence?: string; nextFollowupAt?: string | null }) => Promise<void>>('sales-leads', 'updateSalesLead')
export const addSalesNote = action<(id: string, body: string) => Promise<void>>('sales-leads', 'addSalesNote')
export const logSalesCall = action<(id: string, input: { disposition: SalesDisposition; notes: string; nextFollowupAt?: string; confirmedSuggestedSlot?: boolean }) => Promise<void>>('sales-leads', 'logSalesCall')
export const saveSalesSettings = action<(input: { defaultAssigneeId?: string; followupTexts?: string[]; laterDays?: number[]; approveTemplate?: boolean; reviewScope?: boolean; confirmSmsConfiguration?: boolean; enableAutomation?: boolean }) => Promise<void>>('sales-leads', 'saveSalesSettings')
export const saveSalesReplyPreference = action<(enabled: boolean) => Promise<void>>('sales-leads', 'saveSalesReplyPreference')
export const verifySalesCapabilities = action<() => Promise<void>>('sales-leads', 'verifySalesCapabilities')
export const previewSalesImport = action<(scope: string) => Promise<SalesImportPreview>>('sales-leads', 'previewSalesImport')
export const startSalesImport = action<(previewId: string) => Promise<{ id: string }>>('sales-leads', 'startSalesImport')
export const getSalesImport = action<(id?: string) => Promise<any>>('sales-leads', 'getSalesImport')
export const resumeSalesImport = action<(id: string) => Promise<void>>('sales-leads', 'resumeSalesImport')
export const resolveSalesMerge = action<(reviewId: string, leadId: string | null) => Promise<void>>('sales-leads', 'resolveSalesMerge')
export const convertSalesLead = action<(id: string) => Promise<{ customerId: string; enrollmentUrl: string }>>('sales-leads', 'convertSalesLead')
export const retrySalesSync = action<(id: string) => Promise<void>>('sales-leads', 'retrySalesSync')
export const salesCadencePreview = action<(timezone: string) => Promise<Array<{ dueAt: string; kind: string; day: number; textNumber?: number }>>>('sales-leads', 'salesCadencePreview')
export const getSalesMedia = action<(leadId: string, activityId: string) => Promise<{ state: string; contactUrl: string | null; explanation: string }>>('sales-leads', 'getSalesMedia')
