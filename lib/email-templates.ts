export interface EmailTemplate {
  id: string
  name: string
  subject: string
  previewText: string
  angle: string
  html: string
}

// {{contact.first_name}} is a GHL merge tag and works as-is when pasted
// into GHL. The Schedule a Call buttons link to the live landing page,
// where the intake form flows into the booking calendar at
// /healthcare/book-a-call after submit — no placeholders to swap.
const LANDING_PAGE_URL = 'https://reactivationpower.com/healthcare'

const wrap = (body: string, previewText: string) => `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>Reactivation Power</title>
<style>
  body { margin: 0; padding: 0; background-color: #f8fafc; -webkit-text-size-adjust: 100%; }
  table { border-collapse: collapse; }
  img { border: 0; display: block; }
  a { color: #39889f; }
  @media only screen and (max-width: 620px) {
    .container { width: 100% !important; }
    .inner { padding-left: 20px !important; padding-right: 20px !important; }
    .h1 { font-size: 24px !important; line-height: 32px !important; }
    .btn a { display: block !important; }
    .col { display: block !important; width: 100% !important; }
    .gutter { display: none !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${previewText}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;">
  <tr>
    <td align="center" style="padding:32px 12px;">
      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
${body}
      </table>
      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;">
        <tr>
          <td class="inner" style="padding:24px 40px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#62748e;text-align:center;">
            Reactivation Power &middot; Turning old business into new business &amp; new money<br />
            You are receiving this because you connected with us about growing your practice.<br />
            <a href="{{unsubscribe_link}}" style="color:#62748e;text-decoration:underline;">Unsubscribe</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`

const header = `        <tr>
          <td align="center" style="background-color:#ffffff;padding:18px 40px 16px 40px;border-bottom:3px solid #39889f;" class="inner">
            <img src="https://reactivationpower.com/images/logo-slogan.png" alt="Reactivation Power — Turning old business into new business &amp; new money" width="170" style="width:170px;max-width:170px;height:auto;margin:0 auto;" />
          </td>
        </tr>`

const button = (label: string, href: string) => `            <table role="presentation" cellpadding="0" cellspacing="0" class="btn" style="margin:28px 0;">
              <tr>
                <td style="background-color:#39889f;border-radius:6px;">
                  <a href="${href}" style="display:inline-block;padding:14px 32px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;">${label}</a>
                </td>
              </tr>
            </table>`

/* ------------------------------------------------------------------ *
 * Building blocks
 *
 * Every new email is assembled from these so the brand stays
 * consistent while each message gets its own visual device (stat
 * panels, side-by-side comparisons, math breakdowns, step timelines,
 * dark callouts). All table-based with inline styles — no flexbox, no
 * background images — so they render in Outlook and Gmail alike.
 * Deliberately image-free: most inboxes block images by default, and
 * these need to land with images off.
 * ------------------------------------------------------------------ */

const FONT = 'Arial,Helvetica,sans-serif'

const h1 = (text: string) =>
  `            <h1 class="h1" style="margin:0 0 20px 0;font-family:${FONT};font-size:28px;line-height:36px;color:#1d293d;">${text}</h1>`

const p = (text: string) =>
  `            <p style="margin:0 0 16px 0;font-family:${FONT};font-size:16px;line-height:26px;color:#314158;">${text}</p>`

const greet = p('Hi {{contact.first_name}},')

/** Light panel with the teal left rule — the workhorse callout. */
const panel = (lines: string[]) =>
  `            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
              <tr>
                <td style="background-color:#f1f5f9;border-left:4px solid #39889f;padding:20px 24px;">
${lines
  .map(
    (l, i) =>
      `                  <p style="margin:0${i === lines.length - 1 ? '' : ' 0 10px 0'};font-family:${FONT};font-size:15px;line-height:24px;color:#1d293d;">${l}</p>`,
  )
  .join('\n')}
                </td>
              </tr>
            </table>`

/** Dark teal panel — used sparingly, for urgency or a hard truth. */
const darkPanel = (lines: string[]) =>
  `            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
              <tr>
                <td style="background-color:#1d293d;padding:24px 26px;border-radius:6px;">
${lines
  .map(
    (l, i) =>
      `                  <p style="margin:0${i === lines.length - 1 ? '' : ' 0 12px 0'};font-family:${FONT};font-size:16px;line-height:26px;color:#e2e8f0;">${l}</p>`,
  )
  .join('\n')}
                </td>
              </tr>
            </table>`

/** One big number with a caption under it. */
const bigStat = (value: string, label: string) =>
  `            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0;">
              <tr>
                <td align="center" style="background-color:#f1f5f9;padding:26px 24px;border-radius:6px;">
                  <p style="margin:0 0 6px 0;font-family:${FONT};font-size:40px;line-height:46px;font-weight:bold;color:#39889f;">${value}</p>
                  <p style="margin:0;font-family:${FONT};font-size:15px;line-height:23px;color:#1d293d;">${label}</p>
                </td>
              </tr>
            </table>`

/** Two columns that stack on mobile. Right column is the "good" side. */
const compare = (
  leftTitle: string,
  leftItems: string[],
  rightTitle: string,
  rightItems: string[],
) =>
  `            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
              <tr>
                <td class="col" width="48%" valign="top" style="width:48%;background-color:#f1f5f9;padding:18px 20px;border-top:3px solid #90a1b9;">
                  <p style="margin:0 0 12px 0;font-family:${FONT};font-size:12px;line-height:18px;letter-spacing:1px;color:#62748e;"><strong>${leftTitle.toUpperCase()}</strong></p>
${leftItems
  .map(
    (l, i) =>
      `                  <p style="margin:0${i === leftItems.length - 1 ? '' : ' 0 8px 0'};font-family:${FONT};font-size:14px;line-height:22px;color:#45556c;">${l}</p>`,
  )
  .join('\n')}
                </td>
                <td class="gutter" width="4%" style="width:4%;font-size:0;line-height:0;">&nbsp;</td>
                <td class="col" width="48%" valign="top" style="width:48%;background-color:#f1f5f9;padding:18px 20px;border-top:3px solid #39889f;">
                  <p style="margin:0 0 12px 0;font-family:${FONT};font-size:12px;line-height:18px;letter-spacing:1px;color:#39889f;"><strong>${rightTitle.toUpperCase()}</strong></p>
${rightItems
  .map(
    (l, i) =>
      `                  <p style="margin:0${i === rightItems.length - 1 ? '' : ' 0 8px 0'};font-family:${FONT};font-size:14px;line-height:22px;color:#1d293d;">${l}</p>`,
  )
  .join('\n')}
                </td>
              </tr>
            </table>`

/**
 * Full-width hosted graphic. The alt text must carry the whole message so
 * the email still lands in clients that block images by default.
 */
