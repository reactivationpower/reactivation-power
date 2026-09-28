import { useState } from 'react'
import {
  ArrowRight,
  CalendarCheck,
  ChevronRight,
  ClipboardList,
  DollarSign,
  Headset,
  ListChecks,
  Megaphone,
  PhoneCall,
  RotateCcw,
  ShieldCheck,
  Users,
} from 'lucide-react'
import {
  HeroOpportunity,
  OpportunityProvider,
  ServicesWeSupport,
  SiteFooter,
  SiteHeader,
  StaticLink,
  PRACTICE_TYPES_LINE,
} from './Shell'
import './_group.css'
import './Proposed.css'

/* ------------------------------------------------------------------ */
/* Guided-script demo content (mockup only)                            */
/* ------------------------------------------------------------------ */

type ScriptMode = 'reactivation' | 'lead'

type ScriptBranch = {
  label: string
  next: string
  outcome: string
}

type ScriptExample = {
  contextLabel: string
  contextValue: string
  reason: string
  opening: string
  prompt: string
  branches: ScriptBranch[]
}

const SCRIPT_EXAMPLES: Record<ScriptMode, ScriptExample> = {
  reactivation: {
    contextLabel: 'Previous service',
    contextValue: 'Spinal Decompression',
    reason: 'Last visit 14 months ago',
    opening:
      "Hi Marcus, it's Dana from Lakeview Chiropractic. You did a decompression series with Dr. Patel a while back and I'm just checking in — how has your lower back been holding up since then?",
    prompt: 'What did the patient say?',
    branches: [
      {
        label: 'Feeling good, no issues',
        next:
          "That's great to hear. A lot of our decompression patients come in for a quick maintenance check every six months or so to keep it that way — would a morning or an afternoon work better for you?",
        outcome: 'Offer maintenance visit',
      },
      {
        label: 'It has flared up again',
        next:
          "I'm sorry to hear that. Dr. Patel would want to see how things have changed before recommending anything — I can get you in this week for a re-evaluation. Does Tuesday or Thursday work?",
        outcome: 'Book re-evaluation',
      },
      {
        label: 'Too busy right now',
        next:
          "Totally understand. Would it be okay if I made a note to check back in a couple of months? And if the back acts up before then, just call us and we'll find you a spot.",
        outcome: 'Schedule follow-up',
      },
    ],
  },
  lead: {
    contextLabel: 'Campaign / offer',
    contextValue: 'Spring Botox Special — $99 First Area',
    reason: 'Facebook lead form, 22 minutes ago',
    opening:
      "Hi Priya, this is Dana with Glow Aesthetics. You just requested info on our $99 first-area Botox special — I wanted to reach out while it's fresh. Have you had Botox before, or would this be your first time?",
    prompt: 'What did the lead say?',
    branches: [
      {
        label: 'First time, a little nervous',
        next:
          "That's really common, and honestly the consult is the best place to start. Our nurse walks through exactly what to expect and there's no commitment. I have a spot Friday at 2 or Saturday at 10 — which is better?",
        outcome: 'Book consult',
      },
      {
        label: 'Had it before, asking about price',
        next:
          "Perfect. The $99 covers your first treatment area, and additional areas are priced at our standard rate — I can text you the breakdown. Want me to hold a time this week while the special is running?",
        outcome: 'Send pricing, offer time',
      },
      {
        label: 'Just browsing for now',
        next:
          "No problem at all. The special runs through the end of the month — can I text you a reminder a few days before it ends so you don't miss it?",
        outcome: 'Set reminder follow-up',
      },
    ],
  },
}

