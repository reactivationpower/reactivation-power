import { Router, type IRouter, type Request, type Response } from "express";
import { strToU8, zipSync } from "fflate";
import { getAdminSessionFromRequest } from "@/lib/auth/admin-session";
import {
  EMAIL_AUDIENCES,
  isEmailAudienceId,
  templatesForAudience,
  type EmailAudience,
  type EmailTemplate,
} from "@/lib/email-templates";
import { runWithRequestContext } from "@/lib/request-context";

interface AudienceSet {
  audience: EmailAudience;
  templates: EmailTemplate[];
}

const router: IRouter = Router();
const NAME_PREFIX = /^email\s+(\d+(?:\.\d+)?)\s*[—-]\s*/i;

function emailLabel(name: string): string {
  return name.match(NAME_PREFIX)?.[1].replace(".", "-") ?? "";
}
function slug(name: string): string {
  return name.toLowerCase().replace(NAME_PREFIX, "").replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 60);
}
function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function filePath(set: AudienceSet, index: number, template: EmailTemplate): string {
  const label = emailLabel(template.name);
  const stem = `${label ? `email-${label}-` : ""}${slug(template.name)}`;
  return `emails/${set.audience.id}/${pad(index + 1)}-${stem}.html`;
}
function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
function buildCsv(sets: AudienceSet[]): string {
  const rows = sets.flatMap((set) => set.templates.map((template, index) => [
    set.audience.name, pad(index + 1), template.name, template.subject,
    template.previewText, template.angle, filePath(set, index, template),
  ]));
  return [
    ["Audience", "Send order", "Name", "Subject line", "Preview text", "Angle", "File"],
    ...rows,
  ].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
function buildSection(set: AudienceSet): string {
  const rows = set.templates.map((template, index) => {
    const path = filePath(set, index, template);
    return `<tr><td class="num">${pad(index + 1)}</td><td><div class="name">${esc(template.name)}</div><div class="file"><a href="${path}">${path}</a></div></td><td class="subj">${esc(template.subject)}</td><td class="pre">${esc(template.previewText)}</td></tr>`;
  }).join("");
  return `<section class="set"><h2>${esc(set.audience.name)} <span class="count">${set.templates.length} emails</span></h2><p class="desc">${esc(set.audience.description)}</p><table><thead><tr><th title="Send order">#</th><th>Email &amp; file</th><th>Subject line</th><th>Preview text</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}
function buildIndexHtml(sets: AudienceSet[], exportedAt: string): string {
  const total = sets.reduce((count, set) => count + set.templates.length, 0);
  const scope = sets.length === 1 ? `${sets[0].audience.name} sequence` : "All sequences";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Reactivation Power — Marketing Email Handoff</title><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body { font-family: Arial, Helvetica, sans-serif; color: #1f2933; margin: 0; padding: 32px; line-height: 1.5; }
.wrap { max-width: 1100px; margin: 0 auto; } h1 { font-size: 24px; margin: 0 0 4px; }
.sub { color: #52606d; margin: 0 0 24px; font-size: 14px; }
.steps { background: #f0f7f9; border: 1px solid #c9e2e8; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; }
.steps h2 { font-size: 15px; margin: 0 0 8px; color: #39889f; text-transform: uppercase; letter-spacing: .04em; }
.steps ol { margin: 0; padding-left: 20px; } .steps li { margin: 4px 0; }
.steps code { background: #fff; border: 1px solid #c9e2e8; border-radius: 4px; padding: 1px 6px; font-size: 13px; }
.set { margin-top: 32px; } .set h2 { font-size: 20px; margin: 0 0 4px; }
.set .count { font-size: 13px; font-weight: normal; color: #9aa5b1; margin-left: 8px; }
.set .desc { margin: 0 0 12px; font-size: 13px; color: #52606d; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #52606d; border-bottom: 2px solid #d9e2ec; padding: 8px 10px; }
td { border-bottom: 1px solid #e4e7eb; padding: 10px; vertical-align: top; }
td.num { width: 32px; color: #9aa5b1; font-weight: bold; } .name { font-weight: bold; }
.file { font-size: 12px; color: #52606d; margin-top: 2px; } .file a { color: #39889f; }
td.subj { width: 30%; } td.pre { width: 34%; color: #52606d; font-size: 13px; }
.foot { margin-top: 24px; font-size: 12px; color: #9aa5b1; }
</style></head><body><div class="wrap">
<h1>Marketing Email Handoff — ${scope}, ${total} emails</h1>
<p class="sub">Reactivation Power · exported ${esc(exportedAt)}</p>
<div class="steps"><h2>How to load each email into GoHighLevel</h2><ol>
<li>Each folder under <code>emails/</code> is one audience — a full sequence written for one kind of office. Keep the sequences separate in GHL; they go to different lists.</li>
<li>In GHL go to <strong>Marketing → Emails → Templates → New → Blank Template</strong> (or Import from HTML if available).</li>
<li>Open the matching file in a text editor, select all, copy.</li>
<li>In the GHL builder, add a <strong>Custom Code</strong> block (or switch to the code view) and paste the HTML.</li>
<li>Set the <strong>subject line</strong> and <strong>preview text</strong> exactly as listed in the table below.</li>
<li>Name the template with the audience plus the email's own number and name from the <strong>Email</strong> column — for example <em>Chiropractic — Email 1.1 — The Revenue Hiding in Your Patient List</em> or <em>Chiropractic — Email 15 — When Your Best Person Leaves</em>. Use the email's own number, not the <strong>#</strong> column: the # is only the send order.</li>
</ol><p style="margin:12px 0 0;font-size:13px;color:#52606d">Merge tags are already in GHL format — <code>{{contact.first_name}}</code> and <code>{{unsubscribe_link}}</code> — so leave them exactly as they are. Every call-to-action button already links to the live landing page.</p></div>
${sets.map(buildSection).join("\n")}
<p class="foot">A spreadsheet version of these tables is in <code>emails.csv</code>.</p>
</div></body></html>`;
}

router.get("/admin/emails/export", async (req: Request, res: Response) => {
  await runWithRequestContext(req, res, async () => {
    const session = await getAdminSessionFromRequest(req);
    if (!session || session.role !== "super_admin") {
      res.status(401).send("Unauthorized");
      return;
    }
    const requested = typeof req.query.audience === "string" ? req.query.audience : null;
    if (requested && !isEmailAudienceId(requested)) {
      res.status(400).send("Unknown audience");
      return;
    }
    const sets: AudienceSet[] = EMAIL_AUDIENCES
      .filter((audience) => !requested || audience.id === requested)
      .map((audience) => ({ audience, templates: templatesForAudience(audience.id) }))
      .filter((set) => set.templates.length > 0);
    const exportedAt = new Date().toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York",
    });
    const files: Record<string, Uint8Array> = {
      "START-HERE.html": strToU8(buildIndexHtml(sets, exportedAt)),
      "emails.csv": strToU8(buildCsv(sets)),
    };
    for (const set of sets) {
      set.templates.forEach((template, index) => {
        files[filePath(set, index, template)] = strToU8(template.html);
      });
    }
    const stamp = new Date().toISOString().slice(0, 10);
    const scope = requested ? `-${requested}` : "";
    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="reactivation-power-emails${scope}-${stamp}.zip"`,
      "Cache-Control": "no-store",
    }).send(Buffer.from(zipSync(files, { level: 6 })));
  });
});

export default router;