const image = (src: string, alt: string) =>
  `            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
              <tr>
                <td>
                  <img src="${src}" alt="${alt}" width="520" style="display:block;width:100%;max-width:520px;height:auto;margin:0 auto;border-radius:6px;" />
                </td>
              </tr>
            </table>`

/** Stacked calculation that lands on a bold total. */
const mathBox = (
  rows: Array<[string, string]>,
  totalLabel: string,
  totalValue: string,
) =>
  `            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background-color:#f1f5f9;border-radius:6px;">
${rows
  .map(
    ([label, value]) =>
      `              <tr>
                <td style="padding:14px 24px 0 24px;font-family:${FONT};font-size:15px;line-height:23px;color:#45556c;">${label}</td>
                <td align="right" style="padding:14px 24px 0 0;font-family:${FONT};font-size:15px;line-height:23px;color:#1d293d;white-space:nowrap;"><strong>${value}</strong></td>
              </tr>`,
  )
  .join('\n')}
              <tr>
                <td colspan="2" style="padding:16px 24px 0 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:2px solid #cad5e2;font-size:0;line-height:0;">&nbsp;</td></tr></table></td>
              </tr>
              <tr>
                <td style="padding:10px 24px 20px 24px;font-family:${FONT};font-size:16px;line-height:24px;color:#1d293d;"><strong>${totalLabel}</strong></td>
                <td align="right" style="padding:10px 24px 20px 0;font-family:${FONT};font-size:22px;line-height:28px;color:#39889f;white-space:nowrap;"><strong>${totalValue}</strong></td>
              </tr>
            </table>`

/** Numbered steps — for process and timeline emails. */
const steps = (items: Array<[string, string]>) =>
  `            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
${items
  .map(
    ([title, detail], i) =>
      `              <tr>
                <td width="34" valign="top" style="width:34px;padding:0 0 ${i === items.length - 1 ? '0' : '18px'} 0;font-family:${FONT};font-size:15px;line-height:24px;color:#39889f;"><strong>${i + 1}.</strong></td>
                <td valign="top" style="padding:0 0 ${i === items.length - 1 ? '0' : '18px'} 0;font-family:${FONT};font-size:15px;line-height:24px;color:#314158;"><strong style="color:#1d293d;">${title}</strong><br />${detail}</td>
              </tr>`,
  )
  .join('\n')}
            </table>`

/**
 * Checklist rows. The marker is a table-drawn teal square rather than a
 * check character — dingbat glyphs like U+2713 fall back to tofu boxes in
 * clients that render Arial without them.
 */
const checks = (items: string[]) =>
  `            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
${items
  .map(
    (item, i) =>
      `              <tr>
                <td width="24" valign="top" style="width:24px;padding:8px 0 ${i === items.length - 1 ? '0' : '12px'} 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="8" height="8" style="width:8px;height:8px;background-color:#39889f;border-radius:2px;font-size:0;line-height:0;">&nbsp;</td></tr></table>
                </td>
                <td valign="top" style="padding:0 0 ${i === items.length - 1 ? '0' : '12px'} 0;font-family:${FONT};font-size:15px;line-height:24px;color:#314158;">${item}</td>
              </tr>`,
  )
  .join('\n')}
            </table>`

/** Pull quote — used for the things practice owners actually say. */
const quote = (text: string, attribution: string) =>
  `            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
              <tr>
                <td style="padding:4px 0 4px 22px;border-left:4px solid #39889f;">
                  <p style="margin:0 0 8px 0;font-family:${FONT};font-size:19px;line-height:29px;color:#1d293d;font-style:italic;">&ldquo;${text}&rdquo;</p>
                  <p style="margin:0;font-family:${FONT};font-size:14px;line-height:21px;color:#62748e;">${attribution}</p>
                </td>
              </tr>
            </table>`

/** Simple two-column metric readout. */
const metrics = (rows: Array<[string, string]>) =>
  `            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e2e8f0;border-radius:6px;">
${rows
  .map(
    ([label, value], i) =>
      `              <tr>
                <td style="padding:14px 22px;font-family:${FONT};font-size:15px;line-height:23px;color:#45556c;${i === rows.length - 1 ? '' : 'border-bottom:1px solid #e2e8f0;'}">${label}</td>
                <td align="right" style="padding:14px 22px;font-family:${FONT};font-size:15px;line-height:23px;color:#1d293d;${i === rows.length - 1 ? '' : 'border-bottom:1px solid #e2e8f0;'}"><strong>${value}</strong></td>
              </tr>`,
  )
  .join('\n')}
            </table>`

const cta = (lead: string, label = 'Schedule a Call') =>
  `${p(lead)}
${button(label, LANDING_PAGE_URL)}`

const finePrint = (
  text = 'It takes about a minute — answer a few quick questions about your practice, then pick a day and time right on the calendar.',
) =>
  `            <p style="margin:0 0 32px 0;font-family:${FONT};font-size:16px;line-height:26px;color:#314158;">${text}</p>`

const signoff = (line = "To your practice's growth,") =>
  `            <p style="margin:0 0 4px 0;font-family:${FONT};font-size:16px;line-height:26px;color:#314158;">${line}</p>
            <p style="margin:0 0 40px 0;font-family:${FONT};font-size:16px;line-height:26px;color:#1d293d;"><strong>The Reactivation Power Team</strong></p>`

