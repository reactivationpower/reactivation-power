import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { strToU8, zipSync } from 'fflate'
import { ADMIN_COOKIE_NAME, decodeAdminSession } from '@/lib/auth/admin-token'
import { EMAIL_TEMPLATES, type EmailTemplate } from '@/lib/email-templates'

/**
 * One-click handoff packet for whoever loads the marketing emails into
 * GoHighLevel. Produces a ZIP containing:
 *
 *   START-HERE.html      the handoff sheet — every email's number, name,
 *                        subject line, preview text, and file name, plus
 *                        paste-into-GHL instructions and merge-tag notes
 *   emails.csv           the same index in spreadsheet form
 *   emails/NN-slug.html  each email's full HTML, ready to paste into GHL's
 *                        code editor (or import as a file)
 *
 * The /api/* paths are not covered by the /admin proxy guard, so the admin
 * cookie is verified here.
 */

export const dynamic = 'force-dynamic'

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/^email \d+\s*[—-]\s*/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function fileName(index: number, t: EmailTemplate): string {
  return `${pad(index + 1)}-${slug(t.name)}.html`
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function buildCsv(): string {
  const header = ['#', 'Name', 'Subject line', 'Preview text', 'Angle', 'File']
  const rows = EMAIL_TEMPLATES.map((t, i) => [
    pad(i + 1),
    t.name,
    t.subject,
    t.previewText,
    t.angle,
    `emails/${fileName(i, t)}`,
  ])
  return [header, ...rows]
    .map((r) => r.map(csvCell).join(','))
    .join('\r\n')
}

function buildIndexHtml(exportedAt: string): string {
  const rows = EMAIL_TEMPLATES.map(
    (t, i) => `
      <tr>
        <td class="num">${pad(i + 1)}</td>
        <td>
          <div class="name">${esc(t.name)}</div>
          <div class="file"><a href="emails/${fileName(i, t)}">emails/${fileName(i, t)}</a></div>
        </td>
        <td class="subj">${esc(t.subject)}</td>
        <td class="pre">${esc(t.previewText)}</td>
      </tr>`,
  ).join('')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Reactivation Power — Marketing Email Handoff</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #1f2933; margin: 0; padding: 32px; line-height: 1.5; }
  .wrap { max-width: 1100px; margin: 0 auto; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  .sub { color: #52606d; margin: 0 0 24px; font-size: 14px; }
  .steps { background: #f0f7f9; border: 1px solid #c9e2e8; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; }
  .steps h2 { font-size: 15px; margin: 0 0 8px; color: #39889f; text-transform: uppercase; letter-spacing: .04em; }
  .steps ol { margin: 0; padding-left: 20px; }
  .steps li { margin: 4px 0; }
  .steps code { background: #fff; border: 1px solid #c9e2e8; border-radius: 4px; padding: 1px 6px; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #52606d; border-bottom: 2px solid #d9e2ec; padding: 8px 10px; }
  td { border-bottom: 1px solid #e4e7eb; padding: 10px; vertical-align: top; }
  td.num { width: 32px; color: #9aa5b1; font-weight: bold; }
  .name { font-weight: bold; }
  .file { font-size: 12px; color: #52606d; margin-top: 2px; }
  .file a { color: #39889f; }
  td.subj { width: 30%; }
  td.pre { width: 34%; color: #52606d; font-size: 13px; }
  .foot { margin-top: 24px; font-size: 12px; color: #9aa5b1; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Marketing Email Handoff — ${EMAIL_TEMPLATES.length} emails</h1>
  <p class="sub">Reactivation Power · exported ${esc(exportedAt)}</p>

  <div class="steps">
    <h2>How to load each email into GoHighLevel</h2>
    <ol>
      <li>In GHL go to <strong>Marketing → Emails → Templates → New → Blank Template</strong> (or Import from HTML if available).</li>
      <li>Open the matching file from the <code>emails/</code> folder in a text editor, select all, copy.</li>
      <li>In the GHL builder, add a <strong>Custom Code</strong> block (or switch to the code view) and paste the HTML.</li>
      <li>Set the <strong>subject line</strong> and <strong>preview text</strong> exactly as listed in the table below.</li>
      <li>Name the template with the number and name from the table so the sequence stays in order.</li>
    </ol>
    <p style="margin:12px 0 0;font-size:13px;color:#52606d">
      Merge tags are already in GHL format — <code>{{contact.first_name}}</code> and <code>{{unsubscribe_link}}</code> — so leave them exactly as they are.
      Every call-to-action button already links to the live landing page.
    </p>
  </div>

  <table>
    <thead>
      <tr><th>#</th><th>Email &amp; file</th><th>Subject line</th><th>Preview text</th></tr>
    </thead>
    <tbody>${rows}
    </tbody>
  </table>

  <p class="foot">A spreadsheet version of this table is in <code>emails.csv</code>.</p>
</div>
</body>
</html>`
}

export async function GET() {
  const store = await cookies()
  const token = store.get(ADMIN_COOKIE_NAME)?.value
  if (!token || !decodeAdminSession(token)) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const exportedAt = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  })

  const files: Record<string, Uint8Array> = {
    'START-HERE.html': strToU8(buildIndexHtml(exportedAt)),
    'emails.csv': strToU8(buildCsv()),
  }
  EMAIL_TEMPLATES.forEach((t, i) => {
    files[`emails/${fileName(i, t)}`] = strToU8(t.html)
  })

  const zip = zipSync(files, { level: 6 })
  const stamp = new Date().toISOString().slice(0, 10)

  return new NextResponse(Buffer.from(zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="reactivation-power-emails-${stamp}.zip"`,
      'Cache-Control': 'no-store',
    },
  })
}
