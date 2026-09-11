/**
 * Who a sequence is written for. Every template belongs to exactly one
 * audience; the admin previewer and the ZIP export group by it. To add a
 * sequence for another kind of office, register the audience here and tag
 * its templates with the new id — numbering restarts at Email 1 per audience.
 */
export const EMAIL_AUDIENCES = [
  {
    id: 'chiropractic',
    name: 'Chiropractic',
    description:
      'Chiropractic practices and doctors. Examples, service lines and language assume a chiropractor\'s patient list — decompression, neuropathy, soft wave, weight loss and the rest.',
  },
] as const

export type EmailAudience = (typeof EMAIL_AUDIENCES)[number]
export type EmailAudienceId = EmailAudience['id']

export interface EmailTemplate {
  id: string
  audience: EmailAudienceId
  name: string
  subject: string
  previewText: string
  angle: string
  html: string
}

export function isEmailAudienceId(
  value: string | null | undefined,
): value is EmailAudienceId {
  return EMAIL_AUDIENCES.some((a) => a.id === value)
}

// {{contact.first_name}} is a GHL merge tag and works as-is when pasted
// into GHL. The Schedule a Call buttons link to the live landing page,
// where the intake form flows into the booking calendar at
// /healthcare/book-a-call after submit — no placeholders to swap.
const LANDING_PAGE_URL = 'https://reactivationpower.com/healthcare'

/**
 * Generated email graphics live in public/images/emails and deploy with the
 * site, so the templates point at the production host — the same way the
 * header logo does. The Blob store on this project is private, which an
 * inbox can't read from. Publish the site before sending anything that
 * references a new graphic.
 */
export const EMAIL_ASSET_BASE = 'https://www.reactivationpower.com/images/emails'
const asset = (file: string) => `${EMAIL_ASSET_BASE}/${file}`

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
 * Graphics are accents, never load-bearing: most inboxes block images
 * by default, so every image carries its full message in its alt text
 * and the surrounding copy still makes the argument with images off.
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

/**
 * Product screenshot with a caption. Bordered because app screenshots are
 * mostly white and would otherwise bleed into the email body.
 */
