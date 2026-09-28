import { useState } from 'react'
import { ChevronRight, Headset, RotateCcw } from 'lucide-react'

type Mode = 'reactivation' | 'lead'
type Example = {
  sample: string
  contextLabel: string
  contextValue: string
  reason: string
  title: string
  prompt: string
  first: string
  branches: { label: string; title: string; content: string }[]
}

// Public, two-screen excerpt only. The complete saved flows stay on the server.
// Tests compare every excerpt and branch against the canonical saved flow JSON.
export const SCRIPT_EXAMPLES: Record<Mode, Example> = {
  reactivation: {
    sample: 'Sample: Checking in on a past chiropractic patient',
    contextLabel: 'Previous service',
    contextValue: 'Chiropractic',
    reason: 'Marcus, last seen 14 months ago',
    title: 'Opening Question',
    prompt: 'Tap what the patient says',
    first: 'So {{contact_first_name}}, how have you felt since you finished your chiropractic care with us? I usually hear one of three things. Still feeling great, starting to flare up, or pretty much back to where you started. Which one is closest for you?\n\n(Only three answers. Tap the one you hear.)',
    branches: [
      { label: '“Still feeling great”', title: 'Still feeling great', content: "That's great to hear, {{contact_first_name}}. That's exactly what we hope for when someone finishes care with us. {{provider_name}} will be glad to know you're still doing well.\n\n(Let them respond, then continue.)" },
      { label: '“It’s starting to flare up again”', title: 'Starting to flare up', content: 'Thanks for telling me, {{contact_first_name}}. Your notes say you were moving and feeling better when you finished. What seems to bring the flare-up on?\n\n(Let them answer. Stay warm. Do not book yet.)' },
      { label: '“Pretty much back to where I was”', title: 'Back to where they started', content: "I'm sorry to hear that, {{contact_first_name}}. Your notes say you were moving and feeling better when you finished. What do you think brought it back?\n\n(Let them answer. Stay warm. Do not book yet.)" },
    ],
  },
  lead: {
    sample: 'Sample: Following up on an unbooked campaign lead',
    contextLabel: 'Campaign',
    contextValue: 'New Patient Exam Special',
    reason: 'Priya, web form 2 days ago, no time booked',
    title: 'Why they haven’t booked',
    prompt: 'Tap what the lead says',
    first: "Great. Just so we're on the same page, here's what the {{offer_name}} includes:\n\n{{offer_items}}\n\n{{price_line}}\n\n{{urgency_note}}\n\nI noticed you didn't get a time set up yet. Can I ask what got in the way?\n\n(Let them answer. Tap what you hear.)",
    branches: [
      { label: '“I never got a call back”', title: 'Never got a call back', content: "I'm sorry about that, {{contact_first_name}}. That's on us, and I'm glad I caught you now. You're still interested in getting that looked at, right?\n\n(Let them answer.)" },
      { label: '“I got busy”', title: 'Got busy', content: 'Totally understand. Life fills up fast. The good news is the first visit is quick, and we work around your schedule. Is what you reached out about still bothering you?\n\n(Let them answer.)' },
      { label: '“It was the cost”', title: 'It was the cost', content: "That's fair, and I'm glad you said so. {{price_line}} That covers the first visit, and there's no commitment past it. Is the cost the only thing that held you back?\n\n(Let them answer. If they name another reason, tap that button.)" },
      { label: '“I’m still deciding”', title: 'Still deciding', content: "That makes sense. Most people want to know a bit more before they book. Can I ask what you're weighing?\n\n(Let them answer. Tap what you hear.)" },
      { label: '“I booked somewhere else”', title: 'Booked somewhere else', content: "Good for you for taking care of it. How's it going so far?\n\n(Let them answer. Do not knock the other office.)\n\nIf it doesn't turn out the way you hoped, we're here. Thanks for letting me know, {{contact_first_name}}.\n\n(Add your notes and log the call as Booked elsewhere.)" },
    ],
  },
}

