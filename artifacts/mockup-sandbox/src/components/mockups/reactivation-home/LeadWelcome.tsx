import type { MouseEvent } from 'react'
import {
  ArrowUpRight,
  BarChart3,
  CreditCard,
  Inbox,
  LogOut,
  Megaphone,
  MessageSquareText,
  Settings,
} from 'lucide-react'

import './_group.css'
import './Welcome.css'

const PORTAL_WIDTH = 'mx-auto w-full max-w-[1440px] px-6'
const preventNavigation = (event: MouseEvent<HTMLAnchorElement>) => event.preventDefault()

// Lead Follow-Up keeps its own top tabs (Leads, Campaigns, Analytics); none is highlighted on this screen.
const NAV = [
  { href: '/portal/leads', label: 'Leads', icon: Inbox },
  { href: '/portal/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/portal/leads/analytics', label: 'Analytics', icon: BarChart3 },
] as const

const destinations = [
  {
    title: 'Campaigns',
    description: 'Connect each ad or offer once, and every new lead is added automatically and arrives ready to call, matched to the exact offer they responded to.',
    icon: Megaphone,
    href: '/portal/campaigns',
    number: '01',
    className: 'welcome-card--training',
  },
  {
    title: 'Leads',
    description: 'Every lead here already raised their hand. See who responded, who to call first, and who is still waiting before their interest cools off.',
    icon: Inbox,
    href: '/portal/leads',
    number: '02',
    className: 'welcome-card--contacts',
  },
  {
    title: 'Practice the Script',
    description: 'Rehearse with scripts built around the exact campaigns you have running, so your team sounds ready the moment a real lead picks up.',
    icon: MessageSquareText,
    href: '/portal/campaigns',
    number: '03',
    className: 'welcome-card--dialer',
  },
  {
    title: 'Analytics',
    description: 'See response times, conversations, and appointments booked from leads.',
    icon: BarChart3,
    href: '/portal/leads/analytics',
    number: '04',
    className: 'welcome-card--analytics',
  },
] as const

const guidance = [
  { question: 'New here?', answer: 'Set up your first Campaign.', href: '/portal/campaigns' },
  { question: 'Have a new lead waiting?', answer: 'Go to Leads.', href: '/portal/leads' },
  { question: 'Want to rehearse before a live call?', answer: 'Practice the Script.', href: '/portal/campaigns' },
  { question: 'Want to evaluate your team’s performance?', answer: 'Go to Analytics.', href: '/portal/leads/analytics' },
] as const

export function LeadWelcome() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className={`${PORTAL_WIDTH} flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2 lg:h-16 lg:flex-nowrap lg:py-0`}>
          <a href="/portal/start" onClick={preventNavigation} className="flex min-w-0 items-center">
            <img src="/__mockup/images/logo.png" alt="Reactivation Power" width={1177} height={480} className="h-12 w-auto" />
            <span className="sr-only">Reactivation Power Portal</span>
          </a>
          <nav className="order-last -mx-1 flex w-full min-w-0 items-center gap-1 overflow-x-auto px-1 lg:order-none lg:mx-0 lg:w-auto lg:px-0" aria-label="Portal">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={preventNavigation}
                className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <item.icon className="size-4" aria-hidden="true" />
                {item.label}
              </a>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-2 lg:order-last">
            <a href="/portal/billing" onClick={preventNavigation} aria-label="Billing" className="flex size-10 items-center justify-center rounded-md border border-input bg-card text-foreground transition-colors hover:bg-muted">
              <CreditCard className="size-4" />
            </a>
            <a href="/portal/settings" onClick={preventNavigation} aria-label="Settings" className="flex size-10 items-center justify-center rounded-md border border-input bg-card text-foreground transition-colors hover:bg-muted">
              <Settings className="size-4" />
            </a>
            <button type="button" className="flex h-10 shrink-0 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted">
              <LogOut className="size-4" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="welcome-home">
          <div className="welcome-inner">
            <div className="welcome-intro">
              <div className="welcome-eyebrow">
                <span className="welcome-eyebrow-line" aria-hidden="true" />
                LEAD FOLLOW-UP
              </div>
              <h1>Where would you like to go?</h1>
              <p>Turn the people who responded to your ads into booked appointments.</p>
            </div>

            <div className="welcome-grid" aria-label="Choose a destination">
              {destinations.map(({ title, description, icon: Icon, href, number, className }) => (
                <a key={title} href={href} onClick={preventNavigation} className={`welcome-card ${className}`}>
                  <span className="welcome-card-top">
                    <span className="welcome-icon" aria-hidden="true">
                      <Icon size={25} strokeWidth={1.8} />
                    </span>
                    <span className="welcome-number" aria-hidden="true">{number} / 04</span>
                  </span>
                  <span className="welcome-card-bottom">
                    <span className="welcome-card-copy">
                      <span className="welcome-card-title">{title}</span>
                      <span className="welcome-card-description">{description}</span>
                    </span>
                    <span className="welcome-arrow" aria-hidden="true">
                      <ArrowUpRight size={21} strokeWidth={1.8} />
                    </span>
                  </span>
                </a>
              ))}
            </div>

            <div className="welcome-guidance" aria-label="Not sure where to start?">
              <span className="welcome-guidance-mark" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <ul className="welcome-guidance-list">
                {guidance.map(({ question, answer, href }) => (
                  <li key={question}>
                    <a href={href} onClick={preventNavigation}>
                      <strong>{question}</strong>
                      <span>{answer}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </main>
      <footer className="py-8 text-center text-sm text-muted-foreground">Powered by Reactivation Power</footer>
    </div>
  )
}
