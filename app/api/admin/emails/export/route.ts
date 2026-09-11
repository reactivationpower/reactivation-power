import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { strToU8, zipSync } from 'fflate'
import { ADMIN_COOKIE_NAME, decodeAdminSession } from '@/lib/auth/admin-token'
import {
  EMAIL_AUDIENCES,
  isEmailAudienceId,
  templatesForAudience,
  type EmailAudience,
  type EmailTemplate,
} from '@/lib/email-templates'

/**
 * One-click handoff packet for whoever loads the marketing emails into
 * GoHighLevel. Produces a ZIP containing:
 *
 *   START-HERE.html                 the handoff sheet — one section per
 *                                   audience listing every email's number,
 *                                   name, subject line, preview text and file
 *                                   name, plus paste-into-GHL instructions
 *   emails.csv                      the same index in spreadsheet form
 *   emails/<audience>/NN-slug.html  each email's full HTML, ready to paste
 *                                   into GHL's code editor
 *
 * `?audience=<id>` narrows the packet to a single audience (the per-set
 * download in the admin previewer); with no query it ships every audience.
 *
 * The /api/* paths are not covered by the /admin proxy guard, so the admin
 * cookie is verified here.
 */

export const dynamic = 'force-dynamic'

interface AudienceSet {
  audience: EmailAudience
  templates: EmailTemplate[]
}

const NAME_PREFIX = /^email\s+(\d+(?:\.\d+)?)\s*[—-]\s*/i

/** "Email 1.1 — Title" → "1-1", "Email 20 — Title" → "20". */
function emailLabel(name: string): string {
  const match = name.match(NAME_PREFIX)
  return match ? match[1].replace('.', '-') : ''
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(NAME_PREFIX, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Every file name carries the email's OWN number ("email-1-1", "email-20")
 * as well as its position in the send order, so a file can never be confused
 * with a differently-numbered email (position 48 is Email 20, for example).
 */
function filePath(set: AudienceSet, index: number, t: EmailTemplate): string {
  const label = emailLabel(t.name)
  const stem = `${label ? `email-${label}-` : ''}${slug(t.name)}`
  return `emails/${set.audience.id}/${pad(index + 1)}-${stem}.html`
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

function buildCsv(sets: AudienceSet[]): string {
  const header = [
    'Audience',
    'Send order',
    'Name',
    'Subject line',
    'Preview text',
    'Angle',
    'File',
  ]
  const rows = sets.flatMap((set) =>
    set.templates.map((t, i) => [
      set.audience.name,
      pad(i + 1),
      t.name,
      t.subject,
      t.previewText,
      t.angle,
      filePath(set, i, t),
    ]),
  )
  return [header, ...rows]
    .map((r) => r.map(csvCell).join(','))
    .join('\r\n')
}

function buildSection(set: AudienceSet): string {
  const rows = set.templates
    .map((t, i) => {
      const path = filePath(set, i, t)
      return `
      <tr>
        <td class="num">${pad(i + 1)}</td>
        <td>
          <div class="name">${esc(t.name)}</div>
          <div class="file"><a href="${path}">${path}</a></div>
        </td>
        <td class="subj">${esc(t.subject)}</td>
        <td class="pre">${esc(t.previewText)}</td>
      </tr>`
    })
    .join('')

  return `
  <section class="set">
    <h2>${esc(set.audience.name)} <span class="count">${set.templates.length} emails</span></h2>
    <p class="desc">${esc(set.audience.description)}</p>
    <table>
      <thead>
        <tr><th title="Send order">#</th><th>Email &amp; file</th><th>Subject line</th><th>Preview text</th></tr>
      </thead>
      <tbody>${rows}
      </tbody>
    </table>
  </section>`
}

function buildIndexHtml(sets: AudienceSet[], exportedAt: string): string {
  const total = sets.reduce((n, s) => n + s.templates.length, 0)
  const scope =
    sets.length === 1 ? `${sets[0].audience.name} sequence` : 'All sequences'

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
  .set { margin-top: 32px; }
  .set h2 { font-size: 20px; margin: 0 0 4px; }
  .set .count { font-size: 13px; font-weight: normal; color: #9aa5b1; margin-left: 8px; }
  .set .desc { margin: 0 0 12px; font-size: 13px; color: #52606d; }
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
  <h1>Marketing Email Handoff — ${scope}, ${total} emails</h1>
  <p class="sub">Reactivation Power · exported ${esc(exportedAt)}</p>

  <div class="steps">
    <h2>How to load each email into GoHighLevel</h2>
    <ol>
      <li>Each folder under <code>emails/</code> is one audience — a full sequence written for one kind of office. Keep the sequences separate in GHL; they go to different lists.</li>
      <li>In GHL go to <strong>Marketing → Emails → Templates → New → Blank Template</strong> (or Import from HTML if available).</li>
      <li>Open the matching file in a text editor, select all, copy.</li>
      <li>In the GHL builder, add a <strong>Custom Code</strong> block (or switch to the code view) and paste the HTML.</li>
      <li>Set the <strong>subject line</strong> and <strong>preview text</strong> exactly as listed in the table below.</li>
      <li>Name the template with the audience plus the email's own number and name from the <strong>Email</strong> column — for example <em>Chiropractic — Email 1.1 — The Revenue Hiding in Your Patient List</em> or <em>Chiropractic — Email 15 — When Your Best Person Leaves</em>. Use the email's own number, not the <strong>#</strong> column: the # is only the send order.</li>
    </ol>
    <p style="margin:12px 0 0;font-size:13px;color:#52606d">
      Merge tags are already in GHL format — <code>{{contact.first_name}}</code> and <code>{{unsubscribe_link}}</code> — so leave them exactly as they are.
      Every call-to-action button already links to the live landing page.
    </p>
  </div>
${sets.map(buildSection).join('\n')}

  <p class="foot">A spreadsheet version of these tables is in <code>emails.csv</code>.</p>
</div>
</body>
</html>`
}

export async function GET(request: Request) {
  const store = await cookies()
  const token = store.get(ADMIN_COOKIE_NAME)?.value
  if (!token || !decodeAdminSession(token)) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const requested = new URL(request.url).searchParams.get('audience')
  if (requested && !isEmailAudienceId(requested)) {
    return new NextResponse('Unknown audience', { status: 400 })
  }

  const sets: AudienceSet[] = EMAIL_AUDIENCES.filter(
    (a) => !requested || a.id === requested,
  )
    .map((audience) => ({ audience, templates: templatesForAudience(audience.id) }))
    .filter((s) => s.templates.length > 0)

  const exportedAt = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  })

  const files: Record<string, Uint8Array> = {
    'START-HERE.html': strToU8(buildIndexHtml(sets, exportedAt)),
    'emails.csv': strToU8(buildCsv(sets)),
  }
  for (const set of sets) {
    set.templates.forEach((t, i) => {
      files[filePath(set, i, t)] = strToU8(t.html)
    })
  }

  const zip = zipSync(files, { level: 6 })
  const stamp = new Date().toISOString().slice(0, 10)
  const scope = requested ? `-${requested}` : ''

  return new NextResponse(Buffer.from(zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="reactivation-power-emails${scope}-${stamp}.zip"`,
      'Cache-Control': 'no-store',
    },
  })
}
