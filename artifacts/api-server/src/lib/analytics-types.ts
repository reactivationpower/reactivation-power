/**
 * Shared analytics shapes + constants that are safe to import from client
 * components (no server-only imports here). The aggregation itself lives in
 * lib/data/caller-analytics.ts and re-exports everything below.
 */

import type { CallDisposition } from '@/lib/types'

/** Minimum calls a time bucket needs before we'll call it a trend. */
export const MIN_BUCKET_SAMPLE = 3

export interface Bucket {
  key: string
  label: string
  calls: number
  reached: number
  scheduled: number
  /** reached / calls, 0-100 */
  answerRate: number
  /** scheduled / calls, 0-100 */
  yesRate: number
  /** true once the bucket has enough calls to be trusted */
  reliable: boolean
}

export interface TimeInsight {
  label: string
  rate: number
  calls: number
}

export interface NicheRow {
  nicheId: string | null
  name: string
  calls: number
  reached: number
  scheduled: number
  closeRate: number
  yesRate: number
}

/** Conversations a caller needs in a niche before they can lead it. */
export const MIN_NICHE_CONVERSATIONS = MIN_BUCKET_SAMPLE

export interface NicheCallerStat {
  callerId: string
  name: string
  isOwner: boolean
  calls: number
  reached: number
  scheduled: number
  /** scheduled / reached, 0-100 */
  closeRate: number
  /** reached >= MIN_NICHE_CONVERSATIONS */
  qualified: boolean
}

export interface NicheLeaderRow {
  nicheId: string
  name: string
  /** Team-wide totals for this niche */
  calls: number
  reached: number
  scheduled: number
  /** Everyone who has dialed this niche: qualified callers first, best close rate first */
  callers: NicheCallerStat[]
  /**
   * leader       two or more qualified callers and the top one has booked
   * one_caller   only one caller is qualified, so there is nobody to compare against
   * no_bookings  qualified callers exist but none has booked in this niche
   * too_few      nobody has enough conversations in this niche yet
   */
  status: 'leader' | 'one_caller' | 'no_bookings' | 'too_few'
}

export interface NicheLeaders {
  niches: NicheLeaderRow[]
  /** Team members with at least one logged call */
  activeCallers: number
}

export interface MonthRow {
  key: string
  label: string
  /** Calls logged as "Scheduled" in that month */
  scheduled: number
  /** Appointments whose booked date lands in that month */
  appointments: number
}

export interface WeekRow {
  key: string
  label: string
  calls: number
  reached: number
  scheduled: number
}

export interface CallAnalytics {
  summary: {
    calls: number
    reached: number
    scheduled: number
    voicemails: number
    doNotCall: number
    /** reached / calls */
    answerRate: number
    /** scheduled / calls */
    successRate: number
    /** scheduled / reached */
    closeRate: number
    firstCallAt: string | null
    lastCallAt: string | null
    activeDays: number
    upcomingAppointments: number
  }
  dispositions: { key: CallDisposition; label: string; count: number }[]
  byHour: Bucket[]
  byWeekday: Bucket[]
  byMonthWeek: Bucket[]
  byNiche: NicheRow[]
  byMonth: MonthRow[]
  byWeek: WeekRow[]
  insights: {
    bestAnswerHour: TimeInsight | null
    worstAnswerHour: TimeInsight | null
    bestYesHour: TimeInsight | null
    bestYesDay: TimeInsight | null
    bestYesMonthWeek: TimeInsight | null
  }
}

export interface TrainingAudit {
  logins: number
  loginsLast30: number
  firstLoginAt: string | null
  lastLoginAt: string | null
  /** distinct ET calendar days with a login */
  activeLoginDays: number
  videoStarts: number
  videoCompletions: number
  totalWatchSeconds: number
  courses: {
    id: string
    title: string
    completedVideos: number
    totalVideos: number
    percentComplete: number
  }[]
  recent: {
    id: string
    type: string
    at: string
    title: string | null
  }[]
  /** Sign-ins per week, last 12 weeks */
  loginsByWeek: { key: string; label: string; logins: number }[]
}
