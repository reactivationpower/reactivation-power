'use client'

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  MIN_BUCKET_SAMPLE,
  type Bucket,
  type MonthRow,
  type WeekRow,
} from '@/lib/analytics-types'

/**
 * One color language across every chart on the analytics pages:
 *   slate = dials (attempts), teal = conversations, green = appointments.
 */
const FUNNEL: ChartConfig = {
  calls: { label: 'Calls', color: 'var(--chart-3)' },
  reached: { label: 'Reached', color: 'var(--chart-1)' },
  scheduled: { label: 'Scheduled', color: 'var(--chart-2)' },
}

const RATES: ChartConfig = {
  answerRate: { label: 'Answer rate', color: 'var(--chart-1)' },
  yesRate: { label: 'Scheduled rate', color: 'var(--chart-2)' },
}

const APPTS: ChartConfig = {
  scheduled: { label: 'Booked on call', color: 'var(--chart-1)' },
  appointments: { label: 'Appointment date', color: 'var(--chart-2)' },
}

const LOGINS: ChartConfig = {
  logins: { label: 'Sign-ins', color: 'var(--chart-1)' },
}

const axisTick = { fontSize: 12 }

// ---------- 12-week activity trend ----------

export function ActivityTrendChart({ data }: { data: WeekRow[] }) {
  return (
    <ChartContainer config={FUNNEL} className="h-56 w-full">
      <AreaChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={axisTick}
          interval="preserveStartEnd"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={axisTick}
          allowDecimals={false}
          width={40}
        />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Area
          dataKey="calls"
          type="monotone"
          fill="var(--color-calls)"
          fillOpacity={0.15}
          stroke="var(--color-calls)"
          strokeWidth={2}
        />
        <Area
          dataKey="reached"
          type="monotone"
          fill="var(--color-reached)"
          fillOpacity={0.2}
          stroke="var(--color-reached)"
          strokeWidth={2}
        />
        <Area
          dataKey="scheduled"
          type="monotone"
          fill="var(--color-scheduled)"
          fillOpacity={0.3}
          stroke="var(--color-scheduled)"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  )
}

// ---------- Rate-by-bucket bars (hour / weekday / month-week) ----------

function RateTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload: Bucket }[]
}) {
  if (!active || !payload?.length) return null
  const b = payload[0].payload
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-foreground">{b.label}</p>
      <div className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-muted-foreground">
        <span>Calls</span>
        <span className="text-right font-medium text-foreground">{b.calls}</span>
        <span>Reached</span>
        <span className="text-right font-medium text-foreground">
          {b.reached}{' '}
          <span className="text-muted-foreground">({b.answerRate}%)</span>
        </span>
        <span>Scheduled</span>
        <span className="text-right font-medium text-foreground">
          {b.scheduled}{' '}
          <span className="text-muted-foreground">({b.yesRate}%)</span>
        </span>
      </div>
      {!b.reliable && b.calls > 0 && (
        <p className="mt-1.5 border-t border-border pt-1.5 text-muted-foreground">
          Under {MIN_BUCKET_SAMPLE} calls — not enough to trust yet
        </p>
      )}
    </div>
  )
}

export function BucketRateChart({
  data,
  metric,
  height = 'h-52',
}: {
  data: Bucket[]
  metric: 'answerRate' | 'yesRate'
  height?: string
}) {
  const color = metric === 'answerRate' ? 'var(--chart-1)' : 'var(--chart-2)'
  return (
    <ChartContainer config={RATES} className={`${height} w-full`}>
      <BarChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={axisTick}
          interval={0}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={axisTick}
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          tickFormatter={(v) => `${v}%`}
          width={40}
        />
        <ChartTooltip cursor={{ fill: 'var(--muted)' }} content={<RateTooltip />} />
        <Bar dataKey={metric} radius={[4, 4, 0, 0]} maxBarSize={36}>
          {data.map((b) => (
            <Cell
              key={b.key}
              fill={color}
              fillOpacity={b.reliable ? 1 : b.calls > 0 ? 0.35 : 0.12}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

/** Grouped answer-rate + scheduled-rate bars, used for the weekday view. */
export function BucketDualRateChart({ data }: { data: Bucket[] }) {
  return (
    <ChartContainer config={RATES} className="h-52 w-full">
      <BarChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={axisTick}
          interval={0}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={axisTick}
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          tickFormatter={(v) => `${v}%`}
          width={40}
        />
        <ChartTooltip cursor={{ fill: 'var(--muted)' }} content={<RateTooltip />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="answerRate" radius={[4, 4, 0, 0]} maxBarSize={28}>
          {data.map((b) => (
            <Cell
              key={b.key}
              fill="var(--color-answerRate)"
              fillOpacity={b.reliable ? 1 : b.calls > 0 ? 0.35 : 0.12}
            />
          ))}
        </Bar>
        <Bar dataKey="yesRate" radius={[4, 4, 0, 0]} maxBarSize={28}>
          {data.map((b) => (
            <Cell
              key={b.key}
              fill="var(--color-yesRate)"
              fillOpacity={b.reliable ? 1 : b.calls > 0 ? 0.35 : 0.12}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

// ---------- Appointments per calendar month ----------

export function AppointmentsByMonthChart({ data }: { data: MonthRow[] }) {
  return (
    <ChartContainer config={APPTS} className="h-56 w-full">
      <BarChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={axisTick}
          interval={0}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={axisTick}
          allowDecimals={false}
          width={40}
        />
        <ChartTooltip
          cursor={{ fill: 'var(--muted)' }}
          content={<ChartTooltipContent indicator="dot" />}
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar
          dataKey="scheduled"
          fill="var(--color-scheduled)"
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
        />
        <Bar
          dataKey="appointments"
          fill="var(--color-appointments)"
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
        />
      </BarChart>
    </ChartContainer>
  )
}

// ---------- Sign-ins per week (training audit) ----------

export function LoginsByWeekChart({
  data,
}: {
  data: { key: string; label: string; logins: number }[]
}) {
  return (
    <ChartContainer config={LOGINS} className="h-36 w-full">
      <BarChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={axisTick}
          interval="preserveStartEnd"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={axisTick}
          allowDecimals={false}
          width={40}
        />
        <ChartTooltip
          cursor={{ fill: 'var(--muted)' }}
          content={<ChartTooltipContent hideIndicator />}
        />
        <Bar
          dataKey="logins"
          fill="var(--color-logins)"
          radius={[4, 4, 0, 0]}
          maxBarSize={24}
        />
      </BarChart>
    </ChartContainer>
  )
}
