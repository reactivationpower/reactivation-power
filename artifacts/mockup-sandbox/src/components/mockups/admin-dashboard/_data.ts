export interface DashboardCard {
  label: string
  value: string
  sub: string
  accent?: boolean
}

export interface WatchedVideo {
  title: string
  starts: number
  completions: number
  totalSeconds: number
}

export interface RecentViewer {
  first_name: string
  last_name: string
  email: string
  lastSeen: string | null
}

export interface AdminDashboardData {
  cards: DashboardCard[]
  mostWatched: WatchedVideo[]
  recentViewers: RecentViewer[]
}

/**
 * Read-only snapshot of the fields rendered by GET /api/pages/admin.
 * Captured from the authenticated endpoint; non-rendered response fields are
 * deliberately excluded.
 */
export const adminDashboardData: AdminDashboardData = {
  cards: [
    {
      label: 'Total Viewers',
      value: '20',
      sub: '1 new in last 7 days',
    },
    {
      label: 'Total Watch Time',
      value: '5h 7m',
      sub: '216 sessions',
      accent: true,
    },
    {
      label: 'Video Completions',
      value: '77',
      sub: 'across all courses',
    },
    {
      label: 'Content Library',
      value: '36 videos',
      sub: '2h 10m total · 2/2 live',
    },
  ],
  mostWatched: [
    {
      title: 'Planning, Targeting, & Patients',
      starts: 6,
      completions: 5,
      totalSeconds: 1763.6281559999998,
    },
    {
      title: 'Welcome To The Reactivation Power Course',
      starts: 8,
      completions: 6,
      totalSeconds: 1625.290245,
    },
    {
      title: 'The 3 Deadly Sins Of Reactivation & Reputation Damage',
      starts: 6,
      completions: 6,
      totalSeconds: 1590.9325170000002,
    },
    {
      title: 'Steps 1 & 2 - Introduction & Making The Call',
      starts: 5,
      completions: 5,
      totalSeconds: 1459.9723,
    },
    {
      title: 'Review, Recommend, and Close',
      starts: 4,
      completions: 4,
      totalSeconds: 1356.450975,
    },
    {
      title: 'The 3 Types of Reactivation',
      starts: 4,
      completions: 4,
      totalSeconds: 1184.982993,
    },
  ],
  recentViewers: [
    {
      first_name: 'Daniel',
      last_name: 'Whitaker',
      email: 'dr.whitaker@demo.reactivationpower.com',
      lastSeen: '2026-09-18T15:25:45.814841+00:00',
    },
    {
      first_name: 'Tyler',
      last_name: 'Brooks',
      email: 'tyler.brooks@demo.reactivationpower.com',
      lastSeen: '2026-09-17T14:49:00+00:00',
    },
    {
      first_name: 'Marcus',
      last_name: 'Reyes',
      email: 'marcus.reyes@demo.reactivationpower.com',
      lastSeen: '2026-09-17T13:32:00+00:00',
    },
    {
      first_name: 'Jason',
      last_name: 'Strotheide',
      email: 'drstrotheide@gmail.com',
      lastSeen: '2026-09-16T20:32:03.268945+00:00',
    },
    {
      first_name: 'Sarah',
      last_name: 'Mitchell',
      email: 'sarah.mitchell@demo.reactivationpower.com',
      lastSeen: '2026-09-16T14:02:00+00:00',
    },
    {
      first_name: 'Priya',
      last_name: 'Nair',
      email: 'priya.nair@demo.reactivationpower.com',
      lastSeen: '2026-09-14T14:58:00+00:00',
    },
  ],
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.round(totalSeconds)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes}m ${seconds % 60 ? `${seconds % 60}s` : ''}`.trim()
  }
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

export function formatRecentViewerDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}