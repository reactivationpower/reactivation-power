export interface EmailTemplate {
  id: string
  name: string
  subject: string
  previewText: string
  angle: string
  html: string
}

// Shared placeholders the user swaps in GHL:
//   {{contact.first_name}}  — GHL merge tag, works as-is when pasted into GHL
//   [CALENDAR_LINK]         — replace with the booking-calendar URL
//   [LANDING_PAGE_URL]      — replace with the live landing page URL

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
          <td align="center" style="background-color:#ffffff;padding:28px 40px 24px 40px;border-bottom:3px solid #39889f;" class="inner">
            <img src="https://umbrella-bay.vercel.app/images/logo-slogan.png" alt="Reactivation Power — Turning old business into new business &amp; new money" width="240" style="width:240px;max-width:240px;height:auto;margin:0 auto;" />
          </td>
        </tr>`

const button = (label: string, href: string) => `            <table role="presentation" cellpadding="0" cellspacing="0" class="btn" style="margin:28px 0;">
              <tr>
                <td style="background-color:#39889f;border-radius:6px;">
                  <a href="${href}" style="display:inline-block;padding:14px 32px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;">${label}</a>
                </td>
              </tr>
            </table>`

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
                <td style="background-color:#f1f5f9;border-left:4px solid #39889f;padding:20px 24px;">
                  <p style="margin:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#1d293d;"><strong>Reactivating a past patient is 5&ndash;7x cheaper</strong> than acquiring a new one.</p>
                  <p style="margin:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#1d293d;"><strong>20&ndash;40% of inactive lists typically rebook</strong> when contacted the right way.</p>
                  <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#1d293d;"><strong>$0 in advertising required</strong> — the list is an asset you already own.</p>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#314158;">The Reactivation Power Program gives your front desk everything it needs to turn that list into booked appointments: word-for-word interactive call scripts (objections included), an organized call queue, and a dashboard that tracks every dollar recovered. No sales experience needed — the screen tells your team exactly what to say at every turn.</p>
            <p style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#314158;">See exactly how it works here:</p>
${button('See How It Works', '[LANDING_PAGE_URL]')}
            <p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#314158;">Prefer to talk it through? Grab a time that works for you and we'll walk you through what your list is realistically worth:</p>
            <p style="margin:0 0 32px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;"><a href="[CALENDAR_LINK]" style="color:#39889f;font-weight:bold;text-decoration:underline;">Book a quick call &rarr;</a></p>
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
            <p style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#314158;">The full breakdown — including what a typical inactive list is worth — is here:</p>
${button('See What Your List Is Worth', '[LANDING_PAGE_URL]')}
            <p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#314158;">Or skip straight to a conversation — we'll look at your patient list together and map out the opportunity:</p>
            <p style="margin:0 0 32px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;"><a href="[CALENDAR_LINK]" style="color:#39889f;font-weight:bold;text-decoration:underline;">Book a quick call &rarr;</a></p>
            <p style="margin:0 0 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#314158;">To your practice's growth,</p>
            <p style="margin:0 0 40px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#1d293d;"><strong>The Reactivation Power Team</strong></p>
          </td>
        </tr>`,
      'New services, same patients. The fastest way to fill your schedule is the list of people who already said yes to you once.',
    ),
  },
]
