type Proposal = {
  number: number
  emailName: string
  subject: string
  kind: 'Photo' | 'Infographic' | 'Infographic (photo-blended)'
  file: string
  placement: string
  why: string
}

const PROPOSALS: Proposal[] = [
  {
    number: 15,
    emailName: 'When Your Best Person Leaves',
    subject: 'What happens when your best front desk person quits?',
    kind: 'Photo',
    file: '/images/emails/15-staff-turnover.png',
    placement:
      'After the paragraph ending "weeks of shadowing and hoping," directly above the four steps.',
    why: 'The email is about loss and fragility. The empty chair, the packed box and the phone still ringing make the single point of failure felt before the steps explain the fix.',
  },
  {
    number: 16,
    emailName: 'A Depreciating Asset',
    subject: 'Your patient list is quietly losing value',
    kind: 'Infographic',
    file: '/images/emails/16-depreciating-asset.png',
    placement:
      'Replaces the "Recently lapsed / Long lapsed" comparison table. Same content, shown as a fading timeline.',
    why: 'The argument is decay over time. A table cannot show something fading; a timeline with the cards ghosting out can.',
  },
  {
    number: 17,
    emailName: 'Somebody Will Treat Them',
    subject: 'Somebody is going to treat your patients this year',
    kind: 'Photo',
    file: '/images/emails/17-someone-else.png',
    placement:
      'Right after "And then they act." and before the dark panel.',
    why: 'The email describes one specific moment: the flare-up, the phone, the search, the ad. Show the moment, then let the dark panel land the line.',
  },
  {
    number: 18,
    emailName: 'Your First 30 Days',
    subject: 'What the first 30 days actually looks like',
    kind: 'Infographic',
    file: '/images/emails/18-first-thirty-days.png',
    placement:
      'Right after "Here is the actual shape of it:", above the five-step list. The list can stay for detail or be trimmed.',
    why: 'It is literally a timeline. A skimmer gets the whole rollout in two seconds before reading a word of the steps.',
  },
  {
    number: 19,
    emailName: 'You Don\u2019t Run This Yourself',
    subject: "You don't have to be the one making these calls",
    kind: 'Photo',
    file: '/images/emails/19-not-your-job.png',
    placement:
      'After the "You don\u2019t..." checklist, before "What you actually do is look at a dashboard when you feel like it."',
    why: 'Division of labor is easier shown than listed: the doctor absorbed in a patient, the team working the phones in the background.',
  },
  {
    number: 20,
    emailName: 'We\u2019ll Tell You If It\u2019s Not a Fit',
    subject: "If your list is too small, we'll tell you",
    kind: 'Photo',
    file: '/images/emails/20-straight-answer.png',
    placement:
      'After "What the call actually looks like:", above the three steps.',
    why: 'This email is about tone. A relaxed owner on a call, unguarded and taking notes, sets that tone before the steps describe it.',
  },
  {
    number: 21,
    emailName: 'Your Best-Margin Services',
    subject: 'Your best-margin services are the ones nobody knows about',
    kind: 'Infographic (photo-blended)',
    file: '/images/emails/21-cash-services.png',
    placement:
      'Replaces the "Selling to strangers / Offering to past patients" comparison table.',
    why: 'The comparison is the spine of the email. Making it visual with the red light panel and devices behind it ties the argument to the cash services it is about.',
  },
  {
    number: 22,
    emailName: 'One to Three Patients Covers It',
    subject: 'How many patients does it take to pay for this?',
    kind: 'Infographic',
    file: '/images/emails/22-one-conversation.png',
    placement:
      'Replaces the math box (Hundreds / One to three / Margin). Same content, drawn.',
    why: 'Same treatment as the Email 13 graphic. The teal ONE TO THREE block being the hero is the entire email in a single glance, and the range matches the corrected copy so the sales call lands inside it.',
  },
]

const photoCount = PROPOSALS.filter((p) => p.kind === 'Photo').length

export default function GraphicsReviewPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 py-12">
        <header className="flex flex-col gap-3">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Review only &mdash; not inserted yet
          </p>
          <h1 className="text-balance text-3xl font-semibold">
            Proposed graphics for Chiropractic Emails 15&ndash;22
          </h1>
          <p className="max-w-2xl text-pretty leading-relaxed text-muted-foreground">
            {`${photoCount} photo-style inserts and ${PROPOSALS.length - photoCount} infographics, all landscape so they don't add length. Each one is shown at the 520px width it would occupy inside the email.`}
          </p>
        </header>

        <ol className="flex flex-col gap-12">
          {PROPOSALS.map((p) => (
            <li key={p.number} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-semibold">
                    Email {p.number} &mdash; {p.emailName}
                  </h2>
                  <span className="rounded-full border border-border px-3 py-0.5 text-xs font-medium text-muted-foreground">
                    {p.kind}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">Subject: {p.subject}</p>
              </div>

              <div className="w-full max-w-[520px] overflow-hidden rounded-md border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element -- temp review page, plain img keeps the exact email rendering */}
                <img
                  src={p.file}
                  alt={`Proposed graphic for Email ${p.number}: ${p.emailName}`}
                  className="block h-auto w-full"
                />
              </div>

              <dl className="grid gap-3 text-sm sm:grid-cols-[120px_1fr]">
                <dt className="font-medium">Where it goes</dt>
                <dd className="text-pretty leading-relaxed text-muted-foreground">{p.placement}</dd>
                <dt className="font-medium">Why this type</dt>
                <dd className="text-pretty leading-relaxed text-muted-foreground">{p.why}</dd>
              </dl>
            </li>
          ))}
        </ol>
      </div>
    </main>
  )
}
