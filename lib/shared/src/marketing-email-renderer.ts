import type { MarketingEmailCopy } from './marketing-email-content/types'

// All prospect-email call buttons use the approved, verified booking landing page.
export const MARKETING_LANDING_URL = 'https://patientpipeline.app/schedule-a-call'
export const MARKETING_LOGO_URL = 'https://reactivationpower.com/images/patient-pipeline-logo.png'
const FONT = 'Arial,Helvetica,sans-serif'
const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
const paragraph = (text: string) =>
  `<p style="margin:0 0 18px;font-family:${FONT};font-size:16px;line-height:26px;color:#314158;">${esc(text)}</p>`
const focusLabels = {
  reactivation: 'Reconnect with past patients',
  'lead-follow-up': 'Follow up with new inquiries',
  combined: 'Two workflows. One launch offer.',
} as const

/** Real text stays readable when inboxes block images. Keep retired graphics
 * hosted so previously sent/imported messages do not acquire broken images. */
function launchOffer() {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;background-color:#092a3b;">
<tr><td style="padding:22px 24px 12px;font-family:${FONT};">
<p style="margin:0 0 7px;color:#83ded2;font-size:12px;line-height:18px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;">The Patient Pipeline launch offer</p>
<h2 style="margin:0;color:#ffffff;font-size:21px;line-height:29px;">Reactivation + Lead Follow-Up.<br />Together at one launch price.</h2>
</td></tr>
<tr><td style="padding:0 24px 22px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td class="offer-col" width="50%" valign="top" style="padding:12px 14px 0 0;font-family:${FONT};color:#ffffff;font-size:14px;line-height:22px;"><strong>Reactivation</strong><br /><span style="color:#d5e4e9;">Guide your team’s conversations with inactive patients.</span></td>
<td class="offer-col" width="50%" valign="top" style="padding:12px 0 0 0;font-family:${FONT};color:#ffffff;font-size:14px;line-height:22px;"><strong>Lead Follow-Up</strong><br /><span style="color:#d5e4e9;">Follow up with new inquiries using the offer they asked about.</span></td>
</tr></table>
</td></tr></table>`
}

function insight(copy: MarketingEmailCopy, index: number) {
  const style = index % 3
  if (style === 0) return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background-color:#f0f7f7;border-left:4px solid #39889f;"><tr><td style="padding:21px 24px;font-family:${FONT};">
<h2 style="margin:0 0 14px;color:#092a3b;font-size:18px;line-height:26px;">${esc(copy.calloutTitle)}</h2>
${copy.points.map(point => `<p style="margin:0 0 10px;color:#314158;font-size:15px;line-height:24px;">&#8226; ${esc(point)}</p>`).join('')}
</td></tr></table>`
  if (style === 1) return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #dce6e9;">
<tr><td colspan="2" style="padding:18px 20px;background-color:#f8fafc;font-family:${FONT};font-weight:bold;font-size:18px;line-height:26px;color:#092a3b;">${esc(copy.calloutTitle)}</td></tr>
${copy.points.map((point, i) => `<tr><td width="34" valign="top" style="padding:14px 0 14px 20px;border-top:1px solid #dce6e9;font-family:${FONT};font-size:14px;line-height:24px;color:#39889f;font-weight:bold;">0${i+1}</td><td style="padding:14px 20px 14px 12px;border-top:1px solid #dce6e9;font-family:${FONT};font-size:15px;line-height:24px;color:#314158;">${esc(point)}</td></tr>`).join('')}
</table>`
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background-color:#f8f5ed;"><tr><td style="padding:22px 24px;font-family:${FONT};">
<h2 style="margin:0 0 14px;color:#092a3b;font-size:18px;line-height:26px;">${esc(copy.calloutTitle)}</h2>
${copy.points.map(point => `<p style="margin:0 0 12px;padding-top:12px;border-top:1px solid #deded4;color:#314158;font-size:15px;line-height:24px;">${esc(point)}</p>`).join('')}
</td></tr></table>`
}

export function renderMarketingEmail(copy: MarketingEmailCopy, index: number): string {
  const split = Math.min(2, copy.paragraphs.length)
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>Patient Pipeline — ${esc(copy.subject)}</title>
<style>
body{margin:0;padding:0;background-color:#eef3f5;-webkit-text-size-adjust:100%;}
table{border-collapse:collapse;}img{border:0;display:block;}a{color:#39889f;}
@media only screen and (max-width:620px){
.container{width:100%!important;}
.inner{padding-left:22px!important;padding-right:22px!important;}
.h1{font-size:25px!important;line-height:33px!important;}
.btn a{display:block!important;text-align:center!important;padding-left:16px!important;padding-right:16px!important;}
.offer-col{display:block!important;width:100%!important;padding-right:0!important;}
}
</style></head>
<body style="margin:0;padding:0;background-color:#eef3f5;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${esc(copy.previewText)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef3f5;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background-color:#ffffff;">
<tr><td align="center" class="inner" style="padding:24px 40px 20px;border-bottom:3px solid #39889f;">
<a href="${MARKETING_LANDING_URL}" style="text-decoration:none;"><img src="${MARKETING_LOGO_URL}" alt="Patient Pipeline" width="216" style="width:216px;max-width:100%;height:auto;margin:0 auto;" /></a>
</td></tr><tr><td class="inner" style="padding:34px 40px 30px;font-family:${FONT};">
<p style="margin:0 0 12px;font-size:12px;line-height:18px;font-weight:bold;letter-spacing:1px;color:#39889f;text-transform:uppercase;">${focusLabels[copy.focus]}</p>
<h1 class="h1" style="margin:0 0 24px;font-size:29px;line-height:37px;color:#092a3b;">${esc(copy.headline)}</h1>
${paragraph('Hi {{contact.first_name}},')}
${copy.paragraphs.slice(0, split).map(paragraph).join('\n')}
${insight(copy, index)}
${copy.paragraphs.slice(split).map(paragraph).join('\n')}
${launchOffer()}
${paragraph(copy.closing)}
<table role="presentation" cellpadding="0" cellspacing="0" class="btn" style="margin:22px 0 24px;"><tr><td style="background-color:#39889f;border-radius:5px;">
<a href="${MARKETING_LANDING_URL}" style="display:inline-block;padding:15px 28px;font-family:${FONT};font-size:16px;line-height:22px;font-weight:bold;color:#ffffff;text-decoration:none;">${esc(copy.ctaLabel)}</a>
</td></tr></table>
<p style="margin:0 0 22px;font-size:13px;line-height:21px;color:#62748e;">Answer a few questions about your practice, then choose a call time. We’ll walk through both products and discuss the launch offer with you.</p>
<p style="margin:0;font-size:16px;line-height:26px;color:#314158;">To your practice’s growth,<br /><strong style="color:#092a3b;">The Patient Pipeline Team</strong></p>
</td></tr></table>
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;"><tr><td class="inner" style="padding:23px 40px;font-family:${FONT};font-size:12px;line-height:19px;color:#62748e;text-align:center;">
Patient Pipeline &middot; Past patients. New inquiries. A clear next conversation.<br />
You are receiving this because you connected with us about growing your practice.<br />
<a href="{{unsubscribe_link}}" style="color:#62748e;text-decoration:underline;">Unsubscribe</a>
</td></tr></table>
</td></tr></table></body></html>`
}