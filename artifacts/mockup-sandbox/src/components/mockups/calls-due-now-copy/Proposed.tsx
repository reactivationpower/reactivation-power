import { ArrowLeftRight, ArrowUpRight, BarChart3, CreditCard, LogOut, Megaphone, MessageSquareText, PhoneCall, Settings, Inbox } from 'lucide-react'
import './_group.css'
import './Proposed.css'

// Extracted from portal/welcome-home.tsx, portal-nav.tsx and portal_layout.tsx.
// No routes, sessions, progress or customer records are accessed in this preview.
const cards = [
  { title: 'Campaigns', description: 'Connect each ad or offer once. Every new lead arrives ready to call, matched to the offer they chose.', icon: Megaphone },
  { title: 'Calls Due Now & Leads', description: 'See new leads and follow-ups that are ready for a call right now, or browse the full list of every lead.', icon: PhoneCall },
  { title: 'Practice the Script', description: 'Rehearse scripts built around your live campaigns, so your team sounds ready when a real lead picks up.', icon: MessageSquareText },
  { title: 'Analytics', description: 'See response times, conversations, and appointments booked from leads, by campaign and team member.', icon: BarChart3 },
]
const guidance = [
  { question: 'New here?', answer: 'Set up your first Campaign.' },
  { question: 'Ready to follow up and make calls?', answer: 'Open Calls Due Now & Leads.' },
  { question: 'Want to rehearse before a live call?', answer: 'Practice the Script.' },
  { question: 'Want to evaluate your team’s performance?', answer: 'Go to Analytics.' },
]

export function Proposed() {
  return <div className="min-h-screen bg-background font-['Geist',sans-serif] text-foreground">
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 lg:h-16 lg:flex-nowrap lg:px-6 lg:py-0">
        <a href="#" onClick={e => e.preventDefault()} className="flex min-w-0 items-center" aria-label="Reactivation Power home"><img src="/__mockup/images/logo.png" alt="Reactivation Power" width={1177} height={480} className="h-12 w-auto" /></a>
        <nav className="order-last -mx-1 flex w-full min-w-0 items-center gap-1 overflow-x-auto px-1 lg:order-none lg:mx-0 lg:w-auto lg:px-0" aria-label="Portal">
          <div className="mr-2 flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-border bg-muted/40 py-1 pl-2.5 pr-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-amber-800">Lead Follow-Up</span>
            <a href="#" onClick={e => e.preventDefault()} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:bg-card hover:text-foreground"><ArrowLeftRight size={14} />Reactivation</a>
          </div>
          {[
            { label: 'Calls Due Now', icon: PhoneCall },
            { label: 'Leads', icon: Inbox },
            { label: 'Campaigns', icon: Megaphone },
            { label: 'Analytics', icon: BarChart3 },
          ].map(({ label, icon: Icon }) => <a key={label} href="#" onClick={e => e.preventDefault()} className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"><Icon size={16} aria-hidden="true" />{label}</a>)}
        </nav>
        <div className="flex shrink-0 items-center gap-2 lg:order-last">
          {[{ label: 'Billing', icon: CreditCard }, { label: 'Settings', icon: Settings }].map(({ label, icon: Icon }) => <button key={label} type="button" aria-label={label} className="flex size-10 items-center justify-center rounded-md border border-input bg-card"><Icon size={16} /></button>)}
          <button type="button" className="flex h-10 shrink-0 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm font-medium"><LogOut size={16} />Sign Out</button>
        </div>
      </div>
    </header>
    <main className="welcome-home">
      <div className="welcome-inner">
        <div className="welcome-intro">
          <div className="welcome-eyebrow"><span className="welcome-eyebrow-line" aria-hidden="true" />LEAD FOLLOW-UP</div>
          <h1>Where would you like to go?</h1>
          <p>Turn the people who responded to your ads into booked appointments.</p>
        </div>
        <div className="welcome-grid" aria-label="Choose a destination">
          {cards.map(({ title, description, icon: Icon }, index) => <a key={title} href="#" onClick={e => e.preventDefault()} className={`welcome-card welcome-card--${index}`}>
            <span className="welcome-card-top"><span className="welcome-icon" aria-hidden="true"><Icon size={25} strokeWidth={1.8} /></span><span className="welcome-number" aria-hidden="true">{String(index + 1).padStart(2, '0')} / 04</span></span>
            <span className="welcome-card-bottom"><span className="welcome-card-copy"><span className="welcome-card-title">{title}</span><span className="welcome-card-description">{description}</span></span><span className="welcome-arrow" aria-hidden="true"><ArrowUpRight size={21} strokeWidth={1.8} /></span></span>
          </a>)}
        </div>
        <div className="welcome-guidance" aria-label="Not sure where to start?">
          <span className="welcome-guidance-mark" aria-hidden="true"><span /><span /><span /></span>
          <ul className="welcome-guidance-list">
            {guidance.map(({ question, answer }) => <li key={question}><a href="#" onClick={e => e.preventDefault()}><strong>{question}</strong><span>{answer}</span></a></li>)}
          </ul>
        </div>
      </div>
    </main>
    <footer className="py-8 text-center text-sm text-muted-foreground">Powered by Reactivation Power</footer>
  </div>
}