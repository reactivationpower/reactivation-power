import { PUBLIC_APP_ORIGIN } from '@/lib/app-origin'

/**
 * Branded layout for transactional email. Same visual language as the
 * marketing sequence in lib/email-templates.ts (logo header with the teal
 * rule, Arial, slate copy, teal buttons), but without merge tags or an
 * unsubscribe link — these are account emails the recipient must receive.
 *
 * Table-based with inline styles so Outlook and Gmail render it alike.
 */

export const BRAND = {
  name: 'Patient Pipeline',
  tagline: 'Patient reactivation & new-lead follow-up for your practice',
  teal: '#39889f',
  ink: '#1d293d',
  body: '#314158',
  muted: '#62748e',
  panel: '#f1f5f9',
  page: '#f8fafc',
  logoUrl: `${PUBLIC_APP_ORIGIN}/images/patient-pipeline-logo.png`,
  siteUrl: PUBLIC_APP_ORIGIN,
} as const

const FONT = 'Arial,Helvetica,sans-serif'

/** Escape user-supplied text before it lands in HTML. */
export function esc(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export const h1 = (text: string) =>
  `<h1 class="h1" style="margin:0 0 20px 0;font-family:${FONT};font-size:26px;line-height:34px;color:${BRAND.ink};">${text}</h1>`

export const p = (text: string) =>
  `<p style="margin:0 0 16px 0;font-family:${FONT};font-size:16px;line-height:26px;color:${BRAND.body};">${text}</p>`

export const small = (text: string) =>
  `<p style="margin:0 0 16px 0;font-family:${FONT};font-size:13px;line-height:20px;color:${BRAND.muted};">${text}</p>`

export const button = (label: string, href: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" class="btn" style="margin:24px 0 28px 0;">
  <tr>
    <td style="background-color:${BRAND.teal};border-radius:6px;">
      <a href="${esc(href)}" style="display:inline-block;padding:14px 32px;font-family:${FONT};font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;">${label}</a>
    </td>
  </tr>
</table>`

/** Light panel with the teal left rule. */
export const panel = (lines: string[], accent: string = BRAND.teal) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 24px 0;">
  <tr>
    <td style="background-color:${BRAND.panel};border-left:4px solid ${accent};padding:18px 22px;">
${lines
  .map(
    (l, i) =>
      `      <p style="margin:0${i === lines.length - 1 ? '' : ' 0 10px 0'};font-family:${FONT};font-size:15px;line-height:24px;color:${BRAND.ink};">${l}</p>`,
  )
  .join('\n')}
    </td>
  </tr>
</table>`

/** Label / value rows — receipts, account details. */
export const details = (rows: Array<[string, string]>) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 24px 0;border:1px solid #e2e8f0;border-radius:6px;">
${rows
  .map(
    ([label, value], i) =>
      `  <tr>
    <td style="padding:12px 18px;font-family:${FONT};font-size:14px;line-height:22px;color:#45556c;${i === rows.length - 1 ? '' : 'border-bottom:1px solid #e2e8f0;'}">${label}</td>
    <td align="right" style="padding:12px 18px;font-family:${FONT};font-size:14px;line-height:22px;color:${BRAND.ink};${i === rows.length - 1 ? '' : 'border-bottom:1px solid #e2e8f0;'}"><strong>${value}</strong></td>
  </tr>`,
  )
  .join('\n')}
</table>`

/** A link the recipient can copy when the button does not work. */
export const fallbackLink = (href: string) =>
  `<p style="margin:0 0 16px 0;font-family:${FONT};font-size:13px;line-height:20px;color:${BRAND.muted};word-break:break-all;">If the button doesn't work, copy and paste this link into your browser:<br /><a href="${esc(href)}" style="color:${BRAND.teal};">${esc(href)}</a></p>`

export const signoff = (line = 'Thank you,') =>
  `<p style="margin:8px 0 4px 0;font-family:${FONT};font-size:16px;line-height:26px;color:${BRAND.body};">${line}</p>
<p style="margin:0 0 8px 0;font-family:${FONT};font-size:16px;line-height:26px;color:${BRAND.ink};"><strong>The ${BRAND.name} Team</strong></p>`

export interface LayoutOptions {
  /** Hidden inbox preview text. */
  previewText: string
  /** Optional line under the standard footer, e.g. a support note. */
  footerNote?: string
}

/** Wrap assembled body blocks in the branded shell. */
export function layout(parts: string[], opts: LayoutOptions): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>${BRAND.name}</title>
<style>
  body { margin: 0; padding: 0; background-color: ${BRAND.page}; -webkit-text-size-adjust: 100%; }
  table { border-collapse: collapse; }
  img { border: 0; display: block; }
  a { color: ${BRAND.teal}; }
  @media only screen and (max-width: 620px) {
    .container { width: 100% !important; }
    .inner { padding-left: 20px !important; padding-right: 20px !important; }
    .h1 { font-size: 22px !important; line-height: 30px !important; }
    .btn a { display: block !important; text-align: center !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.page};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${esc(opts.previewText)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.page};">
  <tr>
    <td align="center" style="padding:32px 12px;">
      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
        <tr>
          <td align="center" class="inner" style="background-color:#ffffff;padding:18px 40px 16px 40px;border-bottom:3px solid ${BRAND.teal};">
            <a href="${BRAND.siteUrl}" style="text-decoration:none;"><img src="${BRAND.logoUrl}" alt="Patient Pipeline" width="200" style="width:200px;max-width:200px;height:auto;margin:0 auto;" /></a>
          </td>
        </tr>
        <tr>
          <td class="inner" style="padding:36px 40px 28px 40px;">
${parts.join('\n')}
          </td>
        </tr>
      </table>
      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;">
        <tr>
          <td class="inner" style="padding:24px 40px;font-family:${FONT};font-size:12px;line-height:18px;color:${BRAND.muted};text-align:center;">
            ${BRAND.name} &middot; ${esc(BRAND.tagline)}<br />
            This is a transactional message about your ${BRAND.name} account.${opts.footerNote ? `<br />${opts.footerNote}` : ''}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}

/** Plain-text alternative: strip tags from the assembled HTML body. */
export function toPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<div style="display:none[\s\S]*?<\/div>/i, '')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, text: string) =>
      text.replace(/<[^>]+>/g, '').trim() === href ? href : `${text} (${href})`,
    )
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h1|h2|tr|table|div)>/gi, '\n')
    .replace(/<\/td>\s*<td/gi, ': <td')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&zwnj;/g, ' ')
    .replace(/&middot;/g, '·')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
