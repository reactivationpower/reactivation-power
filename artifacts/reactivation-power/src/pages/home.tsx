import { Link } from 'wouter'
import {
  ArrowRight, CalendarCheck, ClipboardList, DollarSign, Headset,
  ListChecks, Megaphone, PhoneCall, ShieldCheck, Users,
} from 'lucide-react'
import { OpportunityProvider } from '@/components/landing/opportunity-context'
import { CombinedCalculator } from '@/components/homepage/combined-calculator'
import { ClickToPlayVideo } from '@/components/video/click-to-play-video'
import { INTRO_VIDEO } from '@/components/video/video-assets'
import { WalkthroughSection } from '@/components/video/walkthrough-section'
import { GuidedScriptDemo } from '@/components/homepage/guided-script-demo'
import { ServicesWeSupport } from '@/components/site/services-we-support'
import { SiteFooter } from '@/components/site/site-footer'
import { SiteHeader } from '@/components/site/site-header'
import { PRACTICE_TYPES_LINE } from '@workspace/niche-catalog'
import '@/components/homepage/home.css'

const PRODUCTS = [
  {
    id: 'reactivation', tone: 'teal', icon: Users, kicker: 'Workflow 01',
    title: 'Patient Reactivation', tagline: 'Bring past patients back to the practice.',
    body: 'Your front desk works through your inactive patient list with a word-for-word script written for the service each patient originally came in for — so a lapsed decompression patient hears a different conversation than a past Botox client.',
    points: ['Scripts written per service, not one generic pitch', 'Leads with care and offers responses to common questions', 'Follow-ups and callbacks resurface on schedule'],
    cta: 'Explore Reactivation', href: '#reactivation',
    secondary: 'See what your inactive list could be worth',
  },
  {
    id: 'lead', tone: 'navy', icon: Megaphone, kicker: 'Workflow 02',
    title: 'Lead Follow-Up', tagline: 'Call incoming inquiries with campaign context.',
    body: 'When someone responds to a campaign or promotion, your team calls with a script built around that exact ad or offer — what they saw, what it costs, what happens next — instead of a cold “I saw you filled out a form.”',
    points: ['Scripts written per campaign or offer', 'Works from a lead list or a connected lead source', 'Missed and unbooked leads stay in the follow-up queue'],
    cta: 'Explore Lead Follow-Up', href: '#lead-follow-up',
    secondary: 'See what more booked leads could be worth',
  },
] as const

const REACTIVATION_PATH = [
  { icon: ClipboardList, title: 'Your inactive patient list', body: 'Export the patients who have not been in for a while. We organize them by the service they last received.' },
  { icon: PhoneCall, title: 'Service-specific scripts', body: 'Each call opens with the right conversation for that service, then adapts to how the patient responds.' },
  { icon: CalendarCheck, title: 'Outcomes you can see', body: 'Booked, call back later, not interested — every result is logged and follow-ups surface automatically.' },
]
const LEAD_PATH = [
  { icon: Megaphone, title: 'Your campaigns or a connected source', body: 'Add the leads from a promotion, or connect the source they come from, and tell us which offer they responded to.' },
  { icon: PhoneCall, title: 'Offer-specific calling', body: 'Your team calls with wording built around that ad or offer, including the questions that offer tends to raise.' },
  { icon: CalendarCheck, title: 'Follow-ups and outcomes', body: 'Booked consults, reminders, and no-answers are tracked so no lead quietly disappears after the first attempt.' },
]
const BENEFITS = [
  { icon: ListChecks, title: 'Guided conversations for staff', body: 'On-screen scripts give your team wording for each step, including common questions and hesitations.' },
  { icon: ShieldCheck, title: 'Care comes first', body: 'Scripts are designed to help your team start with a thoughtful check-in, whether calling a past patient or a new inquiry.' },
  { icon: DollarSign, title: 'Outcomes you can track', body: 'Call results — booked, follow up, or closed — are logged so your team can review its activity.' },
  { icon: Headset, title: 'Your people make the calls', body: 'This is not an autonomous dialer. Patient Pipeline guides a real person from your practice, one conversation at a time.' },
]

const PRODUCT_NAV = [
  { href: '#reactivation', label: 'Reactivation' },
  { href: '#lead-follow-up', label: 'Lead Follow-Up' },
  { href: '#calculator', label: 'Revenue Calculator' },
  { href: '#how-it-works', label: 'How It Works' },
]

function AnchorLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
    >
      {children}
    </Link>
  )
}