export const SAMPLE_TOKENS = {
  reactivation: { contact_first_name: 'Marcus', provider_name: 'Dr. Patel' },
  lead: {
    contact_first_name: 'Priya',
    offer_name: 'New Patient Exam Special',
    offer_items: 'A consultation, a full exam, and any X-rays that are needed.',
    price_line: 'The first visit is $49.',
    urgency_note: '',
  },
}

export function renderSample(content: string, mode: Mode): string {
  const tokens: Record<string, string> = SAMPLE_TOKENS[mode]
  const rendered = content.replace(/\{\{([^{}]+)\}\}/g, (_, key: string) => {
    if (!(key in tokens)) throw new Error(`Missing homepage sample token: ${key}`)
    return tokens[key]
  })
  return rendered.split('\n\n').filter(Boolean).join('\n\n')
}

function ScriptScreenBody({ content, mode }: { content: string; mode: Mode }) {
  return (
    <div className="dph-say flex flex-col gap-2.5">
      {renderSample(content, mode).split('\n\n').map((paragraph, i) =>
        paragraph.startsWith('(') && paragraph.endsWith(')') ? (
          <p key={i} className="dph-coach">{paragraph}</p>
        ) : (
          <p key={i}>{paragraph}</p>
        ),
      )}
    </div>
  )
}

export function GuidedScriptDemo() {
  const [mode, setMode] = useState<Mode>('reactivation')
  const [choice, setChoice] = useState<number | null>(null)
  const example = SCRIPT_EXAMPLES[mode]
  const selected = choice === null ? null : example.branches[choice]

  function switchMode(next: Mode) {
    setMode(next)
    setChoice(null)
  }

  return (
    <div className="dph-script" aria-label="Two screens of the real script">
      <div className="dph-script-bar">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-accent/10"><Headset className="size-4 text-accent" aria-hidden="true" /></span>
          <span className="whitespace-nowrap text-sm font-semibold text-foreground">Try the real script</span>
        </div>
        <div className="dph-seg" role="group" aria-label="Script type">
          <button type="button" data-testid="button-demo-reactivation" aria-pressed={mode === 'reactivation'} onClick={() => switchMode('reactivation')}>Reactivation</button>
          <button type="button" data-testid="button-demo-lead" aria-pressed={mode === 'lead'} onClick={() => switchMode('lead')}>Lead follow-up</button>
        </div>
      </div>
      <div className="flex flex-col gap-4 p-5 md:p-6">
        <div className="flex flex-col gap-1.5">
          <p className="dph-sample">{example.sample}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{example.contextLabel}: <span className="font-semibold text-foreground">{example.contextValue}</span></span>
            <span aria-hidden="true" className="hidden h-3 w-px bg-border sm:block" />
            <span>{example.reason}</span>
          </div>
        </div>
        {selected ? (
          <div key={`${mode}-${choice}`} className="dph-next flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <p className="dph-mock-note">Screen 2 of 2 <span aria-hidden="true">&middot;</span> {selected.title}</p>
              <span className="dph-heard">Heard: <span>{selected.label}</span></span>
            </div>
            <ScriptScreenBody content={selected.content} mode={mode} />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="max-w-[26rem] text-xs leading-relaxed text-muted-foreground">The script keeps going from here inside the portal: every follow-up question, every objection, voicemail, and the booking itself.</p>
              <button type="button" data-testid="button-demo-reset" onClick={() => setChoice(null)} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-accent transition-colors hover:text-foreground">
                <RotateCcw className="size-3.5" aria-hidden="true" />Try another response
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <p className="dph-mock-note">Screen 1 of 2 <span aria-hidden="true">&middot;</span> {example.title}</p>
              <ScriptScreenBody content={example.first} mode={mode} />
            </div>
            <div className="flex flex-col gap-2">
              <p className="dph-mock-note">{example.prompt}</p>
              <div className="flex flex-col gap-2">
                {example.branches.map((branch, i) => (
                  <button key={branch.label} type="button" data-testid={`button-demo-${mode}-${i}`} className="dph-choice" onClick={() => setChoice(i)}>
                    <span>{branch.label}</span><ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">This is the exact wording your front desk sees. The notes in italics are the coaching cues that come with every screen.</p>
          </>
        )}
      </div>
    </div>
  )
}