/** Assemble a full body from block strings. */
const compose = (parts: string[]) => `${header}
        <tr>
          <td class="inner" style="padding:40px 40px 0 40px;">
${parts.join('\n')}
          </td>
        </tr>`

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'hidden-revenue',
    name: 'Email 1 — The Revenue Hiding in Your Patient List',
    subject: 'The most profitable list you own is sitting in a filing cabinet',
    previewText:
      'Your inactive patients already know you and trust you. Here is how practices are turning that list into booked appointments — without spending a dollar on ads.',
    angle:
      'Core value proposition: inactive patients are pre-paid marketing. No ad spend, existing trust, proven system.',
    html: wrap(
      `${header}
        <tr>
          <td class="inner" style="padding:40px 40px 0 40px;">
            <h1 class="h1" style="margin:0 0 20px 0;font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:36px;color:#1d293d;">The most profitable patients you'll ever market to have already been in your office</h1>
            <p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#314158;">Hi {{contact.first_name}},</p>
            <p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#314158;">Every practice we talk to is trying to solve the same problem: <strong>how do we get more new patients in the door?</strong> So they spend more on ads, more on SEO, more on marketing to strangers who have never heard of them.</p>
            <p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#314158;">Meanwhile, the easiest revenue in the building is sitting untouched: <strong>your inactive patient list.</strong></p>
            <p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#314158;">These are people who already know you, already trust you, and already got results with you. They didn't leave because they were unhappy — life just got busy. And reaching them costs you <strong>nothing in ad spend.</strong></p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
              <tr>
                <td>
                  <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Concept_1_Old_Patient_Files_Asset_No_Label-hyoFHnr5ONQKfPJarHrFb9qg6YPadx.png" alt="Your old patient files are an asset — the opportunity is already sitting in your database. 1,000 old patient files, just 10% reactivated through simple outreach, equals 100 returning patients at a $1,000 average patient value: $100,000 in recovered revenue. This is not new business — this is business you already earned." width="520" style="width:100%;max-width:520px;height:auto;margin:0 auto;border-radius:6px;" />
                </td>
              </tr>
            </table>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
              <tr>
                <td style="background-color:#f1f5f9;border-left:4px solid #39889f;padding:20px 24px;">
                  <p style="margin:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#1d293d;"><strong>Reactivating a past patient is 5&ndash;7x cheaper</strong> than acquiring a new one.</p>
                  <p style="margin:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#1d293d;"><strong>20&ndash;40% of inactive lists typically rebook</strong> when contacted the right way.</p>
                  <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#1d293d;"><strong>$0 in advertising required</strong> — the list is an asset you already own.</p>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#314158;">The Reactivation Power Program gives your front desk everything it needs to turn that list into booked appointments: word-for-word interactive call scripts (objections included), an organized call queue, and a dashboard that tracks every dollar recovered. No sales experience needed — the screen tells your team exactly what to say at every turn.</p>
            <p style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#314158;">Grab a time that works for you and we'll walk you through what your list is realistically worth:</p>
${button('Schedule a Call', LANDING_PAGE_URL)}
            <p style="margin:0 0 32px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#314158;">It takes about a minute — answer a few quick questions about your practice, then pick a day and time right on the calendar.</p>
            <p style="margin:0 0 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#314158;">To your practice's growth,</p>
            <p style="margin:0 0 40px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#1d293d;"><strong>The Reactivation Power Team</strong></p>
          </td>
        </tr>`,
      'Your inactive patients already know you and trust you. Here is how practices are turning that list into booked appointments — without spending a dollar on ads.',
    ),
  },
  {
    id: 'no-ad-spend',
    name: 'Email 2 — Stop Paying to Reach Strangers',
    subject: 'Before you spend another dollar on ads, read this',
    previewText:
      'New services, same patients. The fastest way to fill your schedule is the list of people who already said yes to you once.',
    angle:
      'Contrast angle: the cost and friction of marketing to cold audiences vs. tapping existing and inactive patients, especially for new services.',
    html: wrap(
      `${header}
        <tr>
          <td class="inner" style="padding:40px 40px 0 40px;">
            <h1 class="h1" style="margin:0 0 20px 0;font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:36px;color:#1d293d;">Marketing to strangers is the most expensive way to grow</h1>
            <p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#314158;">Hi {{contact.first_name}},</p>
            <p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#314158;">Think about what it takes to turn a total stranger into a patient: they have to see your ad, trust your name, overcome their skepticism, and finally pick up the phone. You pay for every step of that journey — and ad costs climb every year.</p>
            <p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#314158;">Now compare that to a past patient. The trust is built. The skepticism is gone. They've already said yes to you once. <strong>All they need is a genuine reason to come back — and someone to reach out.</strong></p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
              <tr>
                <td>
                  <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Concept_3_Marketing_Dollar_No_Label-hRD6TlNZDpAljxjZxATJhZIlYtOSwo.png" alt="Where would you rather spend your marketing dollar? Acquiring a stranger costs money at every step — ad spend, click, lead, follow-up, appointment — with an uncertain outcome. Reactivating a patient is just a phone call and an appointment: low cost, higher return." width="520" style="width:100%;max-width:520px;height:auto;margin:0 auto;border-radius:6px;" />
                </td>
              </tr>
            </table>
            <p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#314158;">This is especially powerful if you've added <strong>new services</strong> since they were last in. Whether it's a new treatment, new technology, or an expanded program — your existing and inactive patients are the warmest possible audience for it. They just don't know it exists yet.</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
              <tr>
                <td style="background-color:#f1f5f9;border-left:4px solid #39889f;padding:20px 24px;">
                  <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#1d293d;">The Reactivation Power Program turns this into a repeatable system: import your list, and your front desk follows a word-for-word interactive script that handles every response — including the objections. Every call is logged, every callback resurfaces automatically, and your dashboard shows the revenue recovered.</p>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#314158;">Let's look at your patient list together and map out the opportunity:</p>
${button('Schedule a Call', LANDING_PAGE_URL)}
            <p style="margin:0 0 32px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#314158;">It takes about a minute — answer a few quick questions about your practice, then pick a day and time right on the calendar.</p>
            <p style="margin:0 0 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#314158;">To your practice's growth,</p>
            <p style="margin:0 0 40px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#1d293d;"><strong>The Reactivation Power Team</strong></p>
          </td>
        </tr>`,
      'New services, same patients. The fastest way to fill your schedule is the list of people who already said yes to you once.',
    ),
  },
  {
    id: 'front-desk-scripts',
    name: 'Email 3 — Your Team Doesn\u2019t Need Sales Skills',
    subject: "Your front desk doesn't need to be salespeople",
    previewText:
      'The words are already written. Your team reads the screen, taps what the patient said, and the next line appears.',
    angle:
      'Removes the #1 internal objection: "my team can\'t sell." The interactive script carries the call, so no memorizing and no winging it.',
    html: wrap(
      compose([
        h1(
          'Most reactivation attempts fail for a reason that has nothing to do with the list',
        ),
        greet,
        p(
          "Here's how it usually goes. Someone pulls a list of inactive patients, prints it, and hands it to the front desk with three words: <strong>&ldquo;call these people.&rdquo;</strong>",
        ),
        p(
          'By day three, the calling has stopped. Not because your team is lazy — because nobody gave them the words. Picking up the phone to a patient you haven\'t spoken to in two years is uncomfortable when you\'re making it up as you go.',
        ),
        p(
          '<strong>We removed the guesswork entirely.</strong> Your team never has to invent a sentence:',
        ),
        steps([
          [
            'The screen opens the call for them.',
            'The patient\'s name, why you\'re calling, and the exact opening line — word for word.',
          ],
          [
            'The patient responds. Your team taps what they said.',
            '&ldquo;Doing great now&rdquo;, &ldquo;too busy&rdquo;, &ldquo;need to check with my spouse&rdquo; — the real answers, not a script tree that assumes everyone says yes.',
          ],
          [
            'The next words appear instantly.',
            'Including the objections. Especially the objections.',
          ],
          [
            'The call ends with an appointment or a scheduled callback.',
            'Logged automatically. Callbacks resurface on the right day without anyone tracking them on a sticky note.',
          ],
        ]),
        p(
          'There is nothing to memorize and no training weekend to schedule. If your team can read a screen and be kind on the phone, they can run this.',
        ),
        cta(
          "Let's get your team on a call and show you exactly what they'd see:",
        ),
        finePrint(),
        signoff(),
      ]),
      'The words are already written. Your team reads the screen, taps what the patient said, and the next line appears.',
    ),
  },
  {
    id: 'the-math',
    name: 'Email 4 — What Your List Is Actually Worth',
    subject: 'What are 1,000 inactive patients actually worth?',
    previewText:
      'Run the arithmetic on your own list. Even a conservative reactivation rate turns into real money.',
    angle:
      'Pure math / ROI. Makes the opportunity concrete and lets the reader substitute their own numbers.',
    html: wrap(
      compose([
        h1('Let\u2019s do the arithmetic on your patient list'),
        greet,
        p(
          'Most practice owners have a rough sense that there\'s money in their inactive list. Very few have ever put a number on it. So let\'s put one on it.',
        ),
        p(
          'Take a practice with 1,000 inactive patient files and a $1,000 average patient value:',
        ),
        mathBox(
          [
            ['Inactive patient files', '1,000'],
            ['Reactivated at a conservative 10%', '100 patients'],
            ['Average patient value', '$1,000'],
          ],
          'Recovered revenue',
          '$100,000',
        ),
        p(
          '<strong>Cut that in half and it still works.</strong> A 5% reactivation rate on the same list is $50,000 — from patients you already earned, with no ad spend attached to them.',
        ),
        p(
          'Now swap in your real numbers. How many inactive files do you have? What is a patient actually worth over the course of care? That second number is usually higher than owners guess, because they think in terms of one visit instead of one plan of care.',
        ),
        panel([
          'The reason this revenue sits untouched is not that owners don\'t believe in it. It\'s that <strong>nobody in the building owns the process</strong> — so it never gets done consistently.',
        ]),
        cta(
          "On a quick call we'll run these numbers against your actual list and tell you what's realistic:",
        ),
        finePrint(),
        signoff(),
      ]),
      'Run the arithmetic on your own list. Even a conservative reactivation rate turns into real money.',
    ),
  },
  {
    id: 'already-tried',
    name: 'Email 5 — \u201CWe Already Tried Calling Them\u201D',
    subject: '"We already tried calling our old patients"',
    previewText:
      'We hear this constantly. It usually means a list got printed and the calls stopped by Thursday.',
    angle:
      'Handles the biggest objection head-on: they tried and it did not work. Reframes failure as missing system, not a bad list.',
    html: wrap(
      compose([
        h1('&ldquo;We tried that. It didn\u2019t really work.&rdquo;'),
        greet,
        p(
          'We hear this on nearly every call — and it\'s a fair thing to say. Most practices have taken a run at their old patients at some point.',
        ),
        p(
          'So we always ask the same question: <strong>what exactly did that look like?</strong> The answer is almost always some version of &ldquo;we printed a list and had someone start calling.&rdquo;',
        ),
        p('That\'s not a reactivation system. That\'s a list and good intentions.'),
        image(
          'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/ChatGPT%20Image%20Sep%2010%2C%202026%2C%2004_00_41%20PM-eZvgLBr0XMdYO0claE03MDZby21orn.png',
          'A list and good intentions versus an actual system. A list and good intentions: no words, every call improvised; one awkward objection stalls the whole thing; calls fizzle out within a week; no record of who was called or what they said; callbacks live on sticky notes and get lost; no idea whether it worked. An actual system: word-for-word script on screen; every objection has a scripted response; a daily queue that tells your team who is next; every call logged against the patient; callbacks resurface automatically on the right day; a dashboard showing appointments and revenue recovered.',
        ),
        p(
          'Same list. Same team. Completely different outcome — because the hard parts stopped depending on someone\'s memory and mood.',
        ),
        p(
          'If your last attempt fizzled, that\'s not evidence your list is dead. It\'s evidence nobody gave your team the infrastructure to finish the job.',
        ),
        cta('Show us what you tried before and we\'ll tell you what was missing:'),
        finePrint(),
        signoff(),
      ]),
      'We hear this constantly. It usually means a list got printed and the calls stopped by Thursday.',
    ),
  },
  {
    id: 'no-time',
    name: 'Email 6 — \u201CMy Team Has No Time\u201D',
    subject: 'This takes 45 minutes a day, not a new hire',
    previewText:
      'Nobody has a spare eight hours. Fortunately, this does not need one.',
    angle:
      'Handles the time/capacity objection with a small, concrete daily commitment instead of a vague program.',
    html: wrap(
      compose([
        h1('You don\u2019t need a spare eight hours. You need 45 minutes.'),
        greet,
        p(
          'When we describe a reactivation program, the most common reaction is some form of <strong>&ldquo;my team is already buried.&rdquo;</strong> That\'s fair. Front desks are the busiest place in the building.',
        ),
        p('So here is the actual commitment:'),
        image(
          'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/ChatGPT%20Image%20Sep%2010%2C%202026%2C%2004_11_50%20PM-1o5BhlAnb79EDyLjzVdB7JFsnNR4xn.png',
          '15 calls a day. Roughly 45 minutes of phone time, worked into the natural gaps your front desk already has. 45 minutes a day. No new hire required. Fits into natural gaps. A smiling front-desk team member on the phone at a chiropractic office.',
        ),
        p(
          'Fifteen calls a day is over <strong>300 conversations a month.</strong> No new hire, no overtime, no dedicated call room. Most offices run them in the slow stretches: mid-morning, right after lunch, the last half hour before close.',
        ),
        p('It stays small because the system removes the friction:'),
        checks([
          'The queue already knows who to call next — no deciding, no hunting through files.',
          'The script is on screen, so there is no prep time before a call.',
          'Notes are logged with a tap instead of written up afterward.',
          'Callbacks reappear on the right day on their own.',
        ]),
        p(
          'The practices that win at this are not the ones with extra staff. They\'re the ones who made it small enough to actually happen every day.',
        ),
        cta("Let's look at your schedule and find the 45 minutes:"),
        finePrint(),
        signoff(),
      ]),
      'Nobody has a spare eight hours. Fortunately, this does not need one.',
    ),
  },
  {
    id: 'why-not-text',
    name: 'Email 7 — \u201CCan\u2019t We Just Text Them?\u201D',
    subject: "Can't we just text our old patients?",
    previewText:
      'A text can remind someone of a decision they already made. It cannot restart care that stopped.',
    angle:
      'The shortcut objection. A blast is easy, which is why it feels like the answer — but reactivation is a conversation, and a text can\'t have one.',
    html: wrap(
      compose([
        h1('The question every owner asks first'),
        greet,
        p(
          'Sooner or later every practice asks it: <strong>&ldquo;Can\'t we just send them a text?&rdquo;</strong> Fair question. It\'s cheap, it\'s fast, and nobody has to pick up a phone.',
        ),
        p(
          'A text is good at one thing: <strong>reminding someone of a decision they already made.</strong> Confirming Tuesday at 2:00. Reactivation is a different job — the patient stopped coming, and something has to change their mind. A text can\'t do the one thing that changes minds: listen.',
        ),
        image(
          'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/ChatGPT%20Image%20Sep%2010%2C%202026%2C%2004_38_55%20PM-upmeGBsCYI1RyWO4BTQAxzPPRMorls.png',
          'A text blast versus a phone call. A text blast: one message, identical for everyone; reads as marketing the moment it arrives; can\'t hear "well, it\'s been kind of okay"; a reply is the win, and someone still has to call. A phone call: a person who knows their name and history; asks how they\'ve been since they finished care; hears the pause, and knows what to say next; ends with an appointment on the calendar.',
        ),
        panel([
          'A text asks the patient to do the work: read it, decide, call back, sit on hold. A call does the work for them. That is why one fills a schedule and the other gets swiped away.',
        ]),
        p('Texting has its place in your practice. This isn\'t it.'),
        cta('Want to hear what the call actually sounds like? Let\'s talk:'),
        finePrint(),
        signoff(),
      ]),
      'A text can remind someone of a decision they already made. It cannot restart care that stopped.',
    ),
  },
  {
    id: 'voicemail-not-a-no',
    name: 'Email 8 — A Voicemail Is Not a No',
    subject: 'A voicemail is not a no',
    previewText:
      'Reactivation doesn\'t fail on the phone. It fails in the gap after the first unanswered call.',
    angle:
      'Persistence as the mechanic. Owners read voicemail as rejection and quit; the system treats it as a scheduling event and keeps the patient in rotation without anyone tracking it.',
    html: wrap(
      compose([
        h1('Nobody picked up. Now what?'),
        greet,
        p(
          'Picture the first afternoon of calling. Ten names. Two real conversations, a couple of &ldquo;call me next week,&rdquo; and six voicemails.',
        ),
        p(
          'This is where reactivation quietly dies without a system — not because anyone quit, but because <strong>nobody knows what to do with the six.</strong> Call again tomorrow? Same hour? Leave another message? Move on?',
        ),
        p('With a system, a voicemail is just a scheduling event:'),
        steps([
          [
            'The name comes back on its own — 4 to 7 days later, at a different time of day.',
            'Someone who didn\'t answer at 10 AM may pick up at 4:30.',
          ],
          [
            'A voicemail on every second attempt, not every one.',
            'A short, scripted message that sounds like your office, not a sales pitch. Every few days feels like pressure; every couple of weeks feels like care.',
          ],
          [
            'The rhythm runs about two months.',
            'Seven to ten attempts, spread across the day. Nobody counts — the queue just shows who\'s next.',
          ],
          [
            'Still no answer? Parked, not deleted.',
            'They resurface once a quarter for one check-in. A number that never picked up in March answers in September.',
          ],
        ]),
        panel([
          'The patient who answers on the fourth attempt has no idea it was the fourth attempt. To them, it\'s one friendly call from an office they already trust.',
        ]),
        p(
          'Your team doesn\'t have to be persistent. <strong>The system is.</strong>',
        ),
        cta(
          "Let's walk through what your team's screen looks like on day one — and day forty:",
        ),
        finePrint(),
        signoff(),
      ]),
      'Reactivation doesn\'t fail on the phone. It fails in the gap after the first unanswered call.',
    ),
  },
  {
    id: 'empty-chair',
    name: 'Email 9 — The Cost of an Empty Slot',
    subject: 'Every hole in tomorrow\u2019s schedule is a bill you already paid',
    previewText:
      'Rent, payroll, and equipment cost the same whether that chair is full or empty.',
    angle:
      'Fixed-cost / opportunity-cost framing. Reframes open appointment slots as money already spent and lost.',
    html: wrap(
      compose([
        h1('Your overhead doesn\u2019t care whether the chair is full'),
        greet,
        p(
          'Pull up tomorrow\'s schedule and count the gaps. Every one of those openings costs you exactly the same as a booked appointment — rent, payroll, equipment, insurance and utilities all run whether someone is sitting there or not.',
        ),
        p(
          'The difference is that a booked slot pays for that overhead. <strong>An empty one just absorbs it.</strong>',
        ),
        image(
          'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/ChatGPT%20Image%20Sep%2010%2C%202026%2C%2011_33_11%20AM-imIexzmdeZe7tE11MOulTOoV3ffekm.png',
          'An open slot versus a slot filled from your list. Open slot: overhead runs anyway, staff are paid regardless, nothing recovered, the gap quietly repeats next week. Filled from your list: overhead is covered, same staff and same hours with real production, revenue from a patient you already earned, a patient re-engaged in their care.',
        ),
        p(
          'This is where a reactivation list earns its keep. Late cancellation at 2pm? There is a queue of warm patients who already know you and have a reason to come in — and a script that gets them booked.',
        ),
        p(
          'You\'re not filling holes with strangers who need convincing. You\'re filling them with people who said yes to you once.',
        ),
        cta("Let's turn your list into your schedule's backup plan:"),
        finePrint(),
        signoff(),
      ]),
      'Rent, payroll, and equipment cost the same whether that chair is full or empty.',
    ),
  },
  {
    id: 'one-list-many-programs',
    name: 'Email 10 — One List, Every Program',
    subject: 'One patient list. Every service you offer.',
    previewText:
      'Your decompression patients and your aesthetics patients need different conversations. Both should come from the same list.',
    angle:
      'Multi-niche capability. The same list serves every service line, each with its own tailored script.',
    html: wrap(
      compose([
        h1('The same list, matched to the right conversation'),
        greet,
        p(
          'A patient who came in for spinal decompression needs a completely different conversation than one who came in for soft wave, a weight loss program, or even chiropractic care.',
        ),
        p(
          'This is where generic call scripts fall apart. One all-purpose script forces your team to improvise the parts that matter most — and those are exactly the parts that decide whether an appointment gets booked.',
        ),
        p('So the program ships with scripts written for specific service lines:'),
        checks([
          'Spinal decompression, neuropathy, joint pain and acupuncture',
          'Chiropractic care and massage therapy',
          'Weight programs, including medication-based plans',
          'Aesthetics — skin tightening, laser, injectables and more',
          'Dental — implants, whitening, clear aligners and orthodontics',
        ]),
        p(
          '<strong>Here\'s the part that makes it usable.</strong> When you import your list, each patient carries the service they were treated for — so they arrive already matched to the right script. Your team never has to stop and figure out which conversation this person needs. They open the next call and the correct words are on screen.',
        ),
        panel([
          'One import. Mixed patient types. The caller works straight down the queue without ever switching scripts by hand.',
        ]),
        cta("Tell us what you treat and we'll show you the scripts that fit:"),
        finePrint(),
        signoff(),
      ]),
      'Your decompression patients and your aesthetics patients need different conversations. Both should come from the same list.',
    ),
  },
  {
    id: 'they-dont-know',
    name: 'Email 11 — They Don\u2019t Know What You Offer Now',
    subject: 'Your patients still picture the practice you were three years ago',
    previewText:
      'New equipment, new services, new programs — and the people most likely to want them have no idea.',
    angle:
      'New-service awareness gap. Past patients hold an outdated picture of the practice.',
    html: wrap(
      compose([
        h1('Your patients\u2019 mental picture of your practice is out of date'),
        greet,
        p(
          'Think about what has changed since your inactive patients were last in. New equipment. New services. Maybe an entire program that didn\'t exist when they walked out.',
        ),
        p('Now consider what they think you do:'),
        quote(
          'Oh, I know that office. I went there a few years ago for my back.',
          'What a past patient believes about your practice',
        ),
        p(
          'That\'s the whole picture in their head. Not the new technology. Not the program that would be perfect for what they\'re dealing with now. <strong>Just the one thing they came in for, years ago.</strong>',
        ),
        p(
          'Meanwhile you\'re running ads to strangers for those same services — paying to introduce yourself to people who\'ve never heard of you, while the people who already trust you sit uninformed.',
        ),
        panel([
          'The warmest possible audience for a new service is the patient who already had a good experience with you and simply doesn\'t know the service exists.',
        ]),
        p(
          'A reactivation call fixes the awareness gap and books the appointment in the same conversation. And it comes from a name they recognize instead of an ad in a feed.',
        ),
        cta("Let's map your newer services against the patients who'd want them:"),
        finePrint(),
        signoff(),
      ]),
      'New equipment, new services, new programs — and the people most likely to want them have no idea.',
    ),
  },
  {
    id: 'why-they-left',
    name: 'Email 12 — They Didn\u2019t Leave Because of You',
    subject: "They didn't leave because they were unhappy",
    previewText:
      'Almost nobody stops care because of the practice. They stop because life got loud.',
    angle:
      'Removes the owner\'s fear that reaching out is unwelcome. Patients lapse from life circumstances, not dissatisfaction.',
    html: wrap(
      compose([
        h1('The story owners tell themselves about lapsed patients is usually wrong'),
        greet,
        p(
          'There\'s a quiet assumption behind why so many practices never call their inactive list: <strong>if they wanted to come back, they would have.</strong> Reaching out feels like bothering someone who chose to leave.',
        ),
        p('But ask patients why they actually stopped, and it sounds like this:'),
        quote(
          'I got busy and missed an appointment, then I felt weird about calling to reschedule — and then it had been a year.',
          'The most common reason care ends',
        ),
        p(
          'Not anger. Not disappointment. A missed appointment, a busy season at work, a move, a new baby, a stretch where the pain eased up. Then enough time passed that reaching out felt awkward — <strong>for them.</strong>',
        ),
        panel([
          'Plenty of lapsed patients are quietly waiting for permission to come back. A phone call is that permission.',
          'That is why these calls land so much warmer than owners expect. You\'re not chasing anyone. You\'re removing the awkwardness they\'ve been sitting with.',
        ]),
        p(
          'And the problem they originally came to you for? In most cases it never actually resolved. It just got tolerated.',
        ),
        cta(
          "Let's talk about what your team would say to a patient who has been waiting for that call:",
        ),
        finePrint(),
        signoff(),
      ]),
      'Almost nobody stops care because of the practice. They stop because life got loud.',
    ),
  },
  {
    id: 'lifetime-value',
    name: 'Email 13 — One Patient Is Never Just One Visit',
    subject: 'One reactivated patient is rarely one appointment',
    previewText:
      'A returning patient brings a plan of care, future visits, and the people they talk to.',
    angle:
      'Lifetime value and referral compounding. The true return is much larger than a single appointment.',
    html: wrap(
      compose([
        h1('The appointment is the smallest part of the return'),
        greet,
        p(
          'When practices evaluate a reactivation call, they tend to price it as one appointment. That undercounts it badly.',
        ),
        p('Here\'s what actually happens when a lapsed patient comes back:'),
        mathBox(
          [
            ['The initial visit that gets them in the door', 'Visit 1'],
            ['The plan of care that follows', 'Multiple visits'],
            ['Services they didn\u2019t know you offered', 'Additional revenue'],
            ['Family and friends they mention you to', 'New patients'],
          ],
          'Value of one reactivated patient',
          'Far more than one visit',
        ),
        p(
          'A patient who re-engages usually needs a course of care, not a single appointment. Along the way they learn what else you offer. And people who feel genuinely taken care of talk — <strong>referrals come from active patients, not from a list gathering dust.</strong>',
        ),
        panel([
          'This is why the arithmetic on reactivation looks almost too good. You\'re not recovering one visit. You\'re restarting a relationship that had already proven itself once.',
        ]),
        p(
          'Every month a patient stays inactive, all of that stays inactive too — including the referrals that never happened.',
        ),
        cta("Let's put a real number on what your lapsed patients represent:"),
        finePrint(),
        signoff(),
      ]),
      'A returning patient brings a plan of care, future visits, and the people they talk to.',
    ),
  },
  {
    id: 'know-your-numbers',
    name: 'Email 14 — See the Numbers',
    subject: "If you can't see the numbers, you can't grow them",
    previewText:
      'Calls made, contacts reached, appointments booked, revenue recovered. Visible without asking anyone.',
    angle:
      'Accountability and visibility. Turns a vague activity into a measurable operation with a dashboard.',
    html: wrap(
      compose([
        h1('&ldquo;How did the calls go this week?&rdquo; deserves a better answer than &ldquo;good&rdquo;'),
        greet,
        p(
          'Here\'s the problem with most reactivation efforts: nobody can tell you whether they worked. Ask how it\'s going and you get a feeling, not a figure.',
        ),
        p(
          'That\'s not anyone\'s fault. If the calls live on a printed list and the outcomes live in someone\'s memory, a feeling is the only honest answer available.',
        ),
        p('Your dashboard answers it instead:'),
        metrics([
          ['Calls made', 'This week and this month'],
          ['Patients actually reached', 'Versus voicemails and no-answers'],
          ['Appointments booked', 'Per caller, per service line'],
          ['Callbacks scheduled', 'And whether they got made'],
          ['Revenue recovered', 'Tied back to specific calls'],
        ]),
        p(
          'This changes the conversation with your team. Instead of asking whether people are calling, you can see which scripts convert, which service lines respond best, and where the drop-off happens.',
        ),
        panel([
          'A number you can see is a number you can improve. <strong>An activity nobody measures quietly stops happening.</strong>',
        ]),
        p(
          'It also settles the question every owner eventually asks: is this worth continuing? You won\'t have to guess.',
        ),
        cta("Let's walk through the dashboard with your numbers in it:"),
        finePrint(),
        signoff(),
      ]),
      'Calls made, contacts reached, appointments booked, revenue recovered. Visible without asking anyone.',
    ),
  },
  {
    id: 'staff-turnover',
    name: 'Email 15 — When Your Best Person Leaves',
    subject: 'What happens when your best front desk person quits?',
    previewText:
      'If your patient communication lives in one person\u2019s head, you have a single point of failure.',
    angle:
      'Operational risk and onboarding. Documented scripts survive turnover; institutional knowledge does not.',
    html: wrap(
      compose([
        h1('If it only works when one person does it, it isn\u2019t a system'),
        greet,
        p(
          'Most practices have someone who is genuinely good on the phone. Warm, quick, knows the patients by name. When that person handles a call, it goes well.',
        ),
        p(
          'Then they take a vacation, go on leave, or move on — and the phones get noticeably worse. <strong>Everything they knew leaves with them.</strong>',
        ),
        p(
          'That\'s the hidden cost of institutional knowledge: it can\'t be handed to the next hire. So onboarding turns into weeks of shadowing and hoping.',
        ),
        steps([
          [
            'The words live in the system, not in one person\'s head.',
            'Openings, objections, and closes are written down and on screen.',
          ],
          [
            'A new hire can run real calls in their first week.',
            'They read the script and tap what the patient said. That\'s the training.',
          ],
          [
            'Every caller sounds like your practice at its best.',
            'Not just the veteran — the part-timer and the newest hire too.',
          ],
          [
            'Turnover stops being a revenue event.',
            'Someone leaving means hiring a replacement, not rebuilding the process.',
          ],
        ]),
        p(
          'Your strongest phone person still outperforms — but now the floor is much, much higher, and nobody starts from zero.',
        ),
        cta("Let's talk about making your phone process survive a resignation:"),
        finePrint(),
        signoff(),
      ]),
      'If your patient communication lives in one person\u2019s head, you have a single point of failure.',
    ),
  },
  {
    id: 'depreciating-asset',
    name: 'Email 16 — A Depreciating Asset',
    subject: 'Your patient list is quietly losing value',
    previewText:
      'Numbers change, people move, and memories fade. A list is worth the most the day you decide to use it.',
    angle:
      'Urgency through decay. The asset is real but perishable, so waiting has a measurable cost.',
    html: wrap(
      compose([
        h1('The asset is real. It\u2019s also perishable.'),
        greet,
        p(
          'We\'ve spent a lot of these emails making the case that your inactive list is an asset. Here\'s the uncomfortable other half: <strong>it doesn\'t hold its value.</strong>',
        ),
        bigStat(
          'Every month',
          'Phone numbers change, people move away, and the memory of your practice fades a little further',
        ),
        p('A patient who lapsed eight months ago and one who lapsed six years ago are not the same opportunity:'),
        compare(
          'Recently lapsed',
          [
            'Contact information still accurate',
            'Remembers your team by name',
            'Original problem still unresolved',
            'Has not established care elsewhere',
          ],
          'Long lapsed',
          [
            'Number may be disconnected',
            'Vague memory of the practice',
            'May have found another provider',
            'Needs re-earning, not just reminding',
          ],
        ),
        p(
          'This is the real cost of &ldquo;we\'ll get to it next quarter.&rdquo; The list doesn\'t sit still and wait. Each month, a slice of it quietly becomes unreachable.',
        ),
        panel([
          'The best time to work a patient list is always <strong>as soon as you have a system to work it with.</strong> Every month after that, it returns a little less.',
        ]),
        cta("If your list has been waiting a while, let's start with what's still reachable:"),
        finePrint(),
        signoff(),
      ]),
      'Numbers change, people move, and memories fade. A list is worth the most the day you decide to use it.',
    ),
  },
  {
    id: 'someone-else',
    name: 'Email 17 — Somebody Will Treat Them',
    subject: 'Somebody is going to treat your patients this year',
    previewText:
      'The problem that brought them to you has not gone away. Eventually they act on it.',
    angle:
      'Competitive urgency. Lapsed patients are still in the market; silence hands them to someone else.',
    html: wrap(
      compose([
        h1('The question isn\u2019t whether they\u2019ll get care. It\u2019s from whom.'),
        greet,
        p(
          'Here\'s something worth sitting with. The back pain, the headaches, the joint problem, the thing about their appearance that bothered them — those didn\'t resolve when the appointments stopped. They just got tolerated.',
        ),
        p(
          'At some point, tolerating it stops working. A flare-up, a photo they don\'t like, a doctor\'s comment. <strong>And then they act.</strong>',
        ),
        darkPanel([
          'When that moment arrives, they either think of you — or they search, see an ad, and go somewhere else.',
          'Silence doesn\'t keep a patient. It just makes sure you aren\'t the first name that comes to mind.',
        ]),
        p(
          'The practice that gets that patient is rarely the best one in town. It\'s whoever was most recently in front of them.',
        ),
        p(
          'You have an advantage no competitor can buy: a real relationship and a phone number. But an advantage you never use isn\'t an advantage — it\'s just an unrealized one.',
        ),
        panel([
          'One call reminds them you exist, that you understand their history, and that they don\'t have to start over with a stranger.',
        ]),
        cta("Let's make sure you're the practice they think of first:"),
        finePrint(),
        signoff(),
      ]),
      'The problem that brought them to you has not gone away. Eventually they act on it.',
    ),
  },
  {
    id: 'first-thirty-days',
    name: 'Email 18 — Your First 30 Days',
    subject: 'What the first 30 days actually looks like',
    previewText:
      'No long implementation. Import your list, train your team, start calling in week one.',
    angle:
      'Reduces perceived friction by showing a concrete, fast, low-effort rollout.',
    html: wrap(
      compose([
        h1('There is no six-month implementation here'),
        greet,
        p(
          'When owners hear &ldquo;program,&rdquo; they brace for a project — software to configure, weeks of training, a rollout that drags into next quarter.',
        ),
        p('Here is the actual shape of it:'),
        steps([
          [
            'Week one — get your list in.',
            'Export your patients from your practice software and import the file. Each patient is matched to the right script as they come in.',
          ],
          [
            'Week one — walk your team through it.',
            'There is nothing to memorize. Your team learns to read the screen and tap what the patient said. That is the training.',
          ],
          [
            'Week one — start calling.',
            'The first calls happen the same week the list lands. Your queue tells your team who is next.',
          ],
          [
            'Weeks two through four — build the rhythm.',
            'A small block of calls each day. Callbacks resurface automatically. Appointments start landing on the schedule.',
          ],
          [
            'End of month one — look at real numbers.',
            'Calls made, patients reached, appointments booked, revenue recovered. Decide what to adjust from data instead of impressions.',
          ],
        ]),
        p(
          'No new hires. No hardware. Nothing to rip out of your existing setup. The heavy lifting — the scripts, the objection handling, the tracking — is already built.',
        ),
        cta("If that sounds workable for your office, let's get you started:"),
        finePrint(),
        signoff(),
      ]),
      'No long implementation. Import your list, train your team, start calling in week one.',
    ),
  },
  {
    id: 'not-your-job',
    name: 'Email 19 — You Don\u2019t Run This Yourself',
    subject: "You don't have to be the one making these calls",
    previewText:
      'This is designed to run without the owner in the middle of it.',
    angle:
      'Owner-time objection. The program is built for staff to run, not to add to the owner\'s plate.',
    html: wrap(
      compose([
        h1('If it needs you to run it, it won\u2019t last a month'),
        greet,
        p(
          'Every practice owner has a graveyard of good ideas that died because they depended on the owner\'s attention. You already have a full schedule of patients — a program that needs your daily involvement is a program that quietly stops.',
        ),
        p('So here is what running this does <strong>not</strong> require from you:'),
        checks([
          'You don\u2019t make the calls.',
          'You don\u2019t write or maintain the scripts.',
          'You don\u2019t decide who gets called next — the queue does that.',
          'You don\u2019t chase callbacks or keep a tracking spreadsheet.',
          'You don\u2019t train new hires from scratch when someone leaves.',
        ]),
        p('What you actually do is look at a dashboard when you feel like it.'),
        panel([
          'Calls made. Patients reached. Appointments booked. Revenue recovered.',
          'Enough to know it\'s working and coach your team — without becoming the bottleneck.',
        ]),
        p(
          'Your team gets the words, the queue, and the tracking. You get the production and your time back. That division of labor is the entire point.',
        ),
        cta("Let's set this up so it runs without you in the middle:"),
        finePrint(),
        signoff(),
      ]),
      'This is designed to run without the owner in the middle of it.',
    ),
  },
  {
    id: 'straight-answer',
    name: 'Email 20 — We\u2019ll Tell You If It\u2019s Not a Fit',
    subject: "If your list is too small, we'll tell you",
    previewText:
      'Not every practice is a fit for this, and we would rather say so on the first call.',
    angle:
      'Trust and reverse-close. Mirrors the honesty pledge from the call scripts to lower the risk of booking.',
    html: wrap(
      compose([
        h1('We\u2019d rather tell you no than waste your time'),
        greet,
        p(
          'You have been pitched before. You know how a &ldquo;discovery call&rdquo; usually goes — somebody with a script who has already decided you need what they sell.',
        ),
        p('So let\'s set the expectation differently.'),
        panel([
          'If we look at your patient list and don\'t believe we can help you, <strong>we\'ll tell you.</strong>',
          'We\'re not here to waste anybody\'s time or money — yours or ours.',
        ]),
        p(
          'There are practices this doesn\'t suit. If your list is genuinely too small to be worth the effort, or your records are too incomplete to reach anyone, or you already run a disciplined reactivation process, a program from us is a bad use of your money. We\'d rather be the ones to say that.',
        ),
        p('What the call actually looks like:'),
        steps([
          [
            'You tell us about your practice.',
            'What you treat, roughly how many inactive patients you have, and what has been tried before.',
          ],
          [
            'We give you a straight read.',
            'What that list is realistically worth, and what it would take to work it.',
          ],
          [
            'You decide with real numbers in hand.',
            'If we can help, we\'d be honored to. If we can\'t, you\'ll know that too.',
          ],
        ]),
        p(
          'Worst case, you spend a few minutes and walk away with a clearer picture of an asset you already own. Does that sound reasonable?',
        ),
        cta('Grab a time that works for you:'),
        finePrint(),
        signoff(),
      ]),
      'Not every practice is a fit for this, and we would rather say so on the first call.',
    ),
  },
  {
    id: 'cash-services',
    name: 'Email 21 — Your Best-Margin Services',
    subject: "Your best-margin services are the ones nobody knows about",
    previewText:
      'Cash services do not depend on a payer. They depend on patients knowing the option exists.',
    angle:
      'Cash / elective service angle. Reactivation is the cheapest way to promote high-margin services.',
    html: wrap(
      compose([
        h1('The services with the best margins need the warmest audience'),
        greet,
        p(
          'Most practices have added services that don\'t run through insurance — an aesthetic treatment, a weight program, a cash care plan, a therapy that isn\'t covered.',
        ),
        p(
          'They tend to be the best business in the building: better margins, no reimbursement fights, no waiting on a payer. <strong>They also need something insurance-covered care never does — a patient who chooses to spend their own money.</strong>',
        ),
        compare(
          'Selling cash services to strangers',
          [
            'Trust has to be built from zero',
            'Price objection arrives immediately',
            'Expensive clicks, uncertain intent',
            'Long consideration before anyone commits',
          ],
          'Offering them to past patients',
          [
            'Trust already established',
            'They know your care is worth paying for',
            'No acquisition cost',
            'One conversation, from a familiar name',
          ],
        ),
        p(
          'A patient who paid you before and felt it was worth it is dramatically more likely to say yes to an elective service than a stranger who found you in a feed. They\'ve already answered the hardest question — <em>is this practice worth my money?</em>',
        ),
        panel([
          'For cash services, your inactive list isn\'t just cheaper than advertising. It is a fundamentally warmer audience than any ad can buy.',
        ]),
        cta("Let's talk about promoting your cash services to the people most likely to say yes:"),
        finePrint(),
        signoff(),
      ]),
      'Cash services do not depend on a payer. They depend on patients knowing the option exists.',
    ),
  },
  {
    id: 'one-conversation',
    name: 'Email 22 — One Conversation Covers It',
    subject: 'One conversation usually pays for the whole thing',
    previewText:
      'When a single returning patient covers the investment, the math stops being the hard part.',
    angle:
      'Low-risk close. Frames the break-even point as a single reactivated patient.',
    html: wrap(
      compose([
        h1('Count how many patients it takes to pay for this'),
        greet,
        p(
          'Every practice investment deserves the same blunt question: <strong>how much has to go right before this pays for itself?</strong>',
        ),
        p(
          'For most marketing, the honest answer is uncomfortable. Ad campaigns need volume before they break even, and plenty never get there.',
        ),
        p('Here, the answer is usually a very small number:'),
        bigStat(
          'One patient',
          'For most practices, a single reactivated patient and their plan of care covers the investment',
        ),
        p(
          'That changes the decision entirely. You\'re not betting on a campaign performing. You\'re asking whether your team, given the exact words to say, can bring back <em>one</em> patient out of hundreds who already know you.',
        ),
        mathBox(
          [
            ['Patients contacted in a normal month', 'Hundreds'],
            ['Needed to cover the investment', 'One'],
            ['Everything reactivated after that', 'Margin'],
          ],
          'Break-even',
          'One patient',
        ),
        p(
          'And that first patient is rarely the last one — every appointment after it is recovered revenue on a list you already owned.',
        ),
        cta("Let's run your numbers and find your break-even:"),
        finePrint(),
        signoff('To your practice\u2019s growth,'),
      ]),
      'When a single returning patient covers the investment, the math stops being the hard part.',
    ),
  },
]
