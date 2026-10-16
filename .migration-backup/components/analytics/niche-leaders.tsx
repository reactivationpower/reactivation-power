import { Fragment } from 'react'
import Link from 'next/link'
import { Info, Trophy, UserRound } from 'lucide-react'
import {
  MIN_NICHE_CONVERSATIONS,
  type NicheCallerStat,
  type NicheLeaderRow,
  type NicheLeaders,
} from '@/lib/analytics-types'
import { cn } from '@/lib/utils'

export function NicheLeaderBoard({ data }: { data: NicheLeaders }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Best caller by niche
        </h2>
        <p className="text-sm text-muted-foreground">
          Who closes each script best, ranked by close rate (appointments
          booked per conversation). A caller needs {MIN_NICHE_CONVERSATIONS}+
          conversations in a niche to be counted, and a niche needs two
          counted callers before anyone leads it.
        </p>
      </div>

      {data.niches.length === 0 ? (
        <EmptyNote>
          This fills in once your callers have logged conversations in a
          niche.
        </EmptyNote>
      ) : data.activeCallers <= 1 ? (
        <SoloView niches={data.niches} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.niches.map((row) => (
            <NicheCard key={row.nicheId} row={row} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- One card per niche (two or more callers) ----------

function NicheCard({ row }: { row: NicheLeaderRow }) {
  const showTop = row.status === 'leader' || row.status === 'one_caller'
  const top = showTop ? row.callers[0] : null
  // Callers are sorted qualified-first, so a tie is any run of qualified
  // callers sharing the top close rate. Nobody gets crowned on a coin flip.
  const tied =
    row.status === 'leader' && top
      ? row.callers.filter((c) => c.qualified && c.closeRate === top.closeRate)
      : []
  const isTie = tied.length >= 2
  const runnerUp =
    row.status === 'leader' ? row.callers[isTie ? tied.length : 1] : undefined

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{row.name}</p>
        <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {row.reached} {row.reached === 1 ? 'conversation' : 'conversations'}
        </p>
      </div>

      {isTie ? (
        <div className="flex items-start gap-3">
          <IconBox tone="success">
            <Trophy className="size-4" />
          </IconBox>
          <div className="min-w-0">
            <p className="text-lg font-semibold leading-snug text-foreground">
              {tied.map((c, i) => (
                <Fragment key={c.callerId}>
                  {i > 0 && (i === tied.length - 1 ? ' & ' : ', ')}
                  <Link
                    href={`/portal/analytics/${c.callerId}`}
                    className="hover:underline"
                  >
                    {c.name}
                  </Link>
                </Fragment>
              ))}
            </p>
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Tied</span> at{' '}
              {tied[0].closeRate}% close rate
            </p>
          </div>
        </div>
      ) : top ? (
        <CallerLine caller={top} tone={row.status === 'leader' ? 'success' : 'muted'} />
      ) : (
        <div className="flex items-center gap-3">
          <IconBox tone="muted">
            <Info className="size-4" />
          </IconBox>
          <p className="text-sm font-medium text-muted-foreground">
            {row.status === 'no_bookings'
              ? 'No appointments booked yet'
              : 'Not enough conversations yet'}
          </p>
        </div>
      )}

      <p className="border-t border-border pt-2 text-xs leading-relaxed text-muted-foreground">
        {isTie &&
          tied
            .map((c) => `${c.name.split(' ')[0]} ${c.scheduled} of ${c.reached}`)
            .join(' · ')}
        {isTie && runnerUp && (
          <>
            {' · '}Next: {runnerUp.name} at {runnerUp.closeRate}%
          </>
        )}
        {!isTie && row.status === 'leader' && runnerUp && (
          <>
            Next:{' '}
            <Link
              href={`/portal/analytics/${runnerUp.callerId}`}
              className="font-medium text-foreground hover:underline"
            >
              {runnerUp.name}
            </Link>{' '}
            at {runnerUp.closeRate}% ({runnerUp.scheduled} of{' '}
            {runnerUp.reached})
          </>
        )}
        {row.status === 'one_caller' &&
          `Only caller with ${MIN_NICHE_CONVERSATIONS}+ conversations here, so there is nobody to compare against yet.`}
        {row.status === 'no_bookings' &&
          'Two or more callers qualify, but none has booked in this niche.'}
        {row.status === 'too_few' &&
          `Needs ${MIN_NICHE_CONVERSATIONS}+ conversations from at least two callers.`}
      </p>
    </div>
  )
}

// ---------- Single-caller office ----------

function SoloView({ niches }: { niches: NicheLeaderRow[] }) {
  const ranked = niches
    .filter((n) => n.callers[0]?.qualified)
    .sort(
      (a, b) =>
        b.callers[0].closeRate - a.callers[0].closeRate ||
        b.callers[0].scheduled - a.callers[0].scheduled,
    )
  const caller = niches[0]?.callers[0]

  if (!caller || ranked.length === 0) {
    return (
      <EmptyNote>
        Only one caller has logged calls so far, and none of their niches has{' '}
        {MIN_NICHE_CONVERSATIONS}+ conversations yet. This fills in as the
        conversations add up.
      </EmptyNote>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Only{' '}
        <Link
          href={`/portal/analytics/${caller.callerId}`}
          className="font-medium text-foreground hover:underline"
        >
          {caller.name}
        </Link>{' '}
        has logged calls so far, so there is nobody to compare against yet.
        Here is where they are strongest:
      </p>
      <ul className="flex flex-col divide-y divide-border">
        {ranked.map((n, i) => {
          const c = n.callers[0]
          return (
            <li key={n.nicheId} className="flex items-center gap-3 py-2.5">
              <IconBox tone={i === 0 ? 'success' : 'muted'}>
                {i === 0 ? (
                  <Trophy className="size-4" />
                ) : (
                  <span className="text-xs font-semibold tabular-nums">
                    {i + 1}
                  </span>
                )}
              </IconBox>
              <span className="flex-1 text-sm font-medium text-foreground">
                {n.name}
              </span>
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {c.closeRate}%
              </span>
              <span className="w-24 text-right text-xs tabular-nums text-muted-foreground">
                {c.scheduled} of {c.reached}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ---------- Shared bits ----------

function CallerLine({
  caller,
  tone,
}: {
  caller: NicheCallerStat
  tone: 'success' | 'muted'
}) {
  return (
    <div className="flex items-start gap-3">
      <IconBox tone={tone}>
        {tone === 'success' ? (
          <Trophy className="size-4" />
        ) : (
          <UserRound className="size-4" />
        )}
      </IconBox>
      <div className="min-w-0">
        <Link
          href={`/portal/analytics/${caller.callerId}`}
          className="block truncate text-lg font-semibold text-foreground hover:underline"
        >
          {caller.name}
        </Link>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{caller.closeRate}%</span>{' '}
          close rate · {caller.scheduled} of {caller.reached} booked
        </p>
      </div>
    </div>
  )
}

function IconBox({
  tone,
  children,
}: {
  tone: 'success' | 'muted'
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-md',
        tone === 'success'
          ? 'bg-success/10 text-success'
          : 'bg-muted text-muted-foreground',
      )}
    >
      {children}
    </div>
  )
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed border-border bg-card p-4">
      <IconBox tone="muted">
        <Info className="size-4" />
      </IconBox>
      <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  )
}