function PathCard({ title, description, steps, navy = false }: {
  title: string; description: string; steps: typeof REACTIVATION_PATH; navy?: boolean
}) {
  return (
    <div className={`dph-path ${navy ? 'dph-path--navy' : ''}`}>
      <div className="mb-6 flex items-center gap-3">
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${navy ? 'bg-primary/10 text-primary' : 'bg-accent/10 text-accent'}`}>{title}</span>
        <span className="text-sm text-muted-foreground">{description}</span>
      </div>
      <ol>{steps.map((step, i) => (
        <li key={step.title} className="dph-path-step">
          <span className="dph-path-num">{i + 1}</span>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2"><step.icon className={`size-4 ${navy ? 'text-primary' : 'text-accent'}`} aria-hidden="true" /><h3 className="text-base font-semibold text-foreground">{step.title}</h3></div>
            <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          </div>
        </li>
      ))}</ol>
    </div>
  )
}

function HomeContent() {
  return (
    <div className="dph flex min-h-svh flex-col bg-background">
      <SiteHeader simplified />
      <div className="border-b border-border bg-card">
        <nav aria-label="On this page" className="mx-auto flex max-w-6xl items-center justify-between gap-1 px-2 py-1 md:justify-start md:px-6 md:py-2">
          {PRODUCT_NAV.map(item => <AnchorLink key={item.href} href={item.href} className="flex min-h-11 items-center justify-center whitespace-nowrap rounded-md px-1 py-2 text-center text-[11px] min-[375px]:text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:min-h-0 md:px-3 md:py-1.5 md:text-sm">{item.href === '#calculator' ? <><span className="md:hidden">Calculator</span><span className="hidden md:inline">{item.label}</span></> : item.label}</AnchorLink>)}
          <Link href="/login" className="ml-auto hidden items-center gap-2 whitespace-nowrap rounded-md py-1.5 pl-4 pr-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground md:flex">
            <span aria-hidden="true" className="h-4 w-px bg-border" />
            Client Login
          </Link>
        </nav>
      </div>
      <main className="flex-1">
        <section className="dph-hero">
          <div className="mx-auto max-w-6xl px-4 pb-16 pt-14 md:px-6 md:pb-24 md:pt-20">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
              <div className="flex flex-col gap-6">
                <p className="w-fit rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">{PRACTICE_TYPES_LINE.replace(/med spa/gi, match => match.replace(' ', '\u00a0'))}</p>
                <h1 className="text-balance text-4xl font-bold leading-[1.08] tracking-tight text-foreground md:text-5xl lg:text-[3.4rem]">Reconnect with past patients.<br /><span className="text-accent">Follow up with incoming campaign leads.</span></h1>
                 <p className="max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">Patient Pipeline gives your team two staff-led calling workflows: Reactivation for inactive patients, with scripts tailored to their past service, and Lead Follow-Up for incoming inquiries, with scripts tailored to each campaign. Both are included together in one launch offer.</p>
                <div className="flex flex-wrap items-center gap-3">
                  <Link href="/schedule-a-call" className="rounded-md bg-accent px-6 py-3 text-base font-semibold text-accent-foreground transition-colors hover:bg-accent/90">Schedule a Call</Link>
                   <AnchorLink href="#products" className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-6 py-3 text-base font-semibold text-foreground transition-colors hover:bg-muted">See both workflows <ArrowRight className="size-4" aria-hidden="true" /></AnchorLink>
                </div>
                <ul className="mt-2 grid grid-cols-1 gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                  {['Real people on the phone, not a robo-dialer', 'Scripts that adapt to each response', 'Every outcome logged and followed up'].map(line => <li key={line} className="flex items-start gap-2"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />{line}</li>)}
                </ul>
              </div>
              <div className="flex flex-col gap-3">
                <ClickToPlayVideo {...INTRO_VIDEO} testId="introduction" />
                <AnchorLink href="#full-walkthrough" className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-accent underline-offset-4 hover:underline">Watch the full walkthrough <ArrowRight className="size-3.5" aria-hidden="true" /></AnchorLink>
              </div>
            </div>
          </div>
        </section>
        <section id="products" className="scroll-mt-24 border-y border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
            <div className="mx-auto max-w-3xl text-center">
               <p className="text-xl font-semibold uppercase tracking-wide text-accent md:text-[26px]">Two workflows, one front desk</p>
               <h2 className="mt-4 text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl">Reach past patients and new leads</h2>
               <p className="mt-5 text-pretty text-lg leading-relaxed text-muted-foreground">Reactivation and Lead Follow-Up address different conversations, but both are included together in one Patient Pipeline launch offer for one launch price. Your team makes the calls using guided scripts in the same portal.</p>
            </div>
            <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-2">
              {PRODUCTS.map(p => (
                <article key={p.id} className={`dph-panel flex flex-col gap-6 p-7 md:p-9 ${p.tone === 'navy' ? 'dph-panel--navy' : ''}`}>
                  <div className="flex items-center justify-end gap-4">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{p.kicker}</span>
                  </div>
                  <div className="flex flex-col gap-2"><h3 className="text-3xl font-bold leading-tight tracking-tight text-foreground md:text-[38px]">{p.title}</h3><p className={`text-base font-semibold ${p.tone === 'navy' ? 'text-primary' : 'text-accent'}`}>{p.tagline}</p></div>
                  <p className="text-pretty text-base leading-relaxed text-muted-foreground">{p.body}</p>
                  <ul className="flex flex-col gap-2.5 border-t border-border pt-5">{p.points.map(pt => <li key={pt} className="flex items-start gap-2.5 text-sm leading-snug text-foreground"><span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${p.tone === 'navy' ? 'bg-primary' : 'bg-accent'}`} aria-hidden="true" />{pt}</li>)}</ul>
                  <div className="mt-auto flex flex-col items-start gap-3 pt-2">
                    <AnchorLink href={p.href} className={`inline-flex items-center gap-2 rounded-md px-5 py-3 text-sm font-semibold transition-colors ${p.tone === 'navy' ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-accent text-accent-foreground hover:bg-accent/90'}`}>{p.cta}<ArrowRight className="size-4" aria-hidden="true" /></AnchorLink>
                    <AnchorLink href="#calculator" className={`inline-flex min-h-5 items-center gap-1.5 text-sm font-semibold underline-offset-4 transition-colors hover:underline ${p.tone === 'navy' ? 'text-primary' : 'text-accent'}`}>{p.secondary}<ArrowRight className="size-3.5" aria-hidden="true" /></AnchorLink>
                  </div>
                </article>
              ))}
            </div>
             <p className="mt-8 text-center text-sm text-muted-foreground">Both workflows included together in one launch offer. Schedule a call to talk through your practice.</p>
          </div>
        </section>
        <section id="calculator" className="dph-band scroll-mt-24 border-b border-border">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
            <div className="mx-auto mb-10 max-w-3xl text-center md:mb-12">
              <p className="dph-eyebrow justify-center">Your Revenue Opportunity</p>
              <h2 className="mt-4 text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl">Two ways to grow. See what they could mean together.</h2>
               <p className="mt-5 text-pretty text-lg leading-relaxed text-muted-foreground">Set each side to match your practice. Reactivation works from your inactive patient list; Lead Follow-Up works from incoming campaign inquiries. Both workflows are in the launch offer; these estimates illustrate possible revenue, not expected results.</p>
            </div>
            <CombinedCalculator />
            <p className="mt-6 text-center text-sm text-muted-foreground">Revenue estimates exclude advertising and operating costs. We&apos;ll walk through your assumptions on the strategy call.</p>
          </div>
        </section>
        <section id="how-it-works" className="scroll-mt-24">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
            <div className="mx-auto max-w-3xl text-center">
              <p className="dph-eyebrow justify-center">How it works</p>
              <h2 className="mt-4 text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl">Two paths to a booked appointment</h2>
               <p className="mt-5 text-pretty text-lg leading-relaxed text-muted-foreground">The starting point is different, so the script is different. Patient Pipeline helps your team check in with inactive patients based on their past service and follow up with new leads based on the campaign that brought them in.</p>
            </div>
            <div className="mx-auto mt-8 grid max-w-4xl grid-cols-1 gap-3 md:grid-cols-2">
              <div className="dph-script-keyed"><span className="dph-script-keyed-dot bg-accent" aria-hidden="true" /><div><p className="text-sm font-semibold text-foreground">Reactivation scripts are keyed to the service they last received</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">A lapsed whitening patient and a lapsed implant consult hear two different calls, not one generic recall.</p></div></div>
              <div className="dph-script-keyed"><span className="dph-script-keyed-dot bg-primary" aria-hidden="true" /><div><p className="text-sm font-semibold text-foreground">Lead scripts are keyed to the campaign they came in from</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Your team can discuss the offer and answer questions with that campaign in context.</p></div></div>
            </div>
            <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <PathCard title="Reactivation" description="Starts from your patient list" steps={REACTIVATION_PATH} />
              <PathCard title="Lead Follow-Up" description="Starts from a campaign" steps={LEAD_PATH} navy />
            </div>
            <div className="mx-auto mt-12 max-w-4xl"><GuidedScriptDemo /></div>
          </div>
        </section>
        <WalkthroughSection />
        <section id="reactivation" className="dph-band scroll-mt-24 border-y border-border">
          <div className="mx-auto max-w-6xl px-4 pt-16 md:px-6 md:pt-24">
             <div className="mx-auto max-w-3xl text-center"><p className="dph-eyebrow justify-center">Patient Reactivation</p><h2 className="mt-4 text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl">Make space to reconnect with past patients</h2><p className="mt-5 text-pretty text-lg leading-relaxed text-muted-foreground">Your team can check in with inactive patients using a guided conversation organized by the service they came in for.</p></div>
          </div>
          <ServicesWeSupport surface="card" className="!bg-transparent" additionalServices={{ chiropractic: ['HBOT'] }} />
        </section>
        <section id="lead-follow-up" className="scroll-mt-24">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
            <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[1fr_1fr]">
              <div className="flex flex-col gap-5">
                <p className="dph-eyebrow">Lead Follow-Up</p>
                <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl">The offer they clicked is the conversation they expect</h2>
                 <p className="text-pretty text-lg leading-relaxed text-muted-foreground">Lead Follow-Up scripts are written around each campaign or offer you run — its terms and common questions — so your team can follow up with incoming inquiries in context.</p>
                <p className="text-pretty text-base leading-relaxed text-muted-foreground">Lead scripts are built per campaign as you launch them. They are not a copy of the reactivation library; each one is written for the offer it supports.</p>
                <Link href="/schedule-a-call" className="mt-2 inline-flex w-fit items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">Talk through a campaign <ArrowRight className="size-4" aria-hidden="true" /></Link>
              </div>
              <div className="flex flex-col gap-4">
                <p className="dph-mock-note">Example: one offer, one script</p>
                <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                   <div className="flex items-start justify-between gap-4 border-b border-border pb-4"><div className="flex flex-col gap-1"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Campaign</p><p className="text-base font-semibold text-foreground">New Patient Exam &amp; X-Rays</p></div><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">Sample</span></div>
                  <dl className="grid grid-cols-2 gap-4 py-4 text-sm"><div><dt className="text-xs text-muted-foreground">Source</dt><dd className="font-medium text-foreground">Google Ads landing page</dd></div><div><dt className="text-xs text-muted-foreground">Script covers</dt><dd className="font-medium text-foreground">Price, what is included, insurance questions</dd></div></dl>
                  <div className="flex flex-col gap-2 border-t border-border pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Follow-up queue</p>
                    {[{ name: 'J. Alvarez', status: 'No answer — call back 4:30 PM', tone: 'text-muted-foreground' }, { name: 'T. Nguyen', status: 'Booked Thursday 9:15 AM', tone: 'dph-success' }, { name: 'R. Okafor', status: 'Asked about insurance — text sent', tone: 'text-muted-foreground' }].map(row => <div key={row.name} className="flex items-center justify-between gap-4 rounded-md bg-muted/60 px-3 py-2 text-sm"><span className="font-medium text-foreground">{row.name}</span><span className={`text-xs ${row.tone}`}>{row.status}</span></div>)}
                  </div>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">Illustrative example only. Names and figures are sample values, not actual patient outcomes.</p>
              </div>
            </div>
          </div>
        </section>
        <section className="border-y border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
             <div className="mx-auto max-w-3xl text-center"><p className="dph-eyebrow justify-center">Built into both workflows</p><h2 className="mt-4 text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl">How Patient Pipeline supports your team</h2></div>
            <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2">{BENEFITS.map(b => <div key={b.title} className="flex gap-4 rounded-xl border border-border bg-background p-6"><span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent/10"><b.icon className="size-5 text-accent" aria-hidden="true" /></span><div className="flex flex-col gap-2"><h3 className="text-lg font-semibold text-foreground">{b.title}</h3><p className="text-sm leading-relaxed text-muted-foreground">{b.body}</p></div></div>)}</div>
          </div>
        </section>
        <section className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
          <div className="dph-cta px-6 py-14 text-center md:px-12 md:py-20">
             <h2 className="mx-auto max-w-2xl text-balance text-3xl font-bold tracking-tight md:text-4xl">Two workflows. One launch offer. Let&apos;s talk.</h2>
             <p className="mx-auto mt-4 max-w-xl text-pretty text-lg leading-relaxed text-primary-foreground/80">We&apos;ll look at your inactive list, incoming campaign inquiries, and what your team can realistically take on. Reactivation and Lead Follow-Up are both included for one launch price. No pressure, no obligation.</p>
             <div className="mt-8 flex flex-wrap items-center justify-center gap-3"><Link href="/schedule-a-call" className="rounded-md bg-accent px-8 py-3.5 text-base font-semibold text-accent-foreground transition-colors hover:bg-accent/90">Schedule a Call</Link><AnchorLink href="#products" className="rounded-md border border-primary-foreground/30 px-8 py-3.5 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-foreground/10">Explore both workflows</AnchorLink></div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}

export default function HomePage() {
  return <OpportunityProvider><HomeContent /></OpportunityProvider>
}