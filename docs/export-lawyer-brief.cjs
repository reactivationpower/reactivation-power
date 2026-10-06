// Export the factual counsel brief using existing PDFKit and Python's standard library.
const fs = require('node:fs');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const requireApi = createRequire(require('node:path').resolve('artifacts/api-server/package.json'));
const PDFDocument = requireApi('pdfkit');
const outputBase = process.argv[2] || 'docs/Patient-Pipeline-Lawyer-Brief';
const source = fs.readFileSync('docs/Patient-Pipeline-Lawyer-Brief.md', 'utf8');
const text = source;
const blocks = text.split('\n\n').map(s => s.trim()).filter(Boolean);
const doc = new PDFDocument({
  size: 'LETTER', margins: { top: 48, bottom: 52, left: 52, right: 52 }, bufferPages: true,
  info: { Title: 'Patient Pipeline: Updated Lawyer Synopsis', Author: 'Beyond Healthcare LLC' },
});
const out = fs.createWriteStream(`${outputBase}.pdf`);
doc.pipe(out);
const ansi = s => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[—–]/g, '-').replace(/\u00a0/g, ' ');
for (const block of blocks) {
  if (block.startsWith('## Appendix A')) doc.addPage();
  if (block.startsWith('# ')) {
    doc.font('Helvetica-Bold').fontSize(22).fillColor('#183042').text(ansi(block.slice(2)));
  } else if (block.startsWith('## ')) {
    if (doc.y > 650) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#087c71').text(ansi(block.slice(3)));
  } else {
    doc.font('Helvetica').fontSize(10).fillColor('#263746').text(ansi(block), { lineGap: 3 });
  }
  doc.moveDown(0.7);
}
const pages = doc.bufferedPageRange();
for (let i = 0; i < pages.count; i++) {
  doc.switchToPage(i);
  // Footer lives below the body margin; disable auto-pagination for this write.
  const bottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.font('Helvetica').fontSize(8).fillColor('#667580').text(`Beyond Healthcare LLC | Patient Pipeline lawyer synopsis | ${i + 1} / ${pages.count}`, 52, 749, { width: 508, lineBreak: false });
  doc.page.margins.bottom = bottom;
}
doc.end();
out.on('finish', () => console.log(`PDF exported: ${pages.count} pages`));
const py = String.raw`
import json,sys,zipfile
from xml.sax.saxutils import escape
blocks=json.load(sys.stdin)
paragraphs=[]
for block in blocks:
    style='Normal'
    if block.startswith('# '): style='Title'; block=block[2:]
    elif block.startswith('## '): style='Heading1'; block=block[3:]
    pbreak='<w:pageBreakBefore/>' if block.startswith('Appendix A:') else ''
    for line in block.split('\n'):
        paragraphs.append('<w:p><w:pPr><w:pStyle w:val="'+style+'"/>'+pbreak+'</w:pPr><w:r><w:t xml:space="preserve">'+escape(line)+'</w:t></w:r></w:p>')
        pbreak=''
ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
document='<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="'+ns+'"><w:body>'+''.join(paragraphs)+'<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="960" w:right="1040" w:bottom="1040" w:left="1040"/></w:sectPr></w:body></w:document>'
styles='<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="'+ns+'"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="150" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:spacing w:after="250"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/><w:color w:val="183042"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:keepNext/><w:spacing w:before="180" w:after="140"/></w:pPr><w:rPr><w:b/><w:sz w:val="27"/><w:color w:val="087C71"/></w:rPr></w:style></w:styles>'
types='<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'
rels='<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
docrels='<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'
with zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED) as z:
    for name,data in {'[Content_Types].xml':types,'_rels/.rels':rels,'word/document.xml':document,'word/styles.xml':styles,'word/_rels/document.xml.rels':docrels}.items(): z.writestr(name,data)
print('Editable Word brief exported')
`;
const result = spawnSync('python', ['-c', py, `${outputBase}.docx`], { input: JSON.stringify(blocks), encoding: 'utf8' });
if (result.status !== 0) throw new Error(result.stderr);
console.log(result.stdout.trim());
