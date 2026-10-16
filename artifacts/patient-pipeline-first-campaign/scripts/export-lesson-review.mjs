import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(path.join(root, "artifacts/api-server/package.json"));
const PDFDocument = require("pdfkit");
const source = path.join(root, "artifacts/patient-pipeline-first-campaign/docs/beginner-ghl-form-lesson.md");
const destination = path.join(root, "exports/Patient-Pipeline-GoHighLevel-Beginner-Lesson-Review");
const markdown = fs.readFileSync(source, "utf8");
const blocks = markdown.trim().split(/\n\s*\n/);
const clean = (value) => value.replace(/\*\*/g, "");
const escape = (value) => value.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);
const inline = (value) => escape(value)
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/https:\/\/[^\s<]+/g, (url) => `<a href="${url}">${url}</a>`)
  .replace(/\n/g, "<br>");
const htmlBlocks = blocks.map((block) => {
  const heading = block.match(/^(#{1,3}) (.+)$/);
  if (heading) {
    const level = heading[1].length;
    return `<h${level}>${inline(heading[2])}</h${level}>`;
  }
  if (block.startsWith("- ")) {
    return `<ul>${block.split("\n").map((line) => `<li>${inline(line.replace(/^- /, ""))}</li>`).join("")}</ul>`;
  }
  const type = block.startsWith("**Narration:") ? "narration" : block.startsWith("**Pause:") ? "pause" : "";
  return `<p class="${type}">${inline(block)}</p>`;
}).join("\n");
fs.writeFileSync(`${destination}.html`, `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Patient Pipeline — GoHighLevel beginner lesson review</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f2f5f6;color:#213344;font:16px/1.65 system-ui,sans-serif}
main{max-width:960px;margin:32px auto;background:white;padding:48px 60px;border-top:7px solid #147e87}
h1{font-size:34px;line-height:1.2;color:#143d52;margin:0 0 20px}h2{font-size:24px;line-height:1.3;margin:42px 0 16px;color:#176671}
h3{font-size:20px;line-height:1.35;margin:36px 0 16px;border-top:1px solid #dbe4e7;padding-top:24px;color:#143d52}
p{margin:12px 0}li{margin:7px 0}.narration{padding:18px 22px;background:#f0f7f8;border-left:4px solid #147e87}
.pause{color:#146570}a{color:#126b86;overflow-wrap:anywhere}h1,h2,h3{break-after:avoid}
@media(max-width:700px){main{margin:0;padding:28px 20px}h1{font-size:28px}}
@media print{body{background:white;font-size:11pt}main{margin:0;padding:0;max-width:none}h2{margin-top:24px}.narration{background:none}a{color:inherit}}
</style></head><body><main>${htmlBlocks}</main></body></html>`);

const doc = new PDFDocument({
  size: "A4", margins: { top: 46, bottom: 48, left: 48, right: 48 },
  bufferPages: true,
  info: { Title: "Connect Your GoHighLevel Form to Patient Pipeline — Review Draft",
    Author: "Patient Pipeline", Subject: "Beginner lesson script; research-checked, not live-tested" },
});
doc.registerFont("Body", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf");
doc.registerFont("Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf");
const output = fs.createWriteStream(`${destination}.pdf`);
doc.pipe(output);
for (const block of blocks) {
  const heading = block.match(/^(#{1,3}) (.+)$/);
  if (heading) {
    const level = heading[1].length;
    if (doc.y > 630 || (level === 2 && doc.y > 570)) doc.addPage();
    doc.moveDown(level === 1 ? 0 : 0.8);
    doc.font("Bold").fontSize(level === 1 ? 23 : level === 2 ? 15 : 12)
      .fillColor(level === 1 ? "#143d52" : "#176671")
      .text(clean(heading[2]), { lineGap: 3 });
    doc.moveDown(0.5);
    continue;
  }
  const isBullet = block.startsWith("- ");
  const text = clean(block).replace(/^- /gm, "• ");
  doc.font("Body").fontSize(9.5)
    .fillColor(block.startsWith("**Narration:") ? "#122b3d" : "#344858")
    .text(text, { lineGap: 3, paragraphGap: isBullet ? 3 : 0 });
  doc.moveDown(0.65);
}
const range = doc.bufferedPageRange();
for (let i = range.start; i < range.start + range.count; i++) {
  doc.switchToPage(i);
  const originalBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.font("Body").fontSize(8).fillColor("#607482")
    .text(`PATIENT PIPELINE  •  SCRIPT REVIEW — NOT A LIVE-TESTED CONNECTION  |  ${i + 1} / ${range.count}`,
      48, doc.page.height - 30, { width: doc.page.width - 96, align: "center", lineBreak: false });
  doc.page.margins.bottom = originalBottom;
}
doc.end();
await new Promise((resolve, reject) => {
  output.on("finish", resolve);
  output.on("error", reject);
  doc.on("error", reject);
});
console.log(JSON.stringify({ pdf: `${destination}.pdf`, html: `${destination}.html`, pages: range.count }));