function GuidedScriptDemo() {
  const [mode, setMode] = useState<ScriptMode>('reactivation')
  const [choice, setChoice] = useState<number | null>(null)
  const example = SCRIPT_EXAMPLES[mode]
  const selected = choice === null ? null : example.branches[choice]

  function switchMode(next: ScriptMode) {
    setMode(next)
    setChoice(null)
  }

  return (
    <div className="dph-script" aria-label="Guided script example">
      <div className="dph-script-bar">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-accent/10">
            <Headset className="size-4 text-accent" aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold text-foreground">Front-desk call screen</span>
        </div>
        <div className="dph-seg" role="group" aria-label="Script type">
          <button type="button" aria-pressed={mode === 'reactivation'} onClick={() => switchMode('reactivation')}>
            Reactivation
          </button>
          <button type="button" aria-pressed={mode === 'lead'} onClick={() => switchMode('lead')}>
            Lead follow-up
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-5 md:p-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            {example.contextLabel}:{' '}
            <span className="font-semibold text-foreground">{example.contextValue}</span>
          </span>
          <span aria-hidden="true" className="hidden h-3 w-px bg-border sm:block" />
          <span>{example.reason}</span>
        </div>

        <div className="flex flex-col gap-2">
          <p className="dph-mock-note">Say this</p>
          <p className="dph-say">{example.opening}</p>
        </div>

        <div className="flex flex-col gap-2">
          <p className="dph-mock-note">{example.prompt}</p>
          <div className="flex flex-col gap-2">
            {example.branches.map((branch, i) => (
              <button
                key={branch.label}
                type="button"
                className="dph-choice"
                aria-pressed={choice === i}
                onClick={() => setChoice(i)}
              >
                <span>{branch.label}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>

        {selected ? (
          <div key={`${mode}-${choice}`} className="dph-next flex flex-col gap-2">
            <p className="dph-mock-note">Then say</p>
            <p className="dph-say">{selected.next}</p>
            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="inline-flex items-center gap-1.5 rounded-full dph-success-bg dph-success px-2.5 py-1 text-xs font-semibold">
                <CalendarCheck className="size-3.5" aria-hidden="true" />
                {selected.outcome}
              </span>
              <button
                type="button"
                onClick={() => setChoice(null)}
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Try another response
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Pick a response to see the next wording. Your team stays on the call — the script simply keeps up.
          </p>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Static content                                                      */
/* ------------------------------------------------------------------ */

const PRODUCTS = [
  {
    id: 'reactivation',
    tone: 'teal' as const,
    icon: Users,
    kicker: 'Product 01',
    title: 'Patient Reactivation',
    tagline: 'Bring past patients back to the practice.',
    body: 'Your front desk works through your inactive patient list with a word-for-word script written for the service each patient originally came in for — so a lapsed decompression patient hears a different conversation than a past Botox client.',
    points: [
      'Scripts written per service, not one generic pitch',
      'Leads with care, handles every common objection',
      'Follow-ups and callbacks resurface on schedule',
    ],
    cta: 'Explore Reactivation',
    href: '#reactivation',
  },
  {
    id: 'lead',
    tone: 'navy' as const,
    icon: Megaphone,
    kicker: 'Product 02',
    title: 'Lead Follow-Up',
    tagline: 'Turn new leads into booked appointments.',
    body: 'When someone responds to a campaign or promotion, your team calls with a script built around that exact ad or offer — what they saw, what it costs, what happens next — instead of a cold “I saw you filled out a form.”',
    points: [
      'Scripts written per campaign or offer',
      'Works from a lead list or a connected lead source',
      'Missed and unbooked leads stay in the follow-up queue',
    ],
    cta: 'Explore Lead Follow-Up',
    href: '#lead-follow-up',
  },
]

const REACTIVATION_PATH = [
  {
    icon: ClipboardList,
    title: 'Your inactive patient list',
    body: 'Export the patients who have not been in for a while. We organize them by the service they last received.',
  },
  {
    icon: PhoneCall,
    title: 'Service-specific scripts',
    body: 'Each call opens with the right conversation for that service, then adapts to how the patient responds.',
  },
  {
    icon: CalendarCheck,
    title: 'Outcomes you can see',
    body: 'Booked, call back later, not interested — every result is logged and follow-ups surface automatically.',
  },
]

const LEAD_PATH = [
  {
    icon: Megaphone,
    title: 'Your campaigns or a connected source',
    body: 'Add the leads from a promotion, or connect the source they come from, and tell us which offer they responded to.',
  },
  {
    icon: PhoneCall,
    title: 'Offer-specific calling',
    body: 'Your team calls with wording built around that ad or offer, including the questions that offer tends to raise.',
  },
  {
    icon: CalendarCheck,
    title: 'Follow-ups and outcomes',
    body: 'Booked consults, reminders, and no-answers are tracked so no lead quietly disappears after the first attempt.',
  },
]

const BENEFITS = [
  {
    icon: ListChecks,
    title: 'No sales experience needed',
    body: 'The script tells your team exactly what to say at every turn, including the objections — so anyone at the front desk can make the call with confidence.',
  },
  {
    icon: ShieldCheck,
    title: 'Reputation-safe by design',
    body: 'Every script leads with genuine care, whether it is a patient you have not seen in a year or a stranger who clicked an ad. Nobody should feel sold to.',
  },
  {
    icon: DollarSign,
    title: 'Built around revenue you can measure',
    body: 'Every call ends in a logged outcome — booked, follow up, or closed — so you can see what the phone is actually producing each month.',
  },
  {
    icon: Headset,
    title: 'Your people make the calls',
    body: 'This is not an autonomous dialer. Reactivation Power guides a real person from your practice, one conversation at a time.',
  },
]

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

const PRODUCT_NAV = [
  { href: '#reactivation', label: 'Reactivation' },
  { href: '#lead-follow-up', label: 'Lead Follow-Up' },
  { href: '#how-it-works', label: 'How It Works' },
]

function scrollToAnchor(href: string) {
  const id = href.replace('#', '')
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function AnchorLink({
  href,
  className,
  children,
}: {
  href: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <StaticLink href={href} className={className} onClick={() => scrollToAnchor(href)}>
      {children}
    </StaticLink>
  )
}

export function Proposed() {
  return (
    <div className="dph flex min-h-svh flex-col bg-background">
      <SiteHeader />

      {/* Product anchor strip — sits under the retained header */}
      <div className="border-b border-border bg-card">
        <nav
          aria-label="On this page"
          className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 py-2 md:px-6"
        >
          <span className="mr-2 hidden text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:block">
            Two products
          </span>
          {PRODUCT_NAV.map((item) => (
            <AnchorLink
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </AnchorLink>
          ))}
        </nav>
      </div>

      <main className="flex-1">
        {/* Hero */}
        <section className="dph-hero">
          <div className="mx-auto max-w-6xl px-4 pb-16 pt-14 md:px-6 md:pb-24 md:pt-20">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
              <div className="flex flex-col gap-6">
                <p className="w-fit rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
                  {PRACTICE_TYPES_LINE}
                </p>
                <h1 className="text-balance text-4xl font-bold leading-[1.08] tracking-tight text-foreground md:text-5xl lg:text-[3.4rem]">
                  Bring past patients back.
                  <br />
                  <span className="text-accent">Turn new leads into booked appointments.</span>
                </h1>
                <p className="max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
                  Reactivation Power gives your front desk guided, word-for-word
                  phone scripts that change based on who is on the line — the
                  service a past patient last received, or the specific ad or
                  offer a new lead responded to.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <StaticLink
                    href="/schedule-a-call"
                    className="rounded-md bg-accent px-6 py-3 text-base font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
                  >
                    Schedule a Call
                  </StaticLink>
                  <AnchorLink
                    href="#products"
                    className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-6 py-3 text-base font-semibold text-foreground transition-colors hover:bg-muted"
                  >
                    See both products
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </AnchorLink>
                </div>
                <ul className="mt-2 grid grid-cols-1 gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                  {[
                    'Real people on the phone, not a robo-dialer',
                    'Scripts that adapt to each response',
                    'Every outcome logged and followed up',
                  ].map((line) => (
                    <li key={line} className="flex items-start gap-2">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>

              <GuidedScriptDemo />
            </div>
          </div>
        </section>

        {/* Two products */}
        <section id="products" className="scroll-mt-24 border-y border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
            <div className="mx-auto max-w-3xl text-center">
              <p className="dph-eyebrow justify-center">Two products, one front desk</p>
              <h2 className="mt-4 text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                Choose the calls your practice needs to make
              </h2>
              <p className="mt-5 text-pretty text-lg leading-relaxed text-muted-foreground">
                Reactivation and Lead Follow-Up are separate offerings. Start
                with one, add the other when it makes sense — both run on the
                same guided-script call screen your team already knows.
              </p>
            </div>

            <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-2">
              {PRODUCTS.map((p) => (
                <article
                  key={p.id}
                  className={`dph-panel flex flex-col gap-6 p-7 md:p-9 ${p.tone === 'navy' ? 'dph-panel--navy' : ''}`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <span
                      className={`flex size-12 items-center justify-center rounded-xl ${
                        p.tone === 'navy' ? 'bg-primary/10' : 'bg-accent/10'
                      }`}
                    >
                      <p.icon
                        className={`size-6 ${p.tone === 'navy' ? 'text-primary' : 'text-accent'}`}
                        aria-hidden="true"
                      />
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {p.kicker}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <h3 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">{p.title}</h3>
                    <p className={`text-base font-semibold ${p.tone === 'navy' ? 'text-primary' : 'text-accent'}`}>
                      {p.tagline}
                    </p>
                  </div>
                  <p className="text-pretty text-base leading-relaxed text-muted-foreground">{p.body}</p>
                  <ul className="flex flex-col gap-2.5 border-t border-border pt-5">
                    {p.points.map((pt) => (
                      <li key={pt} className="flex items-start gap-2.5 text-sm leading-snug text-foreground">
                        <span
                          className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                            p.tone === 'navy' ? 'bg-primary' : 'bg-accent'
                          }`}
                          aria-hidden="true"
                        />
                        {pt}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-2">
                    <AnchorLink
                      href={p.href}
                      className={`inline-flex items-center gap-2 rounded-md px-5 py-3 text-sm font-semibold transition-colors ${
                        p.tone === 'navy'
                          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                          : 'bg-accent text-accent-foreground hover:bg-accent/90'
                      }`}
                    >
                      {p.cta}
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </AnchorLink>
                  </div>
                </article>
              ))}
            </div>

            <p className="mt-8 text-center text-sm text-muted-foreground">
              Two products. Choose the right fit for your practice.
            </p>
          </div>
        </section>

        {/* How it works — two paths */}
        <section id="how-it-works" className="scroll-mt-24">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
            <div className="mx-auto max-w-3xl text-center">
              <p className="dph-eyebrow justify-center">How it works</p>
              <h2 className="mt-4 text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                Two paths to a booked appointment
              </h2>
              <p className="mt-5 text-pretty text-lg leading-relaxed text-muted-foreground">
                The starting point is different, so the script is different.
                Most offices don&apos;t know how to talk to a past patient
                differently based on the service they came in for, or to a lead
                differently based on the campaign that brought them in. The
                program does. It hands your front desk the right words for that
                patient, that service, that offer, on every call.
              </p>
            </div>

            <div className="mx-auto mt-8 grid max-w-4xl grid-cols-1 gap-3 md:grid-cols-2">
              <div className="dph-script-keyed">
                <span className="dph-script-keyed-dot bg-accent" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Reactivation scripts are keyed to the service they last received
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    A lapsed whitening patient and a lapsed implant consult hear
                    two different calls, not one generic recall.
                  </p>
                </div>
              </div>
              <div className="dph-script-keyed">
                <span className="dph-script-keyed-dot bg-primary" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Lead scripts are keyed to the campaign they came in from
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    The offer, the promise, and the objections all match the ad
                    that made them raise their hand.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="dph-path">
                <div className="mb-6 flex items-center gap-3">
                  <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
                    Reactivation
                  </span>
                  <span className="text-sm text-muted-foreground">Starts from your patient list</span>
                </div>
                <ol>
                  {REACTIVATION_PATH.map((step, i) => (
                    <li key={step.title} className="dph-path-step">
                      <span className="dph-path-num">{i + 1}</span>
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <step.icon className="size-4 text-accent" aria-hidden="true" />
                          <h3 className="text-base font-semibold text-foreground">{step.title}</h3>
                        </div>
                        <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="dph-path dph-path--navy">
                <div className="mb-6 flex items-center gap-3">
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
                    Lead Follow-Up
                  </span>
                  <span className="text-sm text-muted-foreground">Starts from a campaign</span>
                </div>
                <ol>
                  {LEAD_PATH.map((step, i) => (
                    <li key={step.title} className="dph-path-step">
                      <span className="dph-path-num">{i + 1}</span>
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <step.icon className="size-4 text-primary" aria-hidden="true" />
                          <h3 className="text-base font-semibold text-foreground">{step.title}</h3>
                        </div>
                        <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </section>

        {/* Reactivation section: catalog + calculator */}
        <section id="reactivation" className="dph-band scroll-mt-24 border-y border-border">
          <div className="mx-auto max-w-6xl px-4 pt-16 md:px-6 md:pt-24">
            <div className="mx-auto max-w-3xl text-center">
              <p className="dph-eyebrow justify-center">Patient Reactivation</p>
              <h2 className="mt-4 text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                The most profitable patients are the ones you already have
              </h2>
              <p className="mt-5 text-pretty text-lg leading-relaxed text-muted-foreground">
                A past patient already knows you, already trusts you, and
                already said yes once. Reactivation gives your team the right
                conversation for each of them — organized by the service they
                came in for.
              </p>
            </div>
          </div>

          <ServicesWeSupport surface="card" className="!bg-transparent" />

          <div className="mx-auto max-w-6xl px-4 pb-16 md:px-6 md:pb-24">
            <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1fr_1.1fr]">
              <div className="flex flex-col gap-5">
                <p className="dph-eyebrow">Reactivation calculator</p>
                <h3 className="text-balance text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                  What could your inactive list be worth?
                </h3>
                <p className="text-pretty text-base leading-relaxed text-muted-foreground">
                  Move the sliders to match your practice. The estimate uses an
                  illustrative 5% reactivation rate so you can see the scale of
                  the opportunity — actual results depend on your list, your
                  services, and how consistently the calls get made. It is not
                  a guarantee.
                </p>
                <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                  {[
                    'Applies to the Reactivation product only',
                    'No ad spend assumed — these are patients you already have',
                    'We walk through your real numbers on the strategy call',
                  ].map((line) => (
                    <li key={line} className="flex items-start gap-2.5">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
              <OpportunityProvider>
                <HeroOpportunity />
              </OpportunityProvider>
            </div>
          </div>
        </section>

        {/* Lead follow-up section */}
        <section id="lead-follow-up" className="scroll-mt-24">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
            <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[1fr_1fr]">
              <div className="flex flex-col gap-5">
                <p className="dph-eyebrow">Lead Follow-Up</p>
                <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                  The offer they clicked is the conversation they expect
                </h2>
                <p className="text-pretty text-lg leading-relaxed text-muted-foreground">
                  Most lead follow-up fails because the call has nothing to do
                  with the ad. Lead Follow-Up scripts are written around each
                  campaign or offer you run — the price, the promise, the
                  common questions — so the first call picks up exactly where
                  the ad left off.
                </p>
                <p className="text-pretty text-base leading-relaxed text-muted-foreground">
                  Lead scripts are built per campaign as you launch them. They
                  are not a copy of the reactivation library; each one is
                  written for the offer it supports.
                </p>
                <StaticLink
                  href="/schedule-a-call"
                  className="mt-2 inline-flex w-fit items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Talk through a campaign
                  <ArrowRight className="size-4" aria-hidden="true" />
                </StaticLink>
              </div>

              <div className="flex flex-col gap-4">
                <p className="dph-mock-note">Example: one offer, one script</p>
                <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                  <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
                    <div className="flex flex-col gap-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Campaign</p>
                      <p className="text-base font-semibold text-foreground">New Patient Exam &amp; X-Rays — $49</p>
                    </div>
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                      Active
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-4 py-4 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Source</dt>
                      <dd className="font-medium text-foreground">Google Ads landing page</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Script covers</dt>
                      <dd className="font-medium text-foreground">Price, what is included, insurance questions</dd>
                    </div>
                  </dl>
                  <div className="flex flex-col gap-2 border-t border-border pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Follow-up queue</p>
                    {[
                      { name: 'J. Alvarez', status: 'No answer — call back 4:30 PM', tone: 'text-muted-foreground' },
                      { name: 'T. Nguyen', status: 'Booked Thursday 9:15 AM', tone: 'dph-success' },
                      { name: 'R. Okafor', status: 'Asked about insurance — text sent', tone: 'text-muted-foreground' },
                    ].map((row) => (
                      <div key={row.name} className="flex items-center justify-between gap-4 rounded-md bg-muted/60 px-3 py-2 text-sm">
                        <span className="font-medium text-foreground">{row.name}</span>
                        <span className={`text-xs ${row.tone}`}>{row.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Illustrative example for this mockup. Names and figures are placeholders.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Shared benefits */}
        <section className="border-y border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
            <div className="mx-auto max-w-3xl text-center">
              <p className="dph-eyebrow justify-center">Built into both products</p>
              <h2 className="mt-4 text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                Why practices choose Reactivation Power
              </h2>
            </div>
            <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2">
              {BENEFITS.map((b) => (
                <div key={b.title} className="flex gap-4 rounded-xl border border-border bg-background p-6">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                    <b.icon className="size-5 text-accent" aria-hidden="true" />
                  </span>
                  <div className="flex flex-col gap-2">
                    <h3 className="text-lg font-semibold text-foreground">{b.title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{b.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
          <div className="dph-cta px-6 py-14 text-center md:px-12 md:py-20">
            <h2 className="mx-auto max-w-2xl text-balance text-3xl font-bold tracking-tight md:text-4xl">
              Not sure which product fits? Start with a strategy call.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-lg leading-relaxed text-primary-foreground/80">
              We will look at your inactive list, the campaigns you are running,
              and what your front desk can realistically take on — then tell you
              honestly whether Reactivation, Lead Follow-Up, or both makes sense.
              No pressure, no obligation.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <StaticLink
                href="/schedule-a-call"
                className="rounded-md bg-accent px-8 py-3.5 text-base font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
              >
                Schedule a Call
              </StaticLink>
              <AnchorLink
                href="#products"
                className="rounded-md border border-primary-foreground/30 px-8 py-3.5 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-foreground/10"
              >
                Compare the two products
              </AnchorLink>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
