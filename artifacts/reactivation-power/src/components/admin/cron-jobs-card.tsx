// @ts-nocheck

import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, Loader2, Play } from 'lucide-react'

import { listCronJobs, runCronJobNow } from '@/app/actions/cron'
import { Button } from '@/components/ui/button'
import { notifyDone, notifyError } from '@/lib/notify'

/**
 * "Scheduled jobs" panel on /admin/payments: last run of each job, whether it
 * failed, and a Run-now button. Data comes from the page loader (cronJobs)
 * and is refreshed from listCronJobs after a manual run.
 */

const fmtWhen = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      })
    : '—'

const hourLabel = (h: number) => `${((h + 11) % 12) + 1}:00 ${h < 12 ? 'AM' : 'PM'} ET`

const TRIGGER_LABEL = { scheduler: 'scheduled', http: 'external cron', admin: 'run by' }

function summaryLine(job, run) {
  if (!run?.summary) return null
  const s = run.summary
  if (job === 'billing-retry') {
    return `${s.customers ?? 0} past-due customer${s.customers === 1 ? '' : 's'}, ${s.invoices ?? 0} invoice${s.invoices === 1 ? '' : 's'} tried — ${s.paid ?? 0} paid, ${s.failed ?? 0} still failing`
  }
  if (s.status && s.status !== 'seeded') return `Nothing to do (${s.status})`
  return 'Demo rebuilt'
}

function StatusIcon({ status }) {
  if (status === 'failed') return <AlertTriangle className="h-4 w-4 text-red-600" aria-label="Failed" />
  if (status === 'running') return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Running" />
  return <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Succeeded" />
}

export function CronJobsCard({ initialJobs }) {
  const [jobs, setJobs] = useState(initialJobs ?? [])
  const [running, setRunning] = useState<string | null>(null)
  const anyFailed = jobs.some((j) => j.lastRun?.status === 'failed')
  const anyOverdue = jobs.some((j) => j.overdue)

  const refresh = async () => {
    try {
      setJobs(await listCronJobs())
    } catch {
      /* the page loader data stays on screen */
    }
  }

  const runNow = async (job) => {
    setRunning(job.name)
    try {
      const res = await runCronJobNow({ job: job.name })
      if (res.ok) notifyDone(`${job.label} finished`)
      else notifyError(res.error)
    } catch (e) {
      notifyError(e instanceof Error ? e.message : 'The job could not be started.')
    } finally {
      setRunning(null)
      await refresh()
    }
  }

  return (
    <section
      data-testid="cron-jobs-card"
      className={`rounded-xl border p-4 ${anyFailed ? 'border-red-300 bg-red-50/60' : anyOverdue ? 'border-amber-300 bg-amber-50/60' : 'border-border bg-card'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Clock className="h-4 w-4 text-muted-foreground" /> Scheduled jobs
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Run automatically every day by the server.{' '}
            {anyFailed
              ? 'The last run of a job failed — see below.'
              : anyOverdue
                ? "Today's run has not happened yet — the server may have been asleep. Use Run now, or set up the external trigger described in replit.md."
                : 'All recent runs succeeded.'}
          </p>
        </div>
      </div>
      <ul className="mt-3 divide-y divide-border/70">
        {jobs.map((job) => {
          const last = job.lastRun
          const failed = last?.status === 'failed'
          return (
            <li key={job.name} data-testid={`cron-job-${job.name}`} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {last ? <StatusIcon status={last.status} /> : <Clock className="h-4 w-4 text-muted-foreground" />}
                  <span className="text-sm font-medium text-foreground">{job.label}</span>
                  <span className="text-xs text-muted-foreground">daily at {hourLabel(job.hourEt)}</span>
                  {job.overdue ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800" data-testid={`cron-overdue-${job.name}`}>
                      <AlertTriangle className="h-3 w-3" /> Overdue for {job.expectedDueKey}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{job.description}</p>
                {last ? (
                  <p className={`mt-1 text-xs ${failed ? 'font-medium text-red-700' : 'text-foreground/80'}`}>
                    Last run {fmtWhen(last.startedAt)} ({TRIGGER_LABEL[last.trigger] ?? last.trigger}
                    {last.trigger === 'admin' && last.actor ? ` ${last.actor}` : ''}):{' '}
                    {failed ? `failed — ${last.error}` : last.status === 'running' ? 'running…' : summaryLine(job.name, last) ?? 'ok'}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">Has not run yet.</p>
                )}
                {failed && job.lastSuccess ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">Last success {fmtWhen(job.lastSuccess.startedAt)}.</p>
                ) : null}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={running !== null || last?.status === 'running'}
                onClick={() => runNow(job)}
                data-testid={`cron-run-${job.name}`}
              >
                {running === job.name ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
                Run now
              </Button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