const screenshot = (src: string, alt: string, caption: string) =>
  `            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
              <tr>
                <td>
                  <img src="${src}" alt="${alt}" width="520" style="display:block;width:100%;max-width:520px;height:auto;margin:0 auto;border:1px solid #e2e8f0;border-radius:6px;" />
                  <p style="margin:10px 0 0 0;font-family:${FONT};font-size:13px;line-height:20px;color:#62748e;text-align:center;">${caption}</p>
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

// ---------------------------------------------------------------------------
// Chiropractic sequence — Emails 1–40
// Written for chiropractic offices. Sequences for other practice types belong
// under their own audience id (see EMAIL_AUDIENCES) with their own numbering.
// Emails 23–40 deliberately mix short, medium and long form, and every one
// of them points at the same outcome: submit the form, book the call, and
// show up for it.
// ---------------------------------------------------------------------------
export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'hidden-revenue',
    audience: 'chiropractic',
    name: 'Email 1.1 — The Revenue Hiding in Your Patient List',
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
    id: 'who-is-in-your-thousand',
    audience: 'chiropractic',
    name: 'Email 1.2 — Who\u2019s Actually in Your 1,000',
    subject: 'Who\u2019s actually in your 1,000',
    previewText:
      'The $100,000 from the last email isn\u2019t a number. It\u2019s five people you already know.',
    angle:
      'Day 1, email 2. Builds on 1.1 by turning the $100,000 illustration into the five kinds of patients who make it up — every one of them warm, none of them a stranger.',
    html: wrap(
      compose([
        h1('Who\'s actually in your 1,000'),
        greet,
        p(
          'In the last email I showed you a number: 1,000 inactive files, ten percent of them back, roughly <strong>$100,000</strong>. Numbers are easy to nod at and forget. So let\'s put faces on it.',
        ),
        p(
          'Pull up the inactive list in any chiropractic office and the same five people are in it. You\'ll recognize every one.',
        ),
        image(
          asset('1-2-who-is-in-your-thousand.jpg'),
          'Who is actually in your 1,000. A bright chiropractic reception area; the front-desk monitor shows an Inactive Patients list of 1,000 names sorted by last visit. Five kinds of patient make up the list: finished care, felt great, drifted; missed one visit, never rebooked; came in for one thing only; insurance or life changed; the rest of the family. Not one of them is a stranger.',
        ),
        steps([
          [
            'The one who finished care and felt great.',
            'They completed the plan, the pain was gone, and they stopped coming &mdash; because they felt fine. They still think of you as their chiropractor. They just haven\'t had a reason to call.',
          ],
          [
            'The one who missed a visit and never rebooked.',
            'Something came up, nobody followed up, and after a few weeks it felt awkward to call in. They\'re not gone. They\'re waiting for someone to make it easy.',
          ],
          [
            'The one who came in for one thing.',
            'Low back pain, three years ago. They have no idea you do decompression now, or weight loss, or red light. In their mind you\'re still the office that fixed their back.',
          ],
          [
            'The one whose situation changed.',
            'New job, new insurance, a move across town, a new baby. That was two years ago. Their situation has changed again since &mdash; and nobody has asked.',
          ],
          [
            'The rest of the family.',
            'You treated the mom. Her husband, her kids and her parents are on the same list, at the same address, and nobody has ever invited them in.',
          ],
        ]),
        darkPanel([
          'Not one of these is a cold call. Every name already knows your practice, your team and your front door. That\'s the difference between this and every other kind of marketing you\'ve paid for.',
        ]),
        cta('Want to see your own list sorted this way?', 'Book a Live Walkthrough'),
        p(
          'The number from the last email is what these five people add up to. They\'re not hypothetical. They\'re in your software right now, sorted by last visit.',
        ),
        p(
          'On the call, we pull up your actual list and sort it exactly like this, so you can see which groups you have the most of and what each one needs to hear.',
        ),
        cta('Let\'s see who\'s in yours:', 'Reserve My Strategy Call'),
        finePrint(),
        signoff(),
      ]),
      'The $100,000 from the last email isn\u2019t a number. It\u2019s five people you already know.',
    ),
  },
  {
    id: 'list-has-no-owner',
    audience: 'chiropractic',
    name: 'Email 1.3 — The List Has No Owner',
    subject: 'Why it\u2019s still sitting there',
    previewText:
      'The number, the people, and the one thing standing between them and your schedule.',
    angle:
      'Day 1, email 3. Closes the day: ties 1.1 (the number) and 1.2 (the people) together, names the single obstacle — the list has no owner — and positions the program as the missing piece.',
    html: wrap(
      compose([
        h1('The only thing between your list and your schedule'),
        greet,
        p(
          'Two emails so far. The first was a number: what your inactive list is worth. The second was the people behind it: five kinds of patients, every one of them warm.',
        ),
        p(
          'Which leaves one question. If it\'s worth that much, and they\'re that easy to call, <strong>why is it still sitting there?</strong>',
        ),
        p(
          'Not because you don\'t care. Not because your team can\'t do it. It\'s still sitting there because the list has no owner.',
        ),
        image(
          asset('1-3-list-has-no-owner.jpg'),
          'Why it is still sitting there versus what changes. Left: a quiet chiropractic front desk with an idle phone and a long patient list on the monitor &mdash; nobody\'s name is on it, nobody knows what to say, nobody knows who\'s been called. Right: the same desk with a front-desk team member on the phone and a call queue on screen &mdash; one person owns it, every word is on the screen, the queue knows who\'s next. A system problem, not a willpower problem.',
        ),
        checks([
          '<strong>Nobody\'s name is on it.</strong> &ldquo;Someone should call these people&rdquo; is easy to say. &ldquo;Sarah calls fifteen of them at two o\'clock&rdquo; is the sentence that actually gets them called.',
          '<strong>Nobody knows what to say.</strong> Without the words, the first awkward pause ends the whole effort &mdash; usually before the end of the first week.',
          '<strong>Nobody knows who\'s been called.</strong> So the same three names get called twice, and the other 997 never hear from anyone.',
        ]),
        panel([
          'That\'s not a willpower problem. It\'s a system problem &mdash; and system problems are the fixable kind.',
        ]),
        p(
          'That\'s what Reactivation Power is. <strong>An owner:</strong> your front desk, in the gaps they already have. <strong>The words:</strong> a script on screen for every call and every objection. <strong>The record:</strong> a queue that knows who\'s next and when. The asset from the first email, the people from the second, with the missing piece put in.',
        ),
        cta(
          'Book a call and we\'ll walk through your list, your number, and what the first two weeks look like:',
        ),
        finePrint(),
        signoff(),
      ]),
      'The number, the people, and the one thing standing between them and your schedule.',
    ),
  },
  {
    id: 'no-ad-spend',
    audience: 'chiropractic',
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
            <p style="margin:0 0 32px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#314158;">It takes about a minute &mdash; answer a few quick questions about your practice, then pick a day and time right on the calendar.</p>
            <p style="margin:0 0 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#314158;">To your practice's growth,</p>
            <p style="margin:0 0 40px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#1d293d;"><strong>The Reactivation Power Team</strong></p>
          </td>
        </tr>`,
      'New services, same patients. The fastest way to fill your schedule is the list of people who already said yes to you once.',
    ),
  },
  {
    id: 'front-desk-scripts',
    audience: 'chiropractic',
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
    audience: 'chiropractic',
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
    audience: 'chiropractic',
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
    audience: 'chiropractic',
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
    audience: 'chiropractic',
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
          'A text blast versus a phone call. A text blast: one message, identical for everyone; reads as marketing the moment it arrives; can\'t hear &ldquo;well, it\'s been kind of okay&rdquo;; a reply is the win, and someone still has to call. A phone call: a person who knows their name and history; asks how they\'ve been since they finished care; hears the pause, and knows what to say next; ends with an appointment on the calendar.',
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
    audience: 'chiropractic',
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
    audience: 'chiropractic',
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
    audience: 'chiropractic',
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
        image(
          'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/ChatGPT%20Image%20Sep%2010%2C%202026%2C%2005_07_16%20PM-lhr7bi52lt5vjQysKdUpJoL9pVq7CP.png',
          'The same list, matched to the right conversation. Each service line has a different story, and your team gets the right script for each one: chiropractic care, spinal decompression, neuropathy and joint pain; soft wave, acoustic wave therapy, acupuncture, massage and gut health; weight loss with ChiroThin, in-office programs and GLP patients; red light, body contouring, skin tightening, cellulite reduction and Botox; laser hair removal and body waxing. One import, mixed patient types: each patient carries the service they were treated for, so your team works straight down the queue without switching scripts by hand.',
        ),
        p(
          'This is where generic call scripts fall apart. One all-purpose script forces your team to improvise the parts that matter most — and those are exactly the parts that decide whether an appointment gets booked.',
        ),
        p('So the program ships with scripts written for specific service lines:'),
        checks([
          'Chiropractic care, spinal decompression, neuropathy and joint pain',
          'Acoustic wave therapy / soft wave, acupuncture, massage therapy and gut health',
          'Weight loss — ChiroThin, in-office programs and GLP patients',
          'Red light / body contouring, skin tightening, cellulite reduction and Botox',
          'Laser hair removal and body waxing',
          'Dental — implants, teeth whitening, clear aligners and orthodontics',
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
    audience: 'chiropractic',
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
        image(
          'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/ChatGPT%20Image%20Sep%2010%2C%202026%2C%2005_10_43%20PM-V0Xv2gCVVYP1Qmh4VYM7ZSjiucswxI.png',
          'What they\'re still thinking versus what you offer now. A past patient pictures a single adjustment room from years ago and thinks, &ldquo;Oh, I know that office. I went there a few years ago for my back.&rdquo; Outdated, limited, just one service in their mind. Meanwhile the practice now offers chiropractic care, spinal decompression, soft wave, weight loss, red light and aesthetics, and laser hair removal. The warmest possible audience for a new service is the patient who already had a good experience with you and simply doesn\'t know the service exists.',
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
    audience: 'chiropractic',
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
        image(
          'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/ChatGPT%20Image%20Sep%2010%2C%202026%2C%2005_13_35%20PM-XJ1Lkf79mAxuhbr2aPpsUbQSeu1Ixv.png',
          'What you might be thinking versus what they\'re actually thinking. An owner assumes: &ldquo;If they wanted to come back, they would have.&rdquo; They probably found somewhere else; it would feel weird to call them; they chose to leave. The patient\'s side: &ldquo;I got busy and missed an appointment, then I felt weird about calling to reschedule &mdash; and then it had been a year.&rdquo; Life got busy (a work season, move, new baby); their symptoms improved so they stopped coming; enough time passed that reaching out felt awkward. Plenty of lapsed patients are quietly waiting for permission to come back. A phone call is that permission.',
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
    audience: 'chiropractic',
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
        image(
          'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/attachments/gen-images/sources-v2/CL636t4ggZ0InBds1LWMJ-gxq7csIOQLmqx4B7YcWtPJLryPVFIU.png',
          'The appointment is the smallest part of the return. One reactivated patient is rarely one appointment. Four stages in sequence: Visit 1, a front-desk team member greeting a returning patient; Plan of Care, a chiropractor adjusting the patient with several follow-up visits on the calendar; Additional Services, a SoftWave device, red light panel and smart scale; Referrals, the patient walking in with friends and family. You\'re not recovering one visit. You\'re restarting a relationship that had already proven itself once.',
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
    audience: 'chiropractic',
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
        screenshot(
          'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Screenshot%202026-09-10%20at%205.30.17%E2%80%AFPM-wKJdWP04MvF0lUqQURYyUT6FqK6L0D.png',
          'The Analytics page inside the Reactivation Power portal. Top cards show Calls Today, Calls This Week (21) and Scheduled This Week (2). A Caller Performance table ranks each caller by success rate with calls, reached, scheduled, success rate, close rate and this week\'s activity; the top caller is tagged Top performer and a caller with zero appointments is tagged Needs attention. Below, Whole Team insight cards show the best time to reach someone (5 PM), the hardest time (4 PM), the most likely hour for a yes (9 AM) and the most likely day for a yes (Friday).',
          '<strong>Actual screenshot from inside the Reactivation Power portal</strong> &mdash; this is the Analytics page an office sees when it logs in.',
        ),
        metrics([
          ['Calls made', 'This week and this month'],
          ['Patients actually reached', 'Versus voicemails and no-answers'],
          ['Appointments booked', 'Per caller, per service line'],
          ['Callbacks scheduled', 'And whether they got made'],
          ['Revenue recovered', 'Tied back to specific calls'],
        ]),
        p(
          'This changes the conversation with your team. Instead of asking whether people are calling, you can see who\'s converting, who needs a hand, and what time of day your patients actually pick up.',
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
    audience: 'chiropractic',
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
        image(
          asset('15-staff-turnover.jpg'),
          'An empty front-desk chair pushed back from the reception counter. The phone is lit with an incoming call, a headset rests beside it, a notebook full of handwritten notes and sticky notes sit by the monitor, and a small box of personal items is packed and ready to carry out. Everything they knew leaves with them.',
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
    audience: 'chiropractic',
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
        image(
          asset('16-depreciating-asset.jpg'),
          'The asset is real. It\'s also perishable. Five patient files fade along a timeline from 8 months ago to 6 years ago; the last one is a ghosted outline with its phone crossed out. Recently lapsed: contact info still accurate, remembers your team by name, has not established care elsewhere. Long lapsed: number may be disconnected, vague memory of the practice, may have found another provider. Every month, a slice of the list quietly becomes unreachable.',
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
    audience: 'chiropractic',
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
        image(
          asset('17-someone-else.jpg'),
          'Evening in a living room. A man sits on the edge of the sofa with one hand pressed to his lower back, holding his phone up to a map of search results for chiropractor near me, the top listing marked as an ad. When that moment arrives, whose name comes to mind?',
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
    audience: 'chiropractic',
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
        image(
          asset('18-first-thirty-days.jpg'),
          'Your first 30 days. No six-month implementation; calls start the same week your list lands. A four-week timeline: Week 1 has three milestones close together, import your list, train your team, start calling. Weeks 2 through 4 are one long stretch labeled build the rhythm, a small block of calls each day. A Day 30 flag at the end reads look at real numbers. No new hires. No hardware. Nothing to rip out.',
        ),
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
    audience: 'chiropractic',
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
        image(
          asset('19-not-your-job.jpg'),
          'A chiropractor adjusts a patient on the treatment table, fully focused on them. Through the doorway behind, a front-desk team member in a headset works the call list at the reception computer, the on-screen script showing a few large tappable buttons. You treat patients. Your team works the list.',
        ),
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
    audience: 'chiropractic',
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
        image(
          asset('20-straight-answer.jpg'),
          'A practice owner in a white clinic coat sits at her desk on a relaxed video call, pen in hand, a notepad with a few handwritten numbers beside a coffee mug and a small spine model. A straight read on your list, even if the answer is no.',
        ),
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
    audience: 'chiropractic',
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
        image(
          asset('21-cash-services.jpg'),
          'The best margins need the warmest audience. Selling to strangers: trust built from zero, price objection arrives immediately, expensive clicks with uncertain intent, long consideration before anyone commits. Offering to past patients: trust already established, they know your care is worth paying for, no acquisition cost, one conversation from a familiar name. Behind the panels, a red light therapy panel and body-composition scale in a modern wellness office. They\'ve already answered the hardest question: is this practice worth my money?',
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
    audience: 'chiropractic',
    name: 'Email 22 — One to Three Patients Covers It',
    subject: 'How many patients does it take to pay for this?',
    previewText:
      'When one to three returning patients cover the investment, the math stops being the hard part.',
    angle:
      'Low-risk close. Frames the break-even point as one to three reactivated patients, depending on the practice\'s case average — a range the sales call can land inside.',
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
          'One to three patients',
          'Depending on your case average, that\'s how many reactivated patients — with their plans of care — it takes to cover the investment',
        ),
        p(
          'A practice with a higher average plan of care breaks even on one. A lower one might take three. Either way, it\'s a handful out of hundreds.',
        ),
        p(
          'That changes the decision entirely. You\'re not betting on a campaign performing. You\'re asking whether your team, given the exact words to say, can bring back one, two, or three patients out of hundreds who already know you.',
        ),
        image(
          asset('22-one-conversation.jpg'),
          'Count how many patients it takes to pay for this. Three blocks in a row: Hundreds, the patients contacted in a normal month; One to three, covers the investment depending on your case average; Everything after, margin. Break-even: one to three patients.',
        ),
        p(
          'And once you\'re past break-even, every appointment after it is recovered revenue on a list you already owned.',
        ),
        cta("Let's run your numbers and find your break-even:"),
        finePrint(),
        signoff('To your practice\u2019s growth,'),
      ]),
      'When one to three returning patients cover the investment, the math stops being the hard part.',
    ),
  },
  {
    id: 'the-call-itself',
    audience: 'chiropractic',
    name: 'Email 23 — What Happens on the Call',
    subject: 'It\u2019s a short call. Here\u2019s exactly what happens on it.',
    previewText:
      'Three questions from us, one number for you, and a straight answer either way.',
    angle:
      'Short form. Demystifies the strategy call so booking feels low-stakes and concrete.',
    html: wrap(
      compose([
        h1('No pitch deck. Just your numbers.'),
        greet,
        p(
          'If you\'ve been reading these and thinking &ldquo;maybe,&rdquo; here is the whole call in one paragraph.',
        ),
        image(
          asset('23-the-call-itself.jpg'),
          'A practice owner at her desk on a relaxed video call, headset on, coffee beside the laptop, a notepad with one number circled. Three questions. One number. A straight answer.',
        ),
        panel([
          'We ask how many inactive patients you have, roughly what a plan of care is worth in your office, and who on your team would make the calls. From those three answers we work out your break-even &mdash; how many patients have to come back before this pays for itself &mdash; and tell you whether it makes sense for your practice. If it doesn\'t, we say so.',
        ]),
        p(
          'That\'s it. No slides, no countdown, no &ldquo;sign now&rdquo; pricing. You leave with a number you can use whether or not you ever talk to us again.',
        ),
        cta("Pick a time and we'll bring the math:"),
        finePrint(),
        signoff(),
      ]),
      'Three questions from us, one number for you, and a straight answer either way.',
    ),
  },
  {
    id: 'three-numbers',
    audience: 'chiropractic',
    name: 'Email 24 — Bring Three Numbers',
    subject: 'Bring these 3 numbers and the call does the rest',
    previewText:
      'Inactive patient count, case average, who would call. Rough is fine — we work out your break-even live.',
    angle:
      'Medium form. Gives the lead homework that makes the call concrete and increases show-up.',
    html: wrap(
      compose([
        h1('Three numbers turn a maybe into a decision'),
        greet,
        p(
          'Most strategy calls fail for a simple reason: nobody brought anything to decide with. So the call becomes a conversation about a conversation, and everybody agrees to &ldquo;circle back.&rdquo;',
        ),
        p('Ours runs differently. Bring three numbers &mdash; rough is fine &mdash; and the call produces a decision.'),
        image(
          asset('24-three-numbers.jpg'),
          'Three cards, Inactive Patients, Case Average and Who Calls, feed an arrow into a teal card labeled Your Break-Even. Rough is fine. The call does the math.',
        ),
        steps([
          [
            'How many patients you haven\'t seen in 12+ months.',
            'Your practice software can usually pull this in a minute: patients whose last visit is older than a year. If you can\'t get it, a guess is fine; we\'ll refine it together.',
          ],
          [
            'What a plan of care is worth in your office.',
            'Your case average. The number you already use when you think about what a new patient means to the practice.',
          ],
          [
            'Who would make the calls.',
            'A name, not a hire. Usually a front-desk person who is already good on the phone, for a small block of time each day.',
          ],
        ]),
        p(
          'With those three, we work out your break-even on the call &mdash; how many returning patients pay for the whole thing &mdash; and whether the list is big enough to be worth it. If it isn\'t, we\'ll tell you.',
        ),
        panel([
          'You don\'t need the numbers to book. You need them for the call. <strong>Book first, pull them the morning of.</strong>',
        ]),
        cta('Grab a time, then pull the three numbers before it:'),
        finePrint(),
        signoff(),
      ]),
      'Inactive patient count, case average, who would call. Rough is fine — we work out your break-even live.',
    ),
  },
  {
    id: 'anatomy-of-a-call',
    audience: 'chiropractic',
    name: 'Email 25 — Anatomy of a Reactivation Call',
    subject: 'The 6 moments that turn \u201Cwe haven\u2019t seen you in a while\u201D into a booked visit',
    previewText:
      'This is the conversation your team would actually have — screen by screen.',
    angle:
      'Long form. Shows the product by walking through the script flow, then invites the lead to hear it read live on the call.',
    html: wrap(
      compose([
        h1('What your front desk actually says'),
        greet,
        p(
          'We\'ve told you the script handles the whole conversation. It\'s fair to ask what that conversation is. Here\'s the shape of it &mdash; the same screens your team taps through on a live call.',
        ),
        image(
          asset('25-anatomy-of-a-call.jpg'),
          'Six connected steps in a row: Opener, Their Concern, Making It Real, The Review, Recommendation, Objections. Every word already on the screen.',
        ),
        steps([
          [
            'The opener.',
            '&ldquo;This is Sarah from Dr. Patel\'s office. How have you been feeling since you finished your care with us &mdash; especially with the lower back pain?&rdquo; The script pulls the original complaint from your import, so the first sentence already sounds like someone who knows them.',
          ],
          [
            'What\'s bothering them now.',
            'The patient answers, and your caller taps the concern on screen &mdash; headaches, the back again, something new. Everything after this point uses their words, not ours.',
          ],
          [
            'Making it real.',
            'Three questions, each with a pause: how long has it been going on, how often, and what it\'s getting in the way of &mdash; work, home, the things they enjoy. This is where &ldquo;I\'ve been meaning to&rdquo; becomes &ldquo;I should.&rdquo;',
          ],
          [
            'The review.',
            'The caller reflects it back: &ldquo;So it\'s been showing up for months, most weeks, and it\'s getting in the way at work &mdash; is that fair to say?&rdquo; Most people say yes. That yes is the turning point of the call.',
          ],
          [
            'The recommendation.',
            '&ldquo;Can I make a recommendation?&rdquo; Then a simple one: come in, let us look at it, and if we can help we\'ll say so &mdash; we\'re not here to waste anyone\'s time or money. &ldquo;Does that sound reasonable?&rdquo;',
          ],
          [
            'The objection, if there is one.',
            '&ldquo;I need to think about it.&rdquo; &ldquo;Just send me some info.&rdquo; &ldquo;I\'m looking at another option.&rdquo; Each one is a button on the screen with the words already written. Nobody has to improvise.',
          ],
        ]),
        cta('If you\'d rather hear this than read it:', 'Book a Live Walkthrough'),
        p(
          'Notice what isn\'t in there: no pressure, no discount, no &ldquo;this week only.&rdquo; It\'s the conversation a good front-desk person would have anyway &mdash; with the parts that are hard to remember written down.',
        ),
        darkPanel([
          'Every screen exists because a real patient said something a caller didn\'t know how to answer.',
          'That\'s what your team gets on day one: the answers, before the questions.',
        ]),
        p(
          'On the call, we can walk you through it live for whatever you treat most &mdash; and you can decide whether it sounds like your practice.',
        ),
        cta('Pick a time and we\'ll read it for your practice:', 'Reserve My Strategy Call'),
        finePrint(),
        signoff(),
      ]),
      'This is the conversation your team would actually have — screen by screen.',
    ),
  },
  {
    id: 'same-skill',
    audience: 'chiropractic',
    name: 'Email 26 — Your Front Desk Already Does This',
    subject: 'Your front desk already does the hard part',
    previewText:
      'They book appointments all day. This gives them the words for the ones who stopped coming.',
    angle:
      'Short form. Reframes reactivation as a skill the team already has, so the only open question is who and when — a question for the call.',
    html: wrap(
      compose([
        h1('Same skill. Different list.'),
        greet,
        p(
          'Watch your front desk for an hour. They answer the phone, put people at ease, find a time that works, and get it on the schedule. That\'s the whole job here, too.',
        ),
        image(
          asset('26-same-skill.jpg'),
          'A front-desk team member smiles on the phone at a bright chiropractic reception desk, the appointment calendar open on her screen, a patient checking in behind her. Same skill. Different list.',
        ),
        p(
          'The only difference is who\'s on the other end: a patient who hasn\'t been in for a while instead of one who just called. That patient needs a slightly different conversation &mdash; a warm reason for the call, a way to talk about what\'s been bothering them, an easy path back in.',
        ),
        panel([
          'Those are the parts we wrote down. <strong>The skill your team already has does the rest.</strong>',
        ]),
        p(
          'So the question on the call isn\'t whether your team can do this. It\'s who on your team, and for how many minutes a day.',
        ),
        cta("Let's figure out who and when:"),
        finePrint(),
        signoff(),
      ]),
      'They book appointments all day. This gives them the words for the ones who stopped coming.',
    ),
  },
  {
    id: 'think-about-it',
    audience: 'chiropractic',
    name: 'Email 27 — \u201CI Need to Think About It\u201D',
    subject: '\u201CI need to think about it\u201D \u2014 the answer is already on the screen',
    previewText:
      'The moment most callers freeze is the moment the script does its best work.',
    angle:
      'Medium form. Shows the objection handling concretely and invites the lead to ask for that screen on the call.',
    html: wrap(
      compose([
        h1('The four words every caller dreads'),
        greet,
        p(
          'Ask anyone who has made these calls what they hate most, and it isn\'t the no. It\'s the stall: &ldquo;I need to think about it.&rdquo; Nobody knows what to say, so they say &ldquo;okay, no problem&rdquo; &mdash; and the call is over.',
        ),
        p('In the script, that stall is a button.'),
        image(
          asset('27-think-about-it.jpg'),
          'A tablet screen shows four tappable objection buttons: I need to think about it, highlighted in teal; Just send me some info; It\'s too expensive; I\'m considering another option. An arrow leads to a card labeled Scripted Response. The stall is a button.',
        ),
        panel([
          '&ldquo;That\'s completely fair. Can I ask &mdash; what part would you want to think over? The cost, the timing, or just being sure it\'s worth it?&rdquo;',
          'Then the response for whichever one they pick, ending the way every screen does: <em>does that make sense?</em>',
        ]),
        p(
          'Same for &ldquo;just send me some info,&rdquo; &ldquo;I\'m looking at another option,&rdquo; &ldquo;it\'s too expensive,&rdquo; and &ldquo;I need to ask my spouse.&rdquo; Each one has a screen with the words written, tested, and ready.',
        ),
        checks([
          'Your newest hire has the same answers as your best one.',
          'Nobody has to be clever under pressure.',
          'The tone stays warm because the words were chosen calmly, in advance.',
          'The patient never hears a caller scramble.',
        ]),
        p(
          'This is the part of the program that\'s hardest to see from the outside and easiest to feel on a live call. On ours, ask us to read one.',
        ),
        cta("Book a time and ask for the &ldquo;think about it&rdquo; screen:"),
        finePrint(),
        signoff(),
      ]),
      'The moment most callers freeze is the moment the script does its best work.',
    ),
  },
  {
    id: 'never-eight-hundred',
    audience: 'chiropractic',
    name: 'Email 28 — Why Your Team Never Sees 800 Names',
    subject: 'Why your team will never stare at a list of 800 names',
    previewText:
      'Seven calls due. The rest wait in reserve. That one design choice is why this gets done.',
    angle:
      'Long form. Explains the batched queue — the mechanic that makes the program survivable for a busy front desk.',
    html: wrap(
      compose([
        h1('The list is never empty and never overwhelming'),
        greet,
        p(
          'Every office that has tried calling old patients on its own has hit the same wall. Someone exports the list, prints it or opens the spreadsheet, and there it is: 800 names. Nobody knows where to start, so nobody starts. Or they start, get to row 40, and the sheet quietly dies in a drawer.',
        ),
        p('The list wasn\'t the problem. <strong>The pile was.</strong>'),
        image(
          asset('28-never-eight-hundred.jpg'),
          'On the left, a dense grid of 800 patient files. An arrow narrows into a clean card on the right labeled Calls Due Now, 7, with seven rows, and a smaller line beneath it: 793 in reserve. Nobody can face 800. Everybody can make 7.',
        ),
        p('Here\'s how the program handles the same 800 names:'),
        steps([
          [
            'Import once. Work seven at a time.',
            'Your whole list goes in, but the team only ever sees the calls due now &mdash; a batch of seven (you can set five or ten). The other 793 wait in reserve, out of sight.',
          ],
          [
            'Follow-ups come first.',
            'Someone who said &ldquo;call me next Tuesday&rdquo; shows up at the top on Tuesday. Someone who didn\'t answer shows up again in four to seven days, at a different time of day. Commitments never get buried under new names.',
          ],
          [
            'Finish the batch, get the next one.',
            'When the seven are worked, the next seven appear. A fast caller can pull the next batch early; a busy day just means the batch waits. Either way, there\'s never a wall of names.',
          ],
          [
            'Time-of-day hints.',
            'A callback that\'s due this afternoon says so. Your team works top to bottom and trusts the order.',
          ],
        ]),
        cta('Want to see the queue with a real list in it?', 'See It Live on a Call'),
        p(
          'That\'s the difference between a spreadsheet and a queue. A spreadsheet shows you everything you haven\'t done. A queue shows you the next thing to do.',
        ),
        darkPanel([
          'Nobody stays motivated staring at 800 rows.',
          'Everybody can make seven calls.',
        ]),
        p(
          'On the call we\'ll look at your actual list size and pick the batch size that fits your team\'s day.',
        ),
        cta("Let's look at your list and set the pace:", 'Book Your Call'),
        finePrint(),
        signoff(),
      ]),
      'Seven calls due. The rest wait in reserve. That one design choice is why this gets done.',
    ),
  },
  {
    id: 'what-we-wont-do',
    audience: 'chiropractic',
    name: 'Email 29 — What We Won\u2019t Do on the Call',
    subject: '3 things we won\u2019t do on the call',
    previewText:
      'No pressure, no countdown, no asking for a decision while you\u2019re still on the phone.',
    angle:
      'Short form. Removes the fear of a sales call so the skeptical lead books — and keeps the appointment.',
    html: wrap(
      compose([
        h1('What the call is not'),
        greet,
        p(
          'You know the version of this call you\'re bracing for. Here\'s what ours doesn\'t include.',
        ),
        image(
          asset('29-what-we-wont-do.jpg'),
          'What the call is not. Three gray cards, each marked with an X: Pressure, A Countdown, Deciding on the Phone. Below them a single teal card with a check: A Number You Can Hold Us To. Pick a time. Bring your skepticism.',
        ),
        checks([
          '<strong>We won\'t pressure you.</strong> If the numbers don\'t work for your practice, we\'ll be the first to say so.',
          '<strong>We won\'t put a clock on it.</strong> There\'s no price that disappears when the call ends.',
          '<strong>We won\'t ask you to decide on the phone.</strong> You\'ll leave with your break-even and think it over with real numbers in hand.',
        ]),
        p(
          'What it does include is a straight look at your list, your case average, and your team &mdash; and a number you can hold us to.',
        ),
        cta('Pick a time. Bring your skepticism:'),
        finePrint(),
        signoff(),
      ]),
      'No pressure, no countdown, no asking for a decision while you\u2019re still on the phone.',
    ),
  },
  {
    id: 'new-associate',
    audience: 'chiropractic',
    name: 'Email 30 — The New Associate\u2019s Empty Schedule',
    subject: 'The fastest way to fill a new associate\u2019s schedule',
    previewText:
      'An empty schedule and a full filing cabinet, in the same building.',
    angle:
      'Medium form. Speaks to owners adding a provider — the inactive list is the warmest way to fill a new schedule.',
    html: wrap(
      compose([
        h1('An empty schedule and a full filing cabinet, in the same building'),
        greet,
        p(
          'Bringing on an associate is a bet: you carry their salary until their schedule fills. The usual plan is &ldquo;we\'ll market them&rdquo; &mdash; ads, a page on the website, a sign out front. Slow, expensive, and aimed at strangers.',
        ),
        p(
          'Meanwhile, down the hall, there\'s a filing cabinet &mdash; or a database &mdash; full of people who already trust the practice. They just stopped coming.',
        ),
        image(
          asset('30-new-associate.jpg'),
          'A young associate chiropractor stands in a clean, quiet treatment room studying a mostly open schedule on a tablet, while shelves of patient folders fill the wall beside him. The warmest patients for a new provider already know the practice.',
        ),
        panel([
          'A past patient doesn\'t need to be sold on the practice. They need to be told the practice has room, and given a reason to come in. <strong>That\'s a phone call, not a campaign.</strong>',
        ]),
        p(
          'Reactivation calls fill an associate\'s schedule in the order that makes sense: warm patients first. The conversation is the same either way &mdash; how have you been since you finished care, what\'s been bothering you &mdash; and the appointment goes to the provider with the openings.',
        ),
        checks([
          'No new marketing spend to launch a new provider.',
          'The associate\'s first patients already like the office.',
          'Your senior doctor\'s schedule stays full while the new one builds.',
          'Every reactivated patient is a potential referral for both.',
        ]),
        p(
          'If you\'re adding a provider in the next year &mdash; or already did, and the schedule is thinner than you\'d like &mdash; that\'s exactly the situation to bring to the call.',
        ),
        cta("Let's talk about filling that schedule from the list you already own:"),
        finePrint(),
        signoff(),
      ]),
      'An empty schedule and a full filing cabinet, in the same building.',
    ),
  },
  {
    id: 'three-endings',
    audience: 'chiropractic',
    name: 'Email 31 — Every Call Ends One of Three Ways',
    subject: 'Every call ends one of 3 ways. Here\u2019s what happens next for each.',
    previewText:
      'Scheduled, not yet, or no answer — nothing falls through, because the next step is already decided.',
    angle:
      'Long form. Walks through dispositions and automatic follow-through — the part DIY efforts always lose.',
    html: wrap(
      compose([
        h1('Nothing falls through, because &ldquo;what next&rdquo; is already decided'),
        greet,
        p(
          'The reason most reactivation efforts die isn\'t the calls. It\'s what happens after them. Someone says &ldquo;call me in a few months&rdquo; and there\'s no system to remember. Someone doesn\'t answer and nobody knows when to try again. Within a month, the effort is a stack of sticky notes.',
        ),
        p(
          'In the program, every call ends by tapping one outcome &mdash; and each outcome already has a next step.',
        ),
        image(
          asset('31-three-endings.jpg'),
          'A phone icon labeled Every Call branches into three paths: Scheduled, on the books; Not Yet, back in 3 months; No Answer, retry in 4 to 7 days. Nothing lives in anyone\'s memory.',
        ),
        steps([
          [
            'Scheduled.',
            'The appointment is on your books. The patient leaves the queue, and the dashboard adds one to &ldquo;scheduled this week.&rdquo;',
          ],
          [
            'Spoke, didn\'t schedule.',
            'Maybe the timing was wrong. They resurface for a fresh call in about three months, at a normal calling hour &mdash; long enough not to be a pest, soon enough that you\'re still the practice they think of.',
          ],
          [
            'Spoke, call back later.',
            'They said &ldquo;try me Thursday afternoon.&rdquo; Your caller picks the time, and on Thursday it\'s at the top of the list with a note that says <em>call afternoon</em>.',
          ],
          [
            'No answer.',
            'It comes back in four to seven days, at a different time of day, on purpose. Every second attempt, the caller leaves a short scripted voicemail. This continues for about two months; after that the patient moves to a quarterly check-in instead of being forgotten.',
          ],
          [
            'Do not call.',
            'One tap, and they\'re out for good. Respecting the no is part of the system too.',
          ],
        ]),
        cta('Five outcomes, zero sticky notes. See it working on a live list:', 'Pick a Time That Works'),
        p(
          'None of that lives in anyone\'s memory. It\'s the software\'s job. Your team\'s job is the seven calls in front of them.',
        ),
        panel([
          'The patient who books on the fourth attempt has no idea it was the fourth. To them, you called once, at a good time.',
        ]),
        p(
          'On the call, we\'ll show you the queue with a real list in it, so you can see how the follow-ups stack up for yourself.',
        ),
        cta('Ready to see the follow-through on your own list?', 'Book Your Strategy Call'),
        finePrint(),
        signoff(),
      ]),
      'Scheduled, not yet, or no answer — nothing falls through, because the next step is already decided.',
    ),
  },
  {
    id: 'ask-your-front-desk',
    audience: 'chiropractic',
    name: 'Email 32 — Ask Your Front Desk One Question',
    subject: 'Ask your front desk this one question',
    previewText:
      'If nobody knows the number, that\u2019s the number we start with.',
    angle:
      'Short form. A tiny homework task that makes the opportunity tangible and hands the lead a reason to book.',
    html: wrap(
      compose([
        h1('A one-question test'),
        greet,
        p(
          'Before you book anything, try this. Walk up to your front desk and ask: <strong>&ldquo;How many patients do we have that we haven\'t seen in over a year?&rdquo;</strong>',
        ),
        image(
          asset('32-ask-your-front-desk.jpg'),
          'A chiropractor leans on the reception counter asking a question; the front-desk team member pauses mid-shrug with a friendly, uncertain expression, monitor glowing beside her. How many patients haven\'t we seen in over a year?',
        ),
        p(
          'The honest answer is usually a pause, a guess, and &ldquo;I could probably run a report.&rdquo; That isn\'t a criticism of your team. It\'s just not a number anyone looks at &mdash; which is exactly why it\'s worth so much.',
        ),
        panel([
          'You don\'t need the exact figure to book the call. You need it to be surprising. <strong>It usually is.</strong>',
        ]),
        p(
          'Bring whatever answer you get &mdash; the report or the guess &mdash; and we\'ll turn it into your break-even on the call.',
        ),
        cta('Ask the question, then grab a time:'),
        finePrint(),
        signoff(),
      ]),
      'If nobody knows the number, that\u2019s the number we start with.',
    ),
  },
  {
    id: 'why-your-team-calls',
    audience: 'chiropractic',
    name: 'Email 33 — Why We Don\u2019t Make the Calls for You',
    subject: 'Why we don\u2019t make the calls for you',
    previewText:
      'A stranger in a call center undoes the one advantage you have.',
    angle:
      'Medium form. Answers the "why not outsource it" question and turns it into a reason the program is built around the lead\'s own team.',
    html: wrap(
      compose([
        h1('The call has to come from your office'),
        greet,
        p(
          'Owners sometimes ask why we don\'t just make the calls for them. It would be easier to sell. It would also be worse.',
        ),
        p(
          'Think about what makes these calls work at all. A familiar name on the caller ID. A voice the patient may recognize. Someone who can say &ldquo;we&rdquo; about the practice and mean it. The moment that voice belongs to a call center, the patient is talking to a stranger &mdash; and a stranger reactivates nobody.',
        ),
        image(
          asset('33-why-your-team-calls.jpg'),
          'Split image. Left, labeled A Call Center: rows of gray cubicles and headsets under fluorescent light. Right, labeled Your Front Desk: a warm chiropractic reception desk with a team member on the phone. Trust doesn\'t transfer to a stranger.',
        ),
        compare(
          'A call center',
          [
            'Unfamiliar number, unfamiliar voice',
            'Reads about your practice from a sheet',
            'Can\'t answer &ldquo;is Dr. Patel still there?&rdquo;',
            'Every call starts from zero trust',
          ],
          'Your front desk',
          [
            'Your office on the caller ID',
            'Knows the doctor, the space, the schedule',
            'Books the appointment on the spot',
            'Trust carried over from the last visit',
          ],
        ),
        p(
          'So we built the program around your team instead: the words, the order of calls, the follow-through, the tracking. Everything except the voice.',
        ),
        p('The result is a call that sounds like your practice checking in &mdash; because it is.'),
        cta("Let's talk about who in your office would make these calls:"),
        finePrint(),
        signoff(),
      ]),
      'A stranger in a call center undoes the one advantage you have.',
    ),
  },
  {
    id: 'month-three',
    audience: 'chiropractic',
    name: 'Email 34 — What Month Three Looks Like',
    subject: 'Month one is a project. Month three is a rhythm.',
    previewText:
      'By month three the follow-ups start coming due and the list runs itself.',
    angle:
      'Long form. Extends the 30-day picture to 90 days so leads don\'t judge the program on week two — and offers to map their own timeline on the call.',
    html: wrap(
      compose([
        h1('What month three looks like'),
        greet,
        p(
          'We\'ve shown you the first 30 days. Here\'s what changes after &mdash; because month three is where this stops feeling like a project.',
        ),
        image(
          asset('34-month-three.jpg'),
          'A three-stage timeline: Month 1, first attempts; Month 2, follow-ups arrive; Month 3, the rhythm. A teal line rises across the three stages as the mix shifts from cold calls to warm follow-ups. Month one is a project. Month three is a rhythm.',
        ),
        steps([
          [
            'Month one &mdash; the cold list.',
            'Almost every call is a first attempt. Some book right away; many don\'t answer or aren\'t ready. That\'s expected. The queue records every outcome and schedules the next step.',
          ],
          [
            'Month two &mdash; the follow-ups arrive.',
            'The no-answers from month one come back for their second, third and fourth attempts, each at a different time of day than the last. Callbacks land on the days patients asked for. The &ldquo;calls due&rdquo; list is now a mix of new names and people you\'ve already touched.',
          ],
          [
            'Month three &mdash; the rhythm.',
            'The &ldquo;spoke, didn\'t schedule&rdquo; patients from month one resurface for a fresh conversation. Your caller has the script cold. Your analytics show which hour of the day gets answered and which gets a yes, so the block of calls moves to where it works. The list has become a routine, not an initiative.',
          ],
        ]),
        cta('Want this mapped to your list size?', 'Map My First 90 Days'),
        p('Two things worth noticing about that arc:'),
        checks([
          '<strong>The best month isn\'t the first one.</strong> Programs judged on week two get abandoned right before the follow-ups come due.',
          '<strong>The work per day doesn\'t grow.</strong> The batch stays the size you set; what changes is how much of it is warm.',
        ]),
        darkPanel([
          'A patient list isn\'t harvested. It\'s tended.',
          'The system does the remembering so your team only has to do the calling.',
        ]),
        p(
          'On the call, we\'ll map your list size to this timeline so you know what a realistic month one, two and three look like for your office &mdash; before you commit to anything.',
        ),
        cta("Grab a time and we'll build it together:", 'Schedule Your Strategy Session'),
        finePrint(),
        signoff(),
      ]),
      'By month three the follow-ups start coming due and the list runs itself.',
    ),
  },
  {
    id: 'dont-decide-yet',
    audience: 'chiropractic',
    name: 'Email 35 — Don\u2019t Decide Yet',
    subject: 'Don\u2019t decide yet',
    previewText:
      'The call is where the numbers get real. Decide after it, not before.',
    angle:
      'Short form. Reorders the decision: book first, decide with real numbers after. Directly targets the silent "probably not."',
    html: wrap(
      compose([
        h1('Decide after the call, not before it'),
        greet,
        p(
          'A lot of owners read emails like these and quietly make the decision in their head: probably not, not right now, maybe later. Then they never book the call &mdash; which is the one place the decision would have had real numbers in it.',
        ),
        image(
          asset('35-dont-decide-yet.jpg'),
          'A desk planner open on a wooden desk in morning light, one time slot circled in teal marker, a pen resting across the page. Booking isn\'t a yes.',
        ),
        p(
          'So here\'s a different order. Don\'t decide. Book the call. Bring your list size and your case average. Let us work out the break-even in front of you. <strong>Then</strong> decide.',
        ),
        panel([
          'Booking isn\'t a yes. It\'s how you find out whether the yes would be worth it.',
        ]),
        p(
          'If the answer is no, you\'ve spent a short call and gained a number. If it\'s yes, you\'ll know exactly why.',
        ),
        cta('Book first. Decide after:'),
        finePrint(),
        signoff(),
      ]),
      'The call is where the numbers get real. Decide after it, not before.',
    ),
  },
  {
    id: 'natural-not-improvised',
    audience: 'chiropractic',
    name: 'Email 36 — Sounds Natural, Isn\u2019t Improvised',
    subject: 'Your team shouldn\u2019t wing it \u2014 and they won\u2019t have to',
    previewText:
      'The conversation sounds natural because every word was chosen in advance.',
    angle:
      'Medium form. Defuses the "scripts sound robotic" worry and offers to read a screen aloud on the call.',
    html: wrap(
      compose([
        h1('Sounds natural. Isn\u2019t improvised.'),
        greet,
        p(
          'The word &ldquo;script&rdquo; makes owners flinch. Nobody wants their front desk sounding like a robocall.',
        ),
        p(
          'But think about the best phone person you\'ve ever had. They weren\'t improvising. They said the same warm things in the same order every time, because those things worked. A script is just that person\'s habits, written down so everyone can have them.',
        ),
        image(
          asset('36-natural-not-improvised.jpg'),
          'A front-desk team member in a headset mid-conversation, relaxed and smiling, a tablet propped on the desk showing a script with a few large buttons, a plant and natural light beside her. Sounds natural. Isn\'t improvised.',
        ),
        panel([
          'The script isn\'t read aloud. Your caller sees the next line and the buttons for what the patient might say, glances down, and talks like a person. <strong>The screen keeps the conversation on track; the caller keeps it human.</strong>',
        ]),
        checks([
          'Pauses are built in &mdash; the script tells the caller where to stop and listen.',
          'The patient\'s own words are used back to them, not a canned pitch.',
          'Small choices matter: &ldquo;does that sound reasonable&rdquo; instead of &ldquo;does that sound good.&rdquo; One invites a yes; the other invites a shrug.',
          'The honesty pledge is in every recommendation: if we can\'t help, we\'ll say so.',
        ]),
        p(
          'Your team won\'t sound scripted. They\'ll sound like your practice on its best day, every time.',
        ),
        cta('Hear a screen read aloud on the call &mdash; book a time:'),
        finePrint(),
        signoff(),
      ]),
      'The conversation sounds natural because every word was chosen in advance.',
    ),
  },
  {
    id: 'every-reason-answered',
    audience: 'chiropractic',
    name: 'Email 37 — Every Reason Not to Book, Answered',
    subject: 'Every reason not to book the call, in one place',
    previewText:
      'Too busy, tried it, they moved on, not the right time. The short version of each.',
    angle:
      'Long form. FAQ-style recap for fence-sitters deep in the sequence; every answer routes back to the call.',
    html: wrap(
      compose([
        h1('Still on the fence? Here\u2019s the short version of everything.'),
        greet,
        p(
          'If you\'ve read a few of these and haven\'t booked, there\'s probably a specific reason. Here are the ones we hear most, each with the honest short answer.',
        ),
        cta('Already past all of them? Skip straight to the calendar:', 'Skip to the Calendar'),
        image(
          asset('37-every-reason-answered.jpg'),
          'Six cards, each with a teal check: No Time, Tried It, They Moved On, Seems Desperate, Not Now, Will It Pay. Bring your reason. We\'ll answer it.',
        ),
        steps([
          [
            '&ldquo;My team doesn\'t have time.&rdquo;',
            'It\'s a small block of calls a day, in gaps your front desk already has. If there truly isn\'t a block, that\'s a real answer &mdash; and we\'ll tell you so on the call.',
          ],
          [
            '&ldquo;We tried calling before.&rdquo;',
            'You tried a list. This is a system: the words, the queue, the follow-through, the numbers. The difference is why it didn\'t stick last time.',
          ],
          [
            '&ldquo;Our patients have moved on.&rdquo;',
            'Some have. Plenty just got busy, felt awkward about coming back, and let it slide. The call is the permission they\'ve been waiting for.',
          ],
          [
            '&ldquo;They\'ll think we\'re desperate.&rdquo;',
            'A practice checking on how someone\'s been feeling since their last visit isn\'t desperate. It\'s what a good office does.',
          ],
          [
            '&ldquo;It\'s not the right time.&rdquo;',
            'There\'s no season for this. Every month a slice of the list becomes unreachable, so the right time is always as soon as you have a system to work it with.',
          ],
          [
            '&ldquo;I\'m not sure it\'ll pay off.&rdquo;',
            'Break-even is one to three returning patients, depending on your case average. We\'ll work out yours on the call before you spend a dollar.',
          ],
        ]),
        p(
          'Notice that a few of those answers might come back as &ldquo;you\'re right, this isn\'t for you.&rdquo; That\'s fine. The call exists to find that out quickly.',
        ),
        darkPanel([
          'The only reason we can\'t answer is the one you don\'t bring.',
          'Book the call and bring it.',
        ]),
        cta("Bring your reason. We'll give you the straight answer:", 'Book the Call'),
        finePrint(),
        signoff(),
      ]),
      'Too busy, tried it, they moved on, not the right time. The short version of each.',
    ),
  },
  {
    id: 'four-sentences',
    audience: 'chiropractic',
    name: 'Email 38 — The Whole Thing in Four Sentences',
    subject: 'Quick one \u2014 four sentences',
    previewText: 'The whole program in four sentences, then one question.',
    angle:
      'Short form. Pattern-interrupt after longer emails: the entire pitch in four lines and a single ask.',
    html: wrap(
      compose([
        h1('Four sentences'),
        greet,
        image(
          asset('38-four-sentences.jpg'),
          'Overhead view of a quiet morning desk: a coffee, a phone face-down, and a notepad with four short handwritten lines beside a pen. Four sentences. One call.',
        ),
        p('You have hundreds of past patients who liked you and drifted.'),
        p(
          'Your front desk, with the right words on the screen, can call them in a small block each day.',
        ),
        p(
          'The system decides who\'s next, remembers every follow-up, and shows you what came back.',
        ),
        p('One to three of those patients returning pays for the whole thing.'),
        panel([
          'That\'s it. The only question is whether it\'s worth a short call to see what those numbers look like for your office.',
        ]),
        cta("Yes, let's look:"),
        finePrint(),
        signoff(),
      ]),
      'The whole program in four sentences, then one question.',
    ),
  },
  {
    id: 'after-you-book',
    audience: 'chiropractic',
    name: 'Email 39 — What Happens After You Book',
    subject: 'What happens after you click \u201CSchedule a Call\u201D',
    previewText:
      'A confirmed time, a short call about your numbers, and a break-even you keep either way.',
    angle:
      'Medium form. Sets expectations for everything after the click so the lead books with confidence and shows up prepared.',
    html: wrap(
      compose([
        h1('What happens after you book'),
        greet,
        p('The form takes about a minute. Here\'s everything after it, so there are no surprises.'),
        cta('If you\'re ready now, this is step one:', 'Start With the Form'),
        image(
          asset('39-after-you-book.jpg'),
          'Four connected steps: Pick a Time, Pull 3 Numbers, The Call, Your Break-Even. No surprises. Just your numbers.',
        ),
        steps([
          [
            'You pick a time on the calendar.',
            'Right after the form, in your own time zone. You\'ll see your confirmed time immediately.',
          ],
          [
            'Before the call, pull three rough numbers.',
            'Inactive patients, case average, and who would make the calls. Rough is fine.',
          ],
          [
            'On the call, we do the math together.',
            'Your break-even, whether the list is big enough, and what a realistic first 90 days looks like for your office.',
          ],
          [
            'You leave with the number.',
            'Whether or not you go further, the break-even is yours to keep. If we don\'t think we can help, we say so.',
          ],
        ]),
        panel([
          'One request: if the time stops working, grab another one rather than skipping it. The call is short, and the number is worth having.',
        ]),
        cta('Everything above starts with one click:', 'Grab a Time on the Calendar'),
        finePrint(),
        signoff(),
      ]),
      'A confirmed time, a short call about your numbers, and a break-even you keep either way.',
    ),
  },
  {
    id: 'where-this-leaves-you',
    audience: 'chiropractic',
    name: 'Email 40 — Where This Leaves You',
    subject: 'Where this leaves you',
    previewText:
      'The list, the team, the system, and one short call. That\u2019s the whole decision.',
    angle:
      'Long form. Closes the sequence by assembling the whole argument in one place and ending on the script\'s own close.',
    html: wrap(
      compose([
        h1('The whole case, one last time'),
        greet,
        p(
          'We\'ve sent you a lot of emails. Here\'s the whole argument in one place, so you can judge it as a whole.',
        ),
        image(
          asset('40-where-this-leaves-you.jpg'),
          'A bright chiropractic lobby, busy in a good way: patients of different ages checking in and waiting, the front desk in the middle of it, morning light through the windows. A full schedule from a list you already own.',
        ),
        p(
          '<strong>The list is real.</strong> Hundreds of people who chose you once, paid you, and drifted for reasons that had nothing to do with you. Many haven\'t found another provider, and a call from a familiar office is the permission plenty of them were waiting for.',
        ),
        p(
          '<strong>Your team can do it.</strong> Not with sales skills &mdash; with the words on the screen. A small block of calls a day, in gaps they already have.',
        ),
        p(
          '<strong>The system does the remembering.</strong> Who\'s next, when to try again, what to say when they stall, what came back. Nothing lives on a sticky note.',
        ),
        p(
          '<strong>The math is small.</strong> One to three returning patients cover the investment. Everything after is margin from a list you already own.',
        ),
        p(
          '<strong>And the list doesn\'t wait.</strong> Every month, a slice of it quietly becomes unreachable.',
        ),
        cta('If that already adds up for you:', 'Reserve My Strategy Call'),
        darkPanel([
          'You don\'t have to believe any of that yet.',
          'You have to spend one short call finding out whether it\'s true for your office.',
        ]),
        p(
          'If it isn\'t, we\'ll tell you, and you\'ll walk away with a clearer picture of an asset you already own. If it is, you\'ll know exactly what one to three patients are worth to you &mdash; and how many are sitting in that list.',
        ),
        p('Does that sound reasonable?'),
        cta("Let's find out together:", 'Schedule Your Call'),
        finePrint(),
        signoff(),
      ]),
      'The list, the team, the system, and one short call. That\u2019s the whole decision.',
    ),
  },
]

/** The templates for one audience, in sequence order. */
export function templatesForAudience(
  audience: EmailAudienceId,
): EmailTemplate[] {
  return EMAIL_TEMPLATES.filter((t) => t.audience === audience)
}
