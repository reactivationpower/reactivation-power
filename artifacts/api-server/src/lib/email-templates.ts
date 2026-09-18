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
const image = (src: string, alt: string, maxWidth = 520) =>
  `            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
  <td>
  <img src="${src}" alt="${alt}" width="${maxWidth}" style="display:block;width:100%;max-width:${maxWidth}px;height:auto;margin:0 auto;border-radius:6px;" />
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
                  <img src="${asset('1-1-old-patient-files-asset.jpg')}" alt="Your old patient files are an asset — the opportunity is already sitting in your database. 1,000 old patient files, just 5% reactivated through simple outreach, equals 50 returning patients at a $2,000 average patient value: $100,000 in recovered revenue. This is not new business — this is business you already earned." width="520" style="width:100%;max-width:520px;height:auto;margin:0 auto;border-radius:6px;" />
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
          'In the last email I showed you a number: 1,000 inactive files, five percent of them back at $2,000 each, roughly <strong>$100,000</strong>. Numbers are easy to nod at. So let\'s put faces on it.',
        ),
        image(
          asset('1-2-who-is-in-your-thousand.jpg'),
          'Who is actually in your 1,000. A bright chiropractic reception area; the front-desk monitor shows an Inactive Patients list of 1,000 names sorted by last visit. Five kinds of patient make up the list: finished care, felt great, drifted; missed one visit, never rebooked; came in for one thing only; insurance or life changed; the rest of the family. Not one of them is a stranger.',
        ),
        p('Pull up the inactive list in any chiropractic office and the same five people are in it:'),
        checks([
          '<strong>Finished care and felt great</strong> &mdash; so they stopped coming. They still call you their chiropractor.',
          '<strong>Missed one visit</strong>, nobody followed up, and after a few weeks calling in felt awkward.',
          '<strong>Came in for one thing</strong>, years ago. They have no idea you do decompression or weight loss now.',
          '<strong>Life changed</strong> &mdash; new job, new insurance, a move. It has changed again since, and nobody has asked.',
          '<strong>The rest of the family</strong>, at the same address, never once invited in.',
        ]),
        p(
          'Not one of these is a cold call. Every name already knows your practice and your front door. That\'s the difference between this and every other kind of marketing you\'ve paid for.',
        ),
        cta('On the call we pull up your actual list and sort it exactly like this:'),
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
          'Which leaves one question. If it\'s worth that much, and they\'re that easy to call, <strong>why is it still sitting there?</strong> Not because you don\'t care, and not because your team can\'t do it. It\'s still sitting there because the list has no owner.',
        ),
        image(
          asset('1-3-list-has-no-owner.jpg'),
          'Why it is still sitting there versus what changes. Left: a quiet chiropractic front desk with an idle phone and a long patient list on the monitor &mdash; nobody\'s name is on it, nobody knows what to say, nobody knows who\'s been called. Right: the same desk with a front-desk team member on the phone and a call queue on screen &mdash; one person owns it, every word is on the screen, the queue knows who\'s next. A system problem, not a willpower problem.',
        ),
        checks([
          '<strong>Nobody\'s name is on it.</strong> &ldquo;Someone should call these people&rdquo; never gets them called. &ldquo;Sarah calls fifteen at two o\'clock&rdquo; does.',
          '<strong>Nobody knows what to say.</strong> Without the words, the first awkward pause ends the whole effort.',
          '<strong>Nobody knows who\'s been called.</strong> So the same three names get called twice and the other 997 never hear from anyone.',
        ]),
        p(
          'That\'s a system problem, not a willpower problem &mdash; and system problems are the fixable kind. Reactivation Power is the fix: <strong>an owner</strong> (your front desk, in the gaps they already have), <strong>the words</strong> (a script on screen for every call), and <strong>the record</strong> (a queue that knows who\'s next).',
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
    name: 'Email 2.1 — Stop Paying to Reach Strangers',
    subject: 'Before you spend another dollar on ads, read this',
    previewText:
      'New services, same patients. The fastest way to fill your schedule is the list of people who already said yes to you once.',
    angle:
      'Day 2, email 1. Contrast angle: the cost and friction of marketing to cold audiences vs. tapping existing and inactive patients, especially for new services.',
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
                  <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Concept_3_Marketing_Dollar_No_Label-hRD6TlNZDpAljxjZxATJhZIlYtOSwo.png" alt="Where would you rather spend your marketing dollar? Acquiring a stranger costs money at every step — ad spend, click, lead, follow-up, appointment ��� with an uncertain outcome. Reactivating a patient is just a phone call and an appointment: low cost, higher return." width="520" style="width:100%;max-width:520px;height:auto;margin:0 auto;border-radius:6px;" />
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
    id: 'seven-steps-for-a-stranger',
    audience: 'chiropractic',
    name: 'Email 2.2 — Seven Steps for a Stranger',
    subject: 'Seven steps for a stranger. One for a patient.',
    previewText:
      'Every step a stranger takes is a place they can leave and a place you pay. A past patient skips straight to the last one.',
    angle:
      'Day 2, email 2. Builds on 2.1 by walking the stranger\'s path step by step — where the money goes, where they drop out — against the past patient\'s path, which starts at the last step.',
    html: wrap(
      compose([
        h1('Seven steps for a stranger. One for a patient.'),
        greet,
        p(
          'In the last email I said marketing to strangers is the most expensive way to grow. Here\'s why. Before a stranger is on your table they have to see the ad, click, fill out a form, get called back, trust a name they\'ve never heard, show up, and get past the price.',
        ),
        image(
          asset('2-2-seven-steps-for-a-stranger.jpg'),
          'Seven steps for a stranger, one for a patient. The stranger: see the ad, click, fill the form, get called back, trust a name, show up, get past the price. You pay at every step; they can leave at every step. The past patient: your front desk calls, they book. Steps one through six already happened. You paid for them once. You never have to pay for them again.',
        ),
        p(
          '<strong>Every one of those seven steps is a place you pay and a place they can leave.</strong> Most people who see the ad never click. Most who click never finish the form. And a stranger who books has nothing invested in keeping the appointment.',
        ),
        darkPanel([
          'Now the past patient. Your front desk calls. They hear a name they know. They book.',
          'Steps one through six already happened &mdash; the first time they were your patient. You paid for them once. You never have to pay for them again.',
        ]),
        p(
          'On the call we pull up your inactive list and count how many people on it are already standing at the last step. That\'s the number the ad budget never sees.',
        ),
        cta('Pick a time and we\'ll count them together:'),
        finePrint(),
        signoff(),
      ]),
      'Every step a stranger takes is a place they can leave and a place you pay. A past patient skips straight to the last one.',
    ),
  },
  {
    id: 'ads-come-packaged',
    audience: 'chiropractic',
    name: 'Email 2.3 — Ads Come Packaged',
    subject: 'Why the ad budget keeps winning',
    previewText:
      'Not because ads work better. Because someone packaged them, and nobody packaged your list.',
    angle:
      'Day 2, email 3. Closes the day: if strangers cost more and past patients cost less, why does the ad budget keep getting approved? Names the obstacle — ads come packaged, the list doesn\'t — and positions the program as the package.',
    html: wrap(
      compose([
        h1('Why the ad budget keeps winning'),
        greet,
        p(
          'Over the last two emails I\'ve made one argument: strangers are the expensive way to grow, and past patients are the short path. Which raises an obvious question. <strong>Why does the ad budget keep getting approved?</strong>',
        ),
        p('It isn\'t because ads work better. It\'s because ads come packaged.'),
        image(
          asset('2-3-ads-come-packaged.jpg'),
          'Ads come packaged. Your list doesn\'t. A practice owner at his desk looks at a tall stack of plain patient folders beside a glossy marketing report. What the ad budget comes with: someone who sells it to you, someone who runs it, a report every month. Nobody sells you your own list, so it stays a good idea.',
        ),
        checks([
          '<strong>Someone sells it to you.</strong> An agency calls, walks you through a deck, and asks for a budget. Nobody calls to sell you your own list.',
          '<strong>Someone runs it.</strong> Say yes and the campaign happens without you. The list waits for a free afternoon.',
          '<strong>Someone reports on it.</strong> Clicks, leads, a dashboard every month. The list has never produced a report, so it never gets a line in the budget.',
        ]),
        p(
          'The list doesn\'t lose because it\'s worth less. It loses because it isn\'t packaged. That\'s what Reactivation Power is: the package &mdash; a queue that sets each day\'s calls, a script on screen for every conversation, and a dashboard that shows what came back.',
        ),
        cta('Book a call and we\'ll show you what your list looks like once it\'s packaged:'),
        finePrint(),
        signoff(),
      ]),
      'Not because ads work better. Because someone packaged them, and nobody packaged your list.',
    ),
  },
  {
    id: 'front-desk-scripts',
    audience: 'chiropractic',
    name: 'Email 3.1 — Your Team Doesn\u2019t Need Sales Skills',
    subject: "Your front desk doesn't need to be salespeople",
    previewText:
      'The words are already written. Your team reads the screen, taps what the patient said, and the next line appears.',
    angle:
      'Day 3, email 1. Removes the #1 internal objection: "my team can\'t sell." The interactive script carries the call, so no memorizing and no winging it.',
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
    id: 'three-moments-written',
    audience: 'chiropractic',
    name: 'Email 3.2 — The Three Moments Your Front Desk Dreads',
    subject: 'The three moments your front desk dreads',
    previewText:
      'The opener, the &ldquo;I\u2019m fine now,&rdquo; and the ask. All three are already written.',
    angle:
      'Day 3, email 2. Makes 3.1 concrete by naming the three moments in a reactivation call that make untrained staff freeze, and showing that each one is on the screen word for word.',
    html: wrap(
      compose([
        h1('The three moments your front desk dreads'),
        greet,
        p(
          'In the last email I said your team doesn\'t need sales skills. Here\'s what that means in practice. A reactivation call has three moments that make people freeze &mdash; and all three are on the screen, word for word.',
        ),
        image(
          asset('3-2-three-moments-written.jpg'),
          'Three moments your front desk dreads. All three are written. A tablet on a chiropractic front desk shows the call script: How have you been feeling since you finished your care with us? Below it, three answer chips: doing great now, too busy, ask my spouse. Tap what the patient said and the next line appears.',
        ),
        steps([
          [
            'The first sentence.',
            'It opens with a question, not a pitch: &ldquo;How have you been feeling since you finished your care with us?&rdquo;',
          ],
          [
            '&ldquo;Honestly, I\'ve been fine.&rdquo;',
            'Your team taps that answer and the next question appears. No pause, no scramble.',
          ],
          [
            'The ask.',
            'Written as a recommendation with permission &mdash; &ldquo;Can I make a recommendation?&rdquo; &mdash; and it ends with &ldquo;Does that sound reasonable?&rdquo;',
          ],
        ]),
        p(
          'Nobody on your team has to be good at any of these. They have to be able to read, and to be kind. The screen handles the rest.',
        ),
        cta('We\'ll walk your team through all three on the call:'),
        finePrint(),
        signoff(),
      ]),
      'The opener, the "I\u2019m fine now," and the ask. All three are already written.',
    ),
  },
  {
    id: 'not-afraid-of-the-phone',
    audience: 'chiropractic',
    name: 'Email 3.3 — They\u2019re Not Afraid of the Phone',
    subject: 'Your team isn\u2019t afraid of the phone',
    previewText:
      'They\u2019re afraid of sounding like a salesperson. The script was written so they never do.',
    angle:
      'Day 3, email 3. Closes the day by naming the real obstacle behind "my team can\'t sell": kind people improvising a pitch feel like salespeople and stop. The words are written to sound like a check-in from the office.',
    html: wrap(
      compose([
        h1('Your team isn\'t afraid of the phone'),
        greet,
        p(
          'Two emails on the script now, and one thing left to say about it. When a front desk stalls on reactivation calls, the diagnosis is usually &ldquo;they\'re not salespeople.&rdquo; That\'s the wrong diagnosis.',
        ),
        p(
          'Your team talks to patients on the phone all day. What they don\'t want is to <strong>sound like a salesperson</strong> &mdash; and when nobody gives them the words, that\'s exactly what improvising turns into. A kind person making up a pitch hates every second of it, so they stop.',
        ),
        image(
          asset('3-3-not-afraid-of-the-phone.jpg'),
          'Your team isn\'t afraid of the phone. A smiling front-desk team member on a headset at a chiropractic reception counter. Written like a check-in, not a pitch: their name and their history; a question about how they\'ve been; read, not performed. Nobody on your team has to sound like a salesperson.',
        ),
        panel([
          'The script isn\'t written like a pitch. It\'s written like a check-in from the office they already know: their name, their history, a question about how they\'ve been. Reading that isn\'t selling. It\'s the call your team would want to make anyway.',
        ]),
        p('That\'s the difference between &ldquo;call these people&rdquo; and calls that actually get made.'),
        cta('Hear what it sounds like &mdash; book a call and we\'ll read it to you:'),
        finePrint(),
        signoff(),
      ]),
      'They\u2019re afraid of sounding like a salesperson. The script was written so they never do.',
    ),
  },
  {
    id: 'the-math',
    audience: 'chiropractic',
    name: 'Email 4.1 — What Your List Is Actually Worth',
    subject: 'What are 1,000 inactive patients actually worth?',
    previewText:
      'Run the arithmetic on your own list. Even a conservative reactivation rate turns into real money.',
    angle:
      'Day 4, email 1. Pure math / ROI. Makes the opportunity concrete and lets the reader substitute their own numbers.',
    html: wrap(
      compose([
        h1('Let\u2019s do the arithmetic on your patient list'),
        greet,
        p(
          'Most practice owners have a rough sense that there\'s money in their inactive list. Very few have ever put a number on it. So let\'s put one on it.',
        ),
        p(
          'Take a practice with 1,000 inactive patient files and a $2,000 average patient value:',
        ),
        mathBox(
          [
            ['Inactive patient files', '1,000'],
            ['Reactivated at a conservative 5%', '50 patients'],
            ['Average patient value', '$2,000'],
          ],
          'Recovered revenue',
          '$100,000',
        ),
        p(
          '<strong>Cut either number in half and it still works.</strong> Half the rate, or half the patient value, and the same list is still $50,000 — from patients you already earned, with no ad spend attached to them.',
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
    id: 'use-your-numbers',
    audience: 'chiropractic',
    name: 'Email 4.2 — Use Your Numbers, Not Mine',
    subject: 'Use your numbers, not mine',
    previewText:
      'Two numbers, two sliders. The page does the arithmetic on your list.',
    angle:
      'Day 4, email 2. Makes 4.1 concrete: where to find the two inputs in the owner\'s own practice (inactive file count from the software, patient value as a plan of care), then points at the calculator sliders on the landing page.',
    html: wrap(
      compose([
        h1('Use your numbers, not mine'),
        greet,
        p(
          'The last email ran the arithmetic with 1,000 files and a $2,000 patient value. Yours are different. You only need two numbers to run it properly:',
        ),
        steps([
          [
            'How many inactive files you have.',
            'Your practice software can count this in a minute: patients with no visit in the last twelve months. Most owners are surprised by the number.',
          ],
          [
            'What a patient is worth.',
            'Not one visit &mdash; one plan of care, start to finish. Owners who guess low are almost always thinking of a single adjustment.',
          ],
        ]),
        image(
          asset('4-2-use-your-numbers.jpg'),
          'Use your numbers, not mine. Two calculator sliders: inactive patient files set to 1,000 and average patient value set to $2,000, with an estimate card reading $100,000 if 5% come back. Move the sliders to your numbers and the page does the arithmetic.',
        ),
        p(
          'The page behind the button below has two sliders. Move them to your numbers and it does the arithmetic on the spot &mdash; you\'ll see the result before you fill anything in.',
        ),
        cta('Run it on your list, then pick a time if the number is worth a conversation:'),
        finePrint(),
        signoff(),
      ]),
      'Two numbers, two sliders. The page does the arithmetic on your list.',
    ),
  },
  {
    id: 'a-loss-without-a-bill',
    audience: 'chiropractic',
    name: 'Email 4.3 — A Loss Nobody Sends You a Bill For',
    subject: 'A loss nobody sends you a bill for',
    previewText:
      'Ad spend shows up on a statement every month. The patients who didn\u2019t come back never do.',
    angle:
      'Day 4, email 3. Closes the day by naming why a six-figure number sits untouched: uncollected revenue never appears as a loss anywhere, so it never gets managed. The dashboard turns it into a number you can see.',
    html: wrap(
      compose([
        h1('A loss nobody sends you a bill for'),
        greet,
        p(
          'Over the last two emails we put a number on your inactive list. Here\'s why a number that size can sit untouched for years.',
        ),
        p(
          'Every dollar you spend on ads shows up on a statement. Payroll shows up. Software shows up. <strong>The patients who didn\'t come back never show up anywhere.</strong> There\'s no invoice for them, no line on the P&amp;L, no monthly report that says what they would have been worth.',
        ),
        image(
          asset('4-3-a-loss-without-a-bill.jpg'),
          'A loss nobody sends you a bill for. A practice owner reads a printed monthly statement at his desk. On the statement every month: ad spend, payroll, software. Never on it: the patients who didn\'t come back. Money you never collected never looks like money you lost.',
        ),
        p(
          'Money you never collected never looks like money you lost. So it gets attention about once a year, when someone wonders about it out loud, and then it goes back to being invisible.',
        ),
        p(
          'Reactivation Power puts it on a screen: how many were called, how many booked, and what came back, month by month. Once it\'s a number you can see, it becomes a number you can grow.',
        ),
        cta('Book a call and we\'ll show you the dashboard, and what your first month on it would look like:'),
        finePrint(),
        signoff(),
      ]),
      'Ad spend shows up on a statement every month. The patients who didn\u2019t come back never do.',
    ),
  },
  {
    id: 'already-tried',
    audience: 'chiropractic',
    name: 'Email 5.1 — \u201CWe Already Tried Calling Them\u201D',
    subject: '"We already tried calling our old patients"',
    previewText:
      'We hear this constantly. It usually means a list got printed and the calls stopped by Thursday.',
    angle:
      'Day 5, email 1. Handles the biggest objection head-on: they tried and it did not work. Reframes failure as missing system, not a bad list.',
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
    id: 'how-it-went-by-thursday',
    audience: 'chiropractic',
    name: 'Email 5.2 — How It Went by Thursday',
    subject: 'How it went by Thursday',
    previewText:
      'Monday the list got printed. Thursday it was under the keyboard. Here\u2019s what happened in between.',
    angle:
      'Day 5, email 2. Makes 5.1 concrete with the day-by-day anatomy of the attempt that fizzled, and names the three things that were missing: words, a queue, a record.',
    html: wrap(
      compose([
        h1('How it went by Thursday'),
        greet,
        p(
          'In the last email I said what most offices tried was a list and good intentions. Here\'s what that looks like day by day &mdash; you may recognize it.',
        ),
        image(
          asset('5-2-how-it-went-by-thursday.jpg'),
          'How it went by Thursday. A printed patient list with a coffee ring, half under a keyboard on a front-desk workstation. Monday: printed the list. Tuesday: twenty calls. Wednesday: six calls. Thursday: under the keyboard. The list was fine. Nothing carried it to Friday.',
        ),
        p(
          '<strong>Monday</strong> the list gets printed. <strong>Tuesday</strong> someone makes twenty calls between patients; three go badly and stick. <strong>Wednesday</strong> it\'s six calls, and nobody\'s sure who was already reached. <strong>Thursday</strong> the list is under the keyboard, and by the next week it\'s in a drawer.',
        ),
        darkPanel([
          'Nothing about that is a people problem. Three things were missing: the words to say, a queue that decides who\'s next, and a record of what happened on every call.',
          'Put those three in place and Tuesday\'s twenty calls happen on Thursday, and the Thursday after that.',
        ]),
        cta('Want to see what Tuesday looks like with all three in place?'),
        finePrint(),
        signoff(),
      ]),
      'Monday the list got printed. Thursday it was under the keyboard. Here\u2019s what happened in between.',
    ),
  },
  {
    id: 'same-list-different-test',
    audience: 'chiropractic',
    name: 'Email 5.3 — Same List, Different Test',
    subject: 'Same list. Different test.',
    previewText:
      'The attempt that fizzled didn\u2019t test your patients. It tested whether calls happen without a system.',
    angle:
      'Day 5, email 3. Closes the day by naming the obstacle: after a failed attempt the list gets blamed ("our patients don\'t respond"), and that verdict keeps the office from ever trying again. Reframe: retest the same list with a system.',
    html: wrap(
      compose([
        h1('Same list. Different test.'),
        greet,
        p(
          'The last two emails were about the attempt that fizzled. Here\'s the part that does the real damage &mdash; and it happens after the calls stop.',
        ),
        p(
          'Somebody draws a conclusion: <strong>&ldquo;Our patients just don\'t respond to that.&rdquo;</strong> It sounds like a finding. It becomes the reason nobody suggests trying again. And it\'s the wrong conclusion, because the test never measured your patients. It measured whether calls keep happening when nobody has the words, the queue, or the record.',
        ),
        image(
          asset('5-3-same-list-different-test.jpg'),
          'Same list. Different test. A stack of plain patient folders beside a tablet showing a call queue on a chiropractic front desk. What changes the second time: the words are on the screen; a queue picks the next name; every call is recorded. The first attempt tested your patients. The second one tests the system.',
        ),
        p(
          'The list that fizzled is the same list that will work. What changes the second time isn\'t the patients. It\'s what\'s on the screen when your team picks up the phone.',
        ),
        cta('Bring the list you already tried. We\'ll show you the second test:'),
        finePrint(),
        signoff(),
      ]),
      'The attempt that fizzled didn\u2019t test your patients. It tested whether calls happen without a system.',
    ),
  },
  {
    id: 'no-time',
    audience: 'chiropractic',
    name: 'Email 6.1 — \u201CMy Team Has No Time\u201D',
    subject: 'This takes 45 minutes a day, not a new hire',
    previewText:
      'Nobody has a spare eight hours. Fortunately, this does not need one.',
    angle:
      'Day 6, email 1. Handles the time/capacity objection with a small, concrete daily commitment instead of a vague program.',
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
    id: 'where-the-45-minutes-hides',
    audience: 'chiropractic',
    name: 'Email 6.2 — Where the 45 Minutes Is Hiding',
    subject: 'Where the 45 minutes is hiding',
    previewText:
      'Nobody has a free hour. Every front desk has three slow stretches. That\u2019s where the calls live.',
    angle:
      'Day 6, email 2. Makes 6.1 concrete: the 45 minutes isn\'t a block on the calendar, it\'s three natural gaps in a front-desk day, five calls each, with the queue already showing who\'s next when the gap opens.',
    html: wrap(
      compose([
        h1('Where the 45 minutes is hiding'),
        greet,
        p(
          'In the last email I said this takes about 45 minutes a day. Nobody has a free 45 minutes, so here\'s where it actually comes from &mdash; three stretches every front desk already has:',
        ),
        image(
          asset('6-2-where-the-45-minutes-hides.jpg'),
          'Where the 45 minutes is hiding. A front-desk day from 8 AM to 6 PM with three short teal windows between patient blocks: mid-morning, after lunch, and before close, five calls each. Fifteen calls a day, and nobody stopped doing their job.',
        ),
        steps([
          [
            'Mid-morning, after the first rush.',
            'The early patients are in rooms and the phone has gone quiet. Five calls.',
          ],
          [
            'Right after lunch.',
            'The afternoon hasn\'t filled the lobby yet. Five more.',
          ],
          [
            'The last half hour before close.',
            'Checkouts are done and tomorrow is already built. The final five.',
          ],
        ]),
        p(
          'Fifteen calls, and nobody stopped doing their job to make them. The part that makes this work is what happens when the gap opens: <strong>the screen already shows who\'s next.</strong> No list to find, no deciding, no setup. Pick up the phone, read, tap, done.',
        ),
        cta('Tell us how your day runs and we\'ll show you where the three gaps are:'),
        finePrint(),
        signoff(),
      ]),
      'Nobody has a free hour. Every front desk has three slow stretches. That\u2019s where the calls live.',
    ),
  },
  {
    id: 'no-time-means-no-slot',
    audience: 'chiropractic',
    name: 'Email 6.3 — \u201CNo Time\u201D Means \u201CNo Slot\u201D',
    subject: 'When \u201Cno time\u201D really means \u201Cno slot\u201D',
    previewText:
      'Things with a time on the schedule get done. Things that happen \u201Cwhen you can\u201D never do.',
    angle:
      'Day 6, email 3. Closes the day by naming the obstacle behind "my team has no time": the work has no appointment. Anything scheduled for "when you get a chance" loses to everything that has a slot. The queue gives the calls one.',
    html: wrap(
      compose([
        h1('When &ldquo;no time&rdquo; really means &ldquo;no slot&rdquo;'),
        greet,
        p(
          'Two emails about time. One more, because &ldquo;my team has no time&rdquo; usually means something else.',
        ),
        p(
          'Your front desk finds time for everything that has a slot. A patient at 2:15 gets seen at 2:15. Insurance gets verified because a visit depends on it. <strong>The work that never gets done is the work that happens &ldquo;when you get a chance&rdquo;</strong> &mdash; and reactivation calls have lived in that category in every office that tried them without a system.',
        ),
        image(
          asset('6-3-no-time-means-no-slot.jpg'),
          'No time usually means no slot. A front-desk monitor shows a daily schedule of appointment blocks with one teal block among them. Give the calls a slot: same time every day; a set number of calls; done by close. Work with a slot gets done. Work without one waits forever.',
        ),
        panel([
          'The fix isn\'t more time. It\'s a slot. The queue puts a specific number of calls on the screen every day, and they sit there the way a 2:15 appointment sits there &mdash; visible, finite, and done by close.',
        ]),
        p('That\'s the whole difference between a good intention and a habit.'),
        cta('Book a call and we\'ll size the daily slot to your front desk:'),
        finePrint(),
        signoff(),
      ]),
      'Things with a time on the schedule get done. Things that happen \u201Cwhen you can\u201D never do.',
    ),
  },
  {
    id: 'why-not-text',
    audience: 'chiropractic',
    name: 'Email 7.1 — \u201CCan\u2019t We Just Text Them?\u201D',
    subject: "Can't we just text our old patients?",
    previewText:
      'A text can remind someone of a decision they already made. It cannot restart care that stopped.',
    angle:
      'Day 7, email 1. The shortcut objection. A blast is easy, which is why it feels like the answer — but reactivation is a conversation, and a text can\'t have one.',
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
    id: 'the-pause-a-text-cant-hear',
    audience: 'chiropractic',
    name: 'Email 7.2 — The Pause a Text Can\u2019t Hear',
    subject: 'The pause a text can\u2019t hear',
    previewText:
      'A text gets \u201Cok thanks.\u201D A call hears \u201Cwell, it\u2019s been kind of okay.\u201D The appointment is in that pause.',
    angle:
      'Day 7, email 2. Makes 7.1 concrete with the exact moment a call catches and a text misses: the hesitation in "kind of okay," which is where the concern lives and where the script goes next.',
    html: wrap(
      compose([
        h1('The pause a text can\'t hear'),
        greet,
        p('In the last email I said a text can\'t listen. Here\'s the exact moment that matters.'),
        p(
          'Your team asks how they\'ve been since they finished care. The patient says, <strong>&ldquo;Oh, you know &mdash; it\'s been kind of okay.&rdquo;</strong> There\'s a half-second before &ldquo;okay.&rdquo; That half-second is the whole call. Your team hears it, taps what they heard, and the screen gives them the next question: what\'s been going on?',
        ),
        image(
          asset('7-2-the-pause-a-text-cant-hear.jpg'),
          'The pause a text can\'t hear. What a text gets: a reply that says ok thanks. What a call hears: well, it\'s been kind of okay. The appointment is in that pause.',
        ),
        p(
          'Send the same patient a text and you get one of two things: silence, or &ldquo;ok thanks.&rdquo; The hesitation never makes it into a reply. Nobody types &ldquo;kind of.&rdquo;',
        ),
        p('Reactivation lives in that pause. A call is the only channel that can hear it.'),
        cta('Want to hear how the script handles &ldquo;kind of okay&rdquo;? Let\'s talk:'),
        finePrint(),
        signoff(),
      ]),
      'A text gets "ok thanks." A call hears "well, it\u2019s been kind of okay." The appointment is in that pause.',
    ),
  },
  {
    id: 'easiest-to-send-easiest-to-ignore',
    audience: 'chiropractic',
    name: 'Email 7.3 — Easiest to Send, Easiest to Ignore',
    subject: 'Why texting keeps winning anyway',
    previewText:
      'A text blast is the easiest thing for the office to send. That\u2019s exactly why it\u2019s the easiest thing for the patient to ignore.',
    angle:
      'Day 7, email 3. Closes the day by naming the obstacle: offices pick the channel that\'s easiest for the office, not the one that works on the patient. The program makes the call nearly as easy as the text, so the easy choice and the right choice are the same.',
    html: wrap(
      compose([
        h1('Why texting keeps winning anyway'),
        greet,
        p(
          'Two emails on texting versus calling, and if you\'re still tempted by the blast, I understand why. It isn\'t that texts work better. <strong>It\'s that they\'re easier for the office.</strong> One message, one button, done by 9:05.',
        ),
        p(
          'Here\'s the trade you\'re making: the easiest thing to send is also the easiest thing to ignore. The call works because it costs something &mdash; a person, a few minutes, their name spoken out loud &mdash; and the patient can feel that.',
        ),
        image(
          asset('7-3-easiest-to-send-easiest-to-ignore.jpg'),
          'Why texting keeps winning anyway. A front-desk team member lifts the desk phone while a smartphone lies face-down beside it. Make the call as easy as the text: the queue picks the name; the script is on the screen; one tap logs the outcome. The easiest thing to send is the easiest thing to ignore.',
        ),
        p(
          'So the job isn\'t to talk your team out of the easy option. It\'s to make the right option nearly as easy: the queue picks the name, the script is on the screen, the outcome is logged with a tap. When the call takes three minutes and no thought, the blast stops looking like a shortcut.',
        ),
        cta('Book a call and we\'ll show you the three-minute version:'),
        finePrint(),
        signoff(),
      ]),
      'A text blast is the easiest thing for the office to send. That\u2019s exactly why it\u2019s the easiest thing for the patient to ignore.',
    ),
  },
  {
    id: 'voicemail-not-a-no',
    audience: 'chiropractic',
    name: 'Email 8.1 — A Voicemail Is Not a No',
    subject: 'A voicemail is not a no',
    previewText:
      'Reactivation doesn\'t fail on the phone. It fails in the gap after the first unanswered call.',
    angle:
      'Day 8, email 1. Persistence as the mechanic. Owners read voicemail as rejection and quit; the system treats it as a scheduling event and keeps the patient in rotation without anyone tracking it.',
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
    id: 'never-the-same-hour-twice',
    audience: 'chiropractic',
    name: 'Email 8.2 — Never the Same Hour Twice',
    subject: 'Never the same hour twice',
    previewText:
      'The fourth attempt works because it isn\u2019t the first attempt repeated. Different day, different hour, spaced far enough apart to feel like care.',
    angle:
      'Day 8, email 2. Makes 8.1 concrete: what actually changes between attempts. The queue moves each retry to a different time of day and a different day of the week, and tells the caller which window to use, so a patient who never answers at 10 AM gets found at 4:30.',
    html: wrap(
      compose([
        h1('Never the same hour twice'),
        greet,
        p(
          'The last email said a voicemail is not a no. Here\'s what makes the fourth attempt different from the first &mdash; because if it were the same call at the same hour, it wouldn\'t be.',
        ),
        image(
          asset('8-2-never-the-same-hour-twice.jpg'),
          'Never the same hour twice. A four-week calendar with four attempts on different days at different times: Tuesday 10 AM, Monday 4:30 PM, Thursday 1 PM, and Wednesday 9:30 AM marked answered. The screen picks the window: morning, midday, or afternoon. Different day, different hour, and nobody had to remember.',
        ),
        p(
          'When a call goes unanswered, the queue doesn\'t just bring the name back. It brings it back <strong>on a different day of the week, at a different time of day</strong> &mdash; and it tells your team which window to use: morning, midday, or afternoon. Someone who never picks up at 10 AM because they\'re at work answers at 4:30 in the car.',
        ),
        p(
          'The spacing is four to seven days, far enough apart that the patient never feels chased. Nobody on your team tracks any of it. The name just shows up when it\'s time, with the window on the screen.',
        ),
        cta('We\'ll show you what a retry looks like on your team\'s screen:'),
        finePrint(),
        signoff(),
      ]),
      'The fourth attempt works because it isn\u2019t the first attempt repeated. Different day, different hour, spaced far enough apart to feel like care.',
    ),
  },
  {
    id: 'one-pass-is-not-a-campaign',
    audience: 'chiropractic',
    name: 'Email 8.3 — One Pass Is Not a Campaign',
    subject: 'One pass through the list is not a campaign',
    previewText:
      '\u201CWe called everyone once\u201D is where most offices stop. The appointments are in passes two through seven.',
    angle:
      'Day 8, email 3. Closes the day by naming the obstacle: offices measure the first pass through the list, conclude it didn\'t work, and stop before the attempts that actually book. The system makes passes two through seven automatic.',
    html: wrap(
      compose([
        h1('One pass is not a campaign'),
        greet,
        p(
          'Two emails ago I said a voicemail isn\'t a no. The bigger mistake happens later, after the whole list has been called once.',
        ),
        p(
          '&ldquo;We called everyone&rdquo; feels like a finish line. It isn\'t. It means every name got one attempt, at one hour, on one day &mdash; and most of them didn\'t pick up, because most people don\'t pick up the first time, no matter who\'s calling. <strong>The appointments are in the attempts nobody makes.</strong>',
        ),
        image(
          asset('8-3-one-pass-is-not-a-campaign.jpg'),
          'One pass is not a campaign. Seven attempt markers in a row: the first three unanswered, the fourth marked booked, three more still to come. Under the first one: where most offices stop. The appointments are in the attempts nobody makes.',
        ),
        p(
          'No front desk will run a second, third and fourth pass by hand. That isn\'t a discipline problem; it\'s a memory problem, and memory is what a system is for. The queue keeps every name in rotation until it\'s answered, and your team just works the screen.',
        ),
        cta('Let\'s look at how many names on your list have only ever had one attempt:'),
        finePrint(),
        signoff(),
      ]),
      '"We called everyone once" is where most offices stop. The appointments are in passes two through seven.',
    ),
  },
  {
    id: 'empty-chair',
    audience: 'chiropractic',
    name: 'Email 9.1 — The Cost of an Empty Slot',
    subject: 'Every hole in tomorrow\u2019s schedule is a bill you already paid',
    previewText:
      'Rent, payroll, and equipment cost the same whether that chair is full or empty.',
    angle:
      'Day 9, email 1. Fixed-cost / opportunity-cost framing. Reframes open appointment slots as money already spent and lost.',
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
    id: 'fill-it-once',
    audience: 'chiropractic',
    name: 'Email 9.2 — Fill It Once, It Stays Filled',
    subject: 'Fill it once. It stays filled.',
    previewText:
      'An empty slot isn\u2019t a one-time loss. The same Tuesday at 2:00 is empty next week too, unless the right patient is in it.',
    angle:
      'Day 9, email 2. Makes 9.1 concrete: an empty slot recurs week after week, and a reactivated patient on a plan of care fills the same slot for the length of the plan, not once.',
    html: wrap(
      compose([
        h1('Fill it once. It stays filled.'),
        greet,
        p(
          'In the last email I said an empty slot absorbs overhead. Here\'s the part that makes it worse, and the part that fixes it.',
        ),
        p(
          'An open slot is not a one-time loss. Tuesday at 2:00 was empty this week, and unless something changes, it\'s empty next Tuesday and the one after. <strong>The gap repeats.</strong> That\'s what makes it expensive &mdash; not one missed visit, but the same missed visit every week.',
        ),
        image(
          asset('9-2-fill-it-once.jpg'),
          'Fill it once. It stays filled. A six-week schedule grid where the Tuesday 2:00 slot is filled and checked in every week. A patient on a plan of care fills the same slot for weeks.',
        ),
        p(
          'Now look at what fills it. A stranger from an ad books one visit and may or may not come back. A reactivated patient who needs a plan of care takes Tuesday at 2:00 for the length of the plan. One call, one conversation, and the slot stops being a gap.',
        ),
        p('That\'s why the list is the right place to fill holes from. It doesn\'t just fill the slot. It keeps it filled.'),
        cta('Let\'s look at where your recurring gaps are and who on your list fits them:'),
        finePrint(),
        signoff(),
      ]),
      'An empty slot isn\u2019t a one-time loss. The same Tuesday at 2:00 is empty next week too, unless the right patient is in it.',
    ),
  },
  {
    id: 'the-reflex-is-to-spend',
    audience: 'chiropractic',
    name: 'Email 9.3 — When the Schedule Thins, the Reflex Is to Spend',
    subject: 'When the schedule thins, the reflex is to spend',
    previewText:
      'Boost a post. Run a special. Wait it out. The list should be the first call, not the last resort.',
    angle:
      'Day 9, email 3. Closes the day by naming the obstacle: when the schedule dips, the trained reflex is to buy attention from strangers. The list is the cheapest fill and the last one offices think of, because spending has a button and calling never did.',
    html: wrap(
      compose([
        h1('When the schedule thins, the reflex is to spend'),
        greet,
        p('Two emails on empty slots. One more, about what most offices do when they see them.'),
        p(
          'The schedule looks thin for next week, and the reflex kicks in: boost a post, run a new-patient special, call the agency. Or the other reflex &mdash; wait it out and hope. <strong>The list is rarely the first move,</strong> even though it\'s the only option full of people who already said yes.',
        ),
        image(
          asset('9-3-the-reflex-is-to-spend.jpg'),
          'When the schedule thins, the reflex is to spend. A practice owner studies a thin weekly calendar on his laptop. The reflex: boost a post, run a special, wait it out. The list: call the people who already said yes. Your list should be the first call, not the last resort.',
        ),
        p(
          'That\'s not because the list is a bad option. It\'s because spending is a habit and calling isn\'t. There\'s a button for one and, until now, nothing for the other.',
        ),
        p(
          'Reactivation Power is the button. When the schedule dips, the queue is already there &mdash; names, script, and a record of who\'s been called &mdash; and the first move becomes the cheapest one.',
        ),
        cta('Book a call and we\'ll show you what the first move looks like on the screen:'),
        finePrint(),
        signoff(),
      ]),
      'Boost a post. Run a special. Wait it out. The list should be the first call, not the last resort.',
    ),
  },
  {
    id: 'one-list-many-programs',
    audience: 'chiropractic',
    name: 'Email 10.1 — One List, Every Program',
    subject: 'One patient list. Every service you offer.',
    previewText:
      'Your decompression patients and your aesthetics patients need different conversations. Both should come from the same list.',
    angle:
      'Day 10, email 1. Multi-niche capability. The same list serves every service line, each with its own tailored script.',
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
    id: 'same-opener-different-middle',
    audience: 'chiropractic',
    name: 'Email 10.2 — Same Opener, Different Middle',
    subject: 'Same opener. Different middle.',
    previewText:
      'What actually changes between a decompression script and a red light script, and why it decides whether the appointment gets booked.',
    angle:
      'Day 10, email 2. Makes 10.1 concrete: the scripts share the same friendly opener, but the questions in the middle and the recommendation at the end are written for what that patient came in for.',
    html: wrap(
      compose([
        h1('Same opener. Different middle.'),
        greet,
        p(
          'In the last email I said every service line gets its own script. Here\'s what actually changes between them &mdash; because it isn\'t the hello.',
        ),
        image(
          asset('10-2-same-opener-different-middle.jpg'),
          'Same opener. Different middle. Three script cards side by side, chiropractic, weight loss, and red light. The opener row is identical in all three; the questions and close rows are different in each. One list, and the right words for every name on it.',
        ),
        checks([
          '<strong>The opener is the same.</strong> A warm check-in from an office they know. Nothing about it needs to change from one patient to the next.',
          '<strong>The questions in the middle are different.</strong> A decompression patient is asked about the back that brought them in. A weight loss patient is asked how things have held since the program. A red light patient gets a gentler question, written so nobody feels judged.',
          '<strong>The recommendation is different.</strong> It names what they came in for and what you\'d like to help with now &mdash; in their words, not a generic pitch.',
        ]),
        p(
          'The middle is where appointments are won or lost, and it\'s exactly the part a one-size script leaves your team to improvise. Here, it\'s written.',
        ),
        cta('Tell us your service lines and we\'ll show you the middle of each one:'),
        finePrint(),
        signoff(),
      ]),
      'What actually changes between a decompression script and a red light script, and why it decides whether the appointment gets booked.',
    ),
  },
  {
    id: 'dont-sort-the-list-first',
    audience: 'chiropractic',
    name: 'Email 10.3 — You Don\u2019t Have to Sort the List First',
    subject: 'You don\u2019t have to sort the list first',
    previewText:
      'The reason multi-service offices never import the whole list: sorting a thousand files by service feels like the first job. It isn\u2019t.',
    angle:
      'Day 10, email 3. Closes the day by naming the obstacle: owners assume they need to separate the list by service before they can start, so they import one slice or nothing. The import reads the service column the software already exports and matches each patient to the right script.',
    html: wrap(
      compose([
        h1('You don\'t have to sort the list first'),
        greet,
        p(
          'Two emails ago I said one list can serve every program. Here\'s the thing that stops offices from importing the whole list.',
        ),
        p(
          'They picture the first job as sorting: pulling the decompression patients out, then the weight loss patients, then the aesthetics patients, each into its own campaign. <strong>That job never gets done, so the list goes in as one slice &mdash; or doesn\'t go in at all.</strong>',
        ),
        image(
          asset('10-3-dont-sort-the-list-first.jpg'),
          'You don\'t have to sort the list first. A spreadsheet column labeled last service, with rows for chiropractic, decompression, red light, softwave, weight loss and massage, each matched by an arrow to its script. The import reads the column your software already exports.',
          360,
        ),
        p(
          'There is no sorting step. Your software already exports a column for the last service or treatment category. The import reads it, matches each patient to the right script, and puts them all in one queue. Your team works straight down the list and the correct words come up for every name.',
        ),
        cta('Book a call and bring a sample export &mdash; we\'ll show you how it lands:'),
        finePrint(),
        signoff(),
      ]),
      'The reason multi-service offices never import the whole list: sorting a thousand files by service feels like the first job. It isn\u2019t.',
    ),
  },
  {
    id: 'they-dont-know',
    audience: 'chiropractic',
    name: 'Email 11.1 — They Don\u2019t Know What You Offer Now',
    subject: 'Your patients still picture the practice you were three years ago',
    previewText:
      'New equipment, new services, new programs — and the people most likely to want them have no idea.',
    angle:
      'Day 11, email 1. New-service awareness gap. Past patients hold an outdated picture of the practice.',
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
    id: 'every-new-service-has-an-audience',
    audience: 'chiropractic',
    name: 'Email 11.2 — Every New Service Already Has an Audience',
    subject: 'Every new service already has an audience',
    previewText:
      'When you add decompression, the first people to hear about it should be the back-pain patients already in your files.',
    angle:
      'Day 11, email 2. Makes 11.1 concrete: the inactive list is a pre-qualified launch list for any new service, sorted by the condition that brought each patient in, and the import routes them to that service\'s script.',
    html: wrap(
      compose([
        h1('Every new service already has an audience'),
        greet,
        p(
          'In the last email I said your patients still picture the practice you were years ago. Here\'s what that means for every new service you add.',
        ),
        p(
          'When you bring in decompression, the first hundred people who should hear about it are not strangers in a feed. They\'re the patients in your files who came to you with the back pain it\'s for. <strong>They already trust you, you already know their history, and nobody has to be sold on who you are.</strong>',
        ),
        image(
          asset('11-2-every-new-service-has-an-audience.jpg'),
          'Every new service already has an audience. A new service flows to your back-pain files, and those patients are the first to hear about it, not a stranger in a feed. The warmest launch list you will ever have is already in your software.',
        ),
        p(
          'That\'s what the import does with them. Tag those files to the decompression script and they go into the queue with the right conversation attached &mdash; a check-in from their office that happens to have something new for exactly what they came in for.',
        ),
        p('Every service you\'ve added since they were last in has a list like that waiting in your software.'),
        cta('Tell us what you\'ve added and we\'ll find its audience in your files:'),
        finePrint(),
        signoff(),
      ]),
      'When you add decompression, the first people to hear about it should be the back-pain patients already in your files.',
    ),
  },
  {
    id: 'a-sign-reaches-the-lobby',
    audience: 'chiropractic',
    name: 'Email 11.3 — A Sign in the Lobby Reaches the Lobby',
    subject: 'A sign in the lobby reaches the lobby',
    previewText:
      'Offices assume the awareness gap closes on its own. The people with the gap are the ones who never walk past the sign.',
    angle:
      'Day 11, email 3. Closes the day by naming the obstacle: owners assume lapsed patients will find out about new services through the sign, the newsletter, or social. Every one of those channels only reaches people who are already engaged. The call is the one that goes to them.',
    html: wrap(
      compose([
        h1('A sign in the lobby reaches the lobby'),
        greet,
        p('Two emails on the awareness gap. One more, about how offices assume it closes on its own.'),
        p(
          'The new service gets a banner in the waiting room, a line in the newsletter, a post on the page. All of that reaches the same people: <strong>the ones already coming in.</strong> The patient who hasn\'t been in for two years never walks past the banner, stopped opening the newsletter, and was never following the page.',
        ),
        image(
          asset('11-3-a-sign-reaches-the-lobby.jpg'),
          'A sign in the lobby reaches the lobby. A new decompression table in a bright treatment room with a small new tag on it. Who sees the new sign: patients already in the building, people who still open the newsletter, people who follow the page. Who doesn\'t: the ones who haven\'t been in. The only channel that reaches a lapsed patient is the one that goes to them.',
        ),
        p(
          'Every passive channel reaches the engaged. The gap lives with the disengaged, and the only channel that goes to them is the one where someone from your office picks up the phone and says their name.',
        ),
        cta('Book a call and we\'ll map your newer services against the patients who never saw the sign:'),
        finePrint(),
        signoff(),
      ]),
      'Offices assume the awareness gap closes on its own. The people with the gap are the ones who never walk past the sign.',
    ),
  },
  {
    id: 'why-they-left',
    audience: 'chiropractic',
    name: 'Email 12.1 — They Didn\u2019t Leave Because of You',
    subject: "They didn't leave because they were unhappy",
    previewText:
      'Almost nobody stops care because of the practice. They stop because life got loud.',
    angle:
      'Day 12, email 1. Removes the owner\'s fear that reaching out is unwelcome. Patients lapse from life circumstances, not dissatisfaction.',
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
    id: 'the-call-never-asks-why',
    audience: 'chiropractic',
    name: 'Email 12.2 — The Call Never Asks Why They Left',
    subject: 'The call never asks why they left',
    previewText:
      'No \u201Cwe noticed you haven\u2019t been in.\u201D The opener asks how they\u2019ve been, and the awkwardness they were carrying disappears.',
    angle:
      'Day 12, email 2. Makes 12.1 concrete: the awkwardness lives on the patient\'s side, so the script is built to remove it. The opener asks how they\'ve been feeling since they finished care and never asks why they stopped.',
    html: wrap(
      compose([
        h1('The call never asks why they left'),
        greet,
        p(
          'In the last email I said your patients didn\'t leave because of you. Here\'s how the call is built around that.',
        ),
        p(
          'The awkwardness of a long gap sits with the patient, not with you. Which means the worst thing the call can do is point at the gap. <strong>So the script never does.</strong> There\'s no &ldquo;we noticed you haven\'t been in&rdquo; and no &ldquo;what happened?&rdquo;',
        ),
        image(
          asset('12-2-the-call-never-asks-why.jpg'),
          'The call never asks why they left. Not this: we noticed you haven\'t been in for a while. This: how have you been feeling since you finished your care with us? No guilt in the opener, so there is nothing to feel awkward about.',
        ),
        p(
          'The first line is a question about them: how have you been feeling since you finished your care with us? It gives them something easy to answer, it treats the gap as nothing, and it lets them tell you about the back that\'s been acting up without having to explain the two years first.',
        ),
        p(
          'That one design choice is why these calls land warm. The patient was braced for a guilt trip and got a check-in instead.',
        ),
        cta('Hear the opener read out loud on a call with us:'),
        finePrint(),
        signoff(),
      ]),
      'No "we noticed you haven\u2019t been in." The opener asks how they\u2019ve been, and the awkwardness they were carrying disappears.',
    ),
  },
  {
    id: 'the-worst-call-is-a-pleasant-one',
    audience: 'chiropractic',
    name: 'Email 12.3 — The Worst Call on the List Is a Pleasant One',
    subject: 'The worst call on the list is a pleasant one',
    previewText:
      'The fear is that a bad call damages the relationship. The script is built so the worst case is a friendly thirty seconds.',
    angle:
      'Day 12, email 3. Closes the day by naming the obstacle: owners fear a reactivation call could sour a relationship that\'s merely dormant. With the script, the downside is bounded: a patient who\'s fine gets a warm goodbye and a gentle check-in months later.',
    html: wrap(
      compose([
        h1('The worst call on the list is a pleasant one'),
        greet,
        p('Two emails on why patients lapse. One more, about the fear that keeps the calls from happening.'),
        p(
          'It sounds like this: <strong>&ldquo;What if the call annoys them and we lose them for good?&rdquo;</strong> It\'s a reasonable fear when the call is improvised. It isn\'t when the call is written.',
        ),
        image(
          asset('12-3-the-worst-call-is-a-pleasant-one.jpg'),
          'The worst call on the list is a pleasant one. A woman at home in her kitchen smiles while talking on the phone. The worst case: a friendly thirty seconds, a warm goodbye, a light check-in in a few months. Nothing gets burned. The downside is bounded.',
        ),
        p(
          'Here\'s the worst case with the script. The patient says they\'re doing great and don\'t need anything. Your team says that\'s wonderful to hear, thanks them for their time, and hangs up. Thirty seconds, no pitch, no pressure. The system notes it and brings the name back for a light check-in a few months from now.',
        ),
        p(
          'Nothing got burned. A patient who was dormant is still dormant &mdash; and now they\'ve heard from you, kindly, once. The downside is bounded. The upside is the plan of care they book instead.',
        ),
        cta('Let\'s talk through what your team says when the answer is &ldquo;I\'m fine&rdquo;:'),
        finePrint(),
        signoff(),
      ]),
      'The fear is that a bad call damages the relationship. The script is built so the worst case is a friendly thirty seconds.',
    ),
  },
  {
    id: 'lifetime-value',
    audience: 'chiropractic',
    name: 'Email 13.1 — One Patient Is Never Just One Visit',
    subject: 'One reactivated patient is rarely one appointment',
    previewText:
      'A returning patient brings a plan of care, future visits, and the people they talk to.',
    angle:
      'Day 13, email 1. Lifetime value and referral compounding. The true return is much larger than a single appointment.',
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
    id: 'what-one-call-restarts',
    audience: 'chiropractic',
    name: 'Email 13.2 — What One Call Actually Restarts',
    subject: 'What one call actually restarts',
    previewText:
      'A plan of care, a household, and a referral source. The calculator only counted the first one.',
    angle:
      'Day 13, email 2. Makes 13.1 concrete: the three things a single reactivated patient brings back, and the fact that the revenue calculator only counts the first.',
    html: wrap(
      compose([
        h1('What one call actually restarts'),
        greet,
        p(
          'In the last email I said one patient is never just one visit. Here\'s the full list of what a single call restarts &mdash; and notice how little of it the arithmetic counted.',
        ),
        image(
          asset('13-2-what-one-call-restarts.jpg'),
          'What one call actually restarts. One phone call fans out to three things: their plan of care, which the calculator counts; their household, which it doesn\'t; and their referrals, which it doesn\'t. The calculator counts the visit. The visit is the smallest part.',
        ),
        checks([
          '<strong>Their plan of care.</strong> The thing they came back for, over weeks, not once. This is the only line the calculator counts.',
          '<strong>Their household.</strong> The spouse with the neck thing, the kid who plays a sport, the parent who\'s slowing down. Same address, same trust, none of them on any list.',
          '<strong>Their referrals.</strong> Active patients talk about you. Inactive ones don\'t. Every month they stayed away, whoever they would have sent stayed away too.',
        ]),
        p(
          'When we showed the math earlier in these emails, it stopped at the first line. That was deliberate &mdash; it\'s the only line you can count in advance. But it\'s the smallest of the three.',
        ),
        cta('Book a call and we\'ll walk through all three against your actual list:'),
        finePrint(),
        signoff(),
      ]),
      'A plan of care, a household, and a referral source. The calculator only counted the first one.',
    ),
  },
  {
    id: 'no-cheaper-month-to-start',
    audience: 'chiropractic',
    name: 'Email 13.3 — There Is No Cheaper Month to Start',
    subject: 'There is no cheaper month to start',
    previewText:
      '\u201CWe\u2019ll do it when things slow down.\u201D Every month a patient stays inactive, the plan of care, the household, and the referrals stay inactive too.',
    angle:
      'Day 13, email 3. Closes the day by naming the obstacle: waiting for a slow season. Because the return compounds (plan of care, household, referrals), delay is the one cost that grows every month, and there is never a cheaper month than the current one.',
    html: wrap(
      compose([
        h1('There is no cheaper month to start'),
        greet,
        p('Two emails on what a returning patient is worth. One more, about when to start.'),
        p(
          'The most common plan we hear is a good one on paper: <strong>&ldquo;We\'ll get to the list when things slow down.&rdquo;</strong> The problem is what the last email showed. A returning patient isn\'t one visit; it\'s a plan of care, a household, and a referral source. All three start the month the call happens, and none of them start until it does.',
        ),
        image(
          asset('13-3-no-cheaper-month-to-start.jpg'),
          'There is no cheaper month to start. A blank desk calendar beside a stack of patient folders. Every month they stay inactive: the plan of care doesn\'t start, the household doesn\'t come in, the referral never happens. Waiting doesn\'t hold the cost. It stacks it.',
        ),
        p(
          'So waiting doesn\'t hold the cost still. It stacks it. The plan of care that would have started this month starts three months later, and the referral that patient would have made by then never happens at all.',
        ),
        p(
          'There isn\'t a slow month coming that makes this cheaper. The queue takes 45 minutes a day whenever you start, and the list is worth the most right now.',
        ),
        cta('Pick a time and we\'ll build the first week around your schedule as it is:'),
        finePrint(),
        signoff(),
      ]),
      '"We\u2019ll do it when things slow down." Every month a patient stays inactive, the plan of care, the household, and the referrals stay inactive too.',
    ),
  },
  {
    id: 'know-your-numbers',
    audience: 'chiropractic',
    name: 'Email 14.1 — See the Numbers',
    subject: "If you can't see the numbers, you can't grow them",
    previewText:
      'Calls made, contacts reached, appointments booked, revenue recovered. Visible without asking anyone.',
    angle:
      'Day 14, email 1. Accountability and visibility. Turns a vague activity into a measurable operation with a dashboard.',
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
    id: 'three-numbers-three-conversations',
    audience: 'chiropractic',
    name: 'Email 14.2 — Three Numbers, Three Conversations',
    subject: 'Three numbers, three conversations',
    previewText:
      'Calls made, reached but not booked, and booked. Each one tells you exactly which conversation to have on Monday.',
    angle:
      'Day 14, email 2. Makes 14.1 concrete: what an owner actually does with the dashboard. Each of the three core numbers points to a specific, short conversation with the team instead of a vague "how\'s it going."',
    html: wrap(
      compose([
        h1('Three numbers, three conversations'),
        greet,
        p(
          'In the last email I showed you the dashboard. Here\'s what to do with it on a Monday &mdash; because a number you don\'t act on is just decoration.',
        ),
        image(
          asset('14-2-three-numbers-three-conversations.jpg'),
          'Three numbers, three conversations. Calls made: is the slot being kept? Reached, not booked: which objection keeps coming up? Booked: who is converting? A number you can see is a conversation you can have.',
        ),
        steps([
          [
            'Calls made.',
            'If it\'s low, the slot isn\'t being kept. That\'s a scheduling conversation, not a motivation one.',
          ],
          [
            'Reached but not booked.',
            'The calls are happening and patients are answering, but the appointment isn\'t landing. Sit in on two calls, hear which objection keeps coming up, and walk through that one screen together.',
          ],
          [
            'Booked.',
            'Someone on your team is converting. Find out what they\'re doing, and give them more of the queue.',
          ],
        ]),
        p(
          'Each conversation takes about five minutes, because you\'re not asking how it\'s going. You already know. You\'re asking about one specific thing.',
        ),
        cta('We\'ll show you the dashboard with a week of real activity in it:'),
        finePrint(),
        signoff(),
      ]),
      'Calls made, reached but not booked, and booked. Each one tells you exactly which conversation to have on Monday.',
    ),
  },
  {
    id: 'the-feeling-gets-there-first',
    audience: 'chiropractic',
    name: 'Email 14.3 — The Feeling Gets There First',
    subject: 'The feeling that it isn\u2019t working shows up before the results do',
    previewText:
      'Voicemails arrive all at once. Appointments arrive spread out. Without the numbers, week three always feels like failure.',
    angle:
      'Day 14, email 3. Closes the day by naming the obstacle: programs don\'t get cancelled by numbers, they get cancelled by feelings, and the "not working" feeling reliably arrives before the results. The dashboard is what keeps a working program alive through week three.',
    html: wrap(
      compose([
        h1('The feeling gets there first'),
        greet,
        p('Two emails on the numbers. One more, about the feeling that gets there before them.'),
        p(
          'Here\'s the pattern in every reactivation effort that runs on gut feel. The voicemails arrive all at once &mdash; six in an afternoon. The appointments arrive spread out &mdash; one on Tuesday, one the following Monday. <strong>By week three the feeling says it isn\'t working,</strong> even when the count says it is.',
        ),
        image(
          asset('14-3-the-feeling-gets-there-first.jpg'),
          'The feeling gets there first. A six-week chart: the dashed line for how it feels drops to its low point at week three, while the solid line for what the numbers show rises steadily. Programs don\'t get cancelled by numbers. They get cancelled by feelings.',
        ),
        p(
          'Programs don\'t get cancelled by numbers. They get cancelled by feelings, and the feeling always shows up first. That\'s the real job of the dashboard: not to impress you, but to be the thing you look at in week three instead of your gut.',
        ),
        p('The office that makes it to month three is the one that could see the count in week three.'),
        cta('Book a call and we\'ll show you what week three looks like on the screen:'),
        finePrint(),
        signoff(),
      ]),
      'Voicemails arrive all at once. Appointments arrive spread out. Without the numbers, week three always feels like failure.',
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
          'If it only works when one person does it, it isn\'t a system. Two panels. When it lives in one person: an empty front-desk chair, a packed box, sticky notes on the monitor. The list was in her head, the words were hers alone, nobody knows who was called. When it lives in the system: a new team member on the phone at the same desk. The list is in the queue, the words are on the screen, every call is on record. The new hire picks up on Monday exactly where the last one left off.',
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
          'The asset is real. It\'s also perishable. Every month, a slice of the list quietly becomes unreachable. Five patient folders stand on a timeline from 8 months ago to 6 years ago, fading from solid to a dotted outline with a crossed-out phone. The first two are labeled still reachable, the last two going dark. A list is worth the most the day you decide to use it.',
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
          'Evening in a living room. A man sits on the edge of the sofa, one hand pressed to his lower back, holding up his phone to a map of search results with the top listing marked as an ad. Panel: the moment they decide. The pain comes back. They reach for their phone. Someone\'s name comes up first. When that moment arrives, whose name comes to mind?',
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
          'Your first 30 days. No six-month implementation; calls start the same week your list lands. Four photo panels in a row: Week 1, import your list. Week 1, train your team. Weeks 2 through 4, build the rhythm. Day 30, look at real numbers. No new hires. No hardware. Nothing to rip out.',
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
          'A chiropractor adjusts a patient on the treatment table, fully focused on them. Through the doorway behind, a front-desk team member in a headset works the call list at the reception computer. Panel: you treat patients, your team works the list. You never touch the queue. Your front desk owns the calls. You just see the numbers. If it needs you to run it, it won\'t last a month.',
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
          'A practice owner in a white clinic coat sits at her desk on a relaxed video call, pen in hand, a notepad with a few handwritten numbers beside a coffee mug and a small spine model. Panel: a straight read on your list. Too small to be worth it? We\'ll say so. The numbers work? We\'ll show you. Either way, you leave with a number. We\'d rather tell you no than waste your time.',
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
          'The services with the best margins need the warmest audience. Two panels. Selling to strangers, over a laptop showing an ad dashboard: trust built from zero, price objection arrives first, expensive clicks with uncertain intent. Offering to past patients, over a wellness room with a red light panel and body-composition scale: trust already established, they know your care is worth it, no acquisition cost. They\'ve already answered the hardest question: is this practice worth my money?',
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
          'Count how many patients it takes to pay for this. Not hundreds. Not dozens. Three cards in a row: Hundreds, contacted in a normal month. 1 to 3, covers the investment. Everything after, margin. Break-even: one to three patients. Everything after that is yours.',
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
          'A practice owner at his desk on a relaxed video call, headset on, coffee beside the laptop, a notepad with one number circled. Panel: what happens on the call. Three questions about your practice. One number: your break-even. A straight answer, either way. No pitch deck. Just your numbers.',
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
          'Three numbers turn a maybe into a decision. Bring these to the call; rough is fine. Three cards, Inactive Patients, Case Average and Who Calls, feed an arrow into a teal card labeled Your Break-Even with a calculator. Rough is fine. The call does the math.',
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
          'What your front desk actually says. Six steps, every word already on the screen. Over a front desk with a tablet showing the script: Opener, Their Concern, Making It Real, The Review, Recommendation, Objections. Nobody improvises. The next line is always on the screen.',
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
          'Same skill. Different list. Two panels showing the same front-desk team member at the same desk with the same smile. What she does now: answers when patients call in, books them into the schedule. What she does with the list: calls patients who already know her, books them into the schedule. The skill your team already has does the rest.',
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
          'The four words every caller dreads. A front-desk team member on the phone reaches for a tablet. Panel: what the patient says. Four tappable buttons: I need to think about it, highlighted in teal; Just send me some info; It\'s too expensive; I\'m considering another option. Tap it, the response appears. The stall is a button. The answer is already written.',
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
          'The list is never empty and never overwhelming. Two panels. The pile: a stressed team member beside a monitor of endless rows and a stack of printouts. 800 names, all at once. Nobody knows where to start, so nobody starts. The queue: a relaxed team member on the phone with a short list on screen. 7 calls due now. Work the seven, then done. 793 wait in reserve. Nobody can face 800. Everybody can make 7.',
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
          'What the call is not. Pick a time. Bring your skepticism. Four cards in a row. Three gray, each marked with an X: Pressure, A Countdown, Deciding on the Phone. One teal card with a check: A Number You Can Hold Us To. No pressure, no clock, no deciding on the phone. Just a number.',
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
          'A young associate chiropractor stands in a clean, quiet treatment room studying a mostly open schedule on a tablet, while shelves of patient folders fill the wall beside him. Panel: an empty schedule, a full filing cabinet. A new provider with open hours. Hundreds of files who already trust the practice. One phone call, not a campaign. The warmest patients for a new provider already know the practice.',
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
          'Every call ends one of three ways. What happens next is already decided. A phone icon labeled Every Call branches into three cards: Scheduled, on the books; Not Yet, back in 3 months; No Answer, retry in 4 to 7 days. Nothing falls through, because nothing lives in anyone\'s memory.',
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
          'A chiropractor leans on the reception counter asking a question; the front-desk team member pauses mid-shrug with a friendly, uncertain expression. Panel: a one-question test. How many patients haven\'t we seen in over a year? If the answer is a shrug, that\'s the whole point. One question tells you whether the list is being worked.',
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
          'The call has to come from your office. Two panels. A call center, rows of gray cubicles under fluorescent light: a stranger\'s voice, reading from a card, has never seen your office. Your front desk, a warm chiropractic reception with a team member on the phone: a name they recognize, knows the practice inside out, can book them on the spot. Trust doesn\'t transfer to a stranger.',
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
          'What month three looks like. The work per day doesn\'t grow; the results do. Three photo panels of the same front-desk team member: Month 1, first attempts. Month 2, follow-ups arrive. Month 3, the rhythm, with a patient checking in behind her. A teal line rises across the three. Month one is a project. Month three is a rhythm.',
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
          'A desk planner open on a wooden desk in morning light, one time slot circled in teal marker, a pen resting across the page. Panel: booking isn\'t a yes. 1, book the call. 2, hear your number. 3, then decide. Decide after the call, not before it.',
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
          'A front-desk team member in a headset mid-conversation, relaxed and smiling, a tablet propped on the desk showing a script with a few large buttons. Panel: sounds natural, isn\'t improvised. The screen keeps it on track. The caller keeps it human. The patient hears a conversation. Every line is written. None of it sounds read.',
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
          'Every reason not to book, answered. Bring yours; we\'ll answer it on the call. Six cards, each with a teal check: No Time, Tried It, They Moved On, Seems Desperate, Not Now, Will It Pay. Still on the fence? Every reason has an answer.',
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
          'Overhead view of a quiet morning desk: a coffee, a phone face-down, a pen, a blank notepad. Panel: the whole thing in four sentences. 1, your list is an asset. 2, your team can work it. 3, the system does the remembering. 4, one to three patients covers it. Four sentences. One call.',
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
          'What happens after you book. No surprises, just your numbers. Four photo panels in a row: 1, pick a time. 2, pull 3 numbers. 3, the call. 4, your break-even. Four steps. You already know what each one looks like.',
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
          'A bright chiropractic lobby, busy in a good way: patients of different ages checking in and waiting, the front desk in the middle of it, morning light through the windows. Panel: the whole case. The list is real. Your team can do it. The system remembers. The math is small. The list doesn\'t wait. A full schedule from a list you already own.',
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
