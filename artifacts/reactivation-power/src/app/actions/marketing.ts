import { action } from '@/lib/api'
import type { SourceInput, LinkInput, ReportInput } from '@workspace/shared/marketing-analytics'
export const getMarketingSetup = action<any>('marketing','getMarketingSetup')
export const saveMarketingSource = action<any>('marketing','saveMarketingSource') as (input:SourceInput)=>Promise<any>
export const saveMarketingLink = action<any>('marketing','saveMarketingLink') as (input:LinkInput)=>Promise<any>
export const saveMarketingPage = action<void>('marketing','saveMarketingPage') as (input:{id:string;path:string;label:string;funnel:string;active:boolean})=>Promise<void>
export const saveMarketingSettings = action<void>('marketing','saveMarketingSettings') as (input:{attribution_days:number;session_minutes:number;retention_days:number})=>Promise<void>
export const getMarketingAudit = action<any[]>('marketing','getMarketingAudit') as (id:string)=>Promise<any[]>
export const getMarketingActivity = action<any>('marketing','getMarketingActivity') as (leadId:string,page?:number,order?:'asc'|'desc')=>Promise<any>
export const getMarketingEvents = action<any>('marketing','getMarketingEvents') as (leadId:string,sessionId:string,page?:number)=>Promise<any>
export const removeMarketingHistory = action<void>('marketing','removeMarketingHistory') as (leadId:string)=>Promise<void>
export const getMarketingReport = action<any>('marketing','getMarketingReport') as (input:ReportInput)=>Promise<any>
