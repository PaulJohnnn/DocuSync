/**
 * Creates one sample document in every format the manuscript's Scope (p.5)
 * lists as supported, plus one binary file to demonstrate the refusal.
 *
 * Intended for the defense demo: upload any of these and they import; upload
 * the .png and the system declines it with a reason, which is the behaviour
 * page 5 describes ("the architecture rejects opaque binary media").
 *
 * Run: node scripts/make-sample-files.js <outDir>
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const out = process.argv[2] || path.join(__dirname, 'sample-files');
fs.mkdirSync(out, { recursive: true });

const TITLE = 'DocuSync - Chapter 3 Methodology (sample)';
const PARAS = [
  'This document is a sample used to demonstrate DocuSync file import.',
  'DocuSync records every edit as an event rather than overwriting the file.',
  'Vector clocks determine whether two edits were sequential or concurrent.',
  'Last-Write-Wins resolves a line only when two people edited it at once.',
  'Delta encoding sends only the changed lines across the network.',
];
const ALGOS = [
  ['Log-based synchronisation', 'Records every edit as an immutable event', 3],
  ['Vector clocks', 'Distinguishes sequential from concurrent edits', 3],
  ['Last-Write-Wins', 'Resolves a contested line', 24],
  ['Delta encoding', 'Sends only changed lines', 3],
];

const write = (name, text) => fs.writeFileSync(path.join(out, name), text, 'utf8');

// ── Plain text ─────────────────────────────────────────────────────────
write('sample.txt', `${TITLE}\n\n${PARAS.join('\n\n')}\n`);

// ── Markdown ───────────────────────────────────────────────────────────
write('sample.md',
  `# ${TITLE}\n\n${PARAS.join('\n\n')}\n\n## Algorithms\n\n`
  + ALGOS.map(([n]) => `- ${n}`).join('\n') + '\n');

// ── HTML ───────────────────────────────────────────────────────────────
write('sample.html',
  `<!doctype html>\n<html><head><meta charset="utf-8"><title>${TITLE}</title></head>\n<body>\n`
  + `<h1>${TITLE}</h1>\n`
  + PARAS.map((p) => `<p>${p}</p>`).join('\n')
  + `\n<h2>Algorithms</h2>\n<ul>\n`
  + ALGOS.map(([n]) => `  <li>${n}</li>`).join('\n')
  + `\n</ul>\n</body></html>\n`);

// ── CSV ────────────────────────────────────────────────────────────────
write('sample.csv',
  'algorithm,purpose,manuscript_page\n'
  + ALGOS.map(([n, p, pg]) => `${n},${p},${pg}`).join('\n') + '\n');

// ── JSON ───────────────────────────────────────────────────────────────
write('sample.json', JSON.stringify({
  title: TITLE,
  consistencyModel: 'eventual',
  maxConcurrentUsers: 15,
  algorithms: ALGOS.map(([name, purpose, page]) => ({ name, purpose, page })),
}, null, 2) + '\n');

// ── XML ────────────────────────────────────────────────────────────────
write('sample.xml',
  '<?xml version="1.0" encoding="UTF-8"?>\n<document>\n'
  + `  <title>${TITLE}</title>\n  <algorithms>\n`
  + ALGOS.map(([n, , pg]) => `    <algorithm page="${pg}">${n}</algorithm>`).join('\n')
  + '\n  </algorithms>\n</document>\n');

// ── LaTeX ──────────────────────────────────────────────────────────────
write('sample.tex',
  '\\documentclass{article}\n\\begin{document}\n'
  + `\\section*{${TITLE}}\n\n`
  + PARAS.join('\n\n')
  + '\n\n\\end{document}\n');

// ── RTF ────────────────────────────────────────────────────────────────
// A minimal but valid RTF document. Backslashes and braces are the control
// characters, so any in the text would need escaping; this content has none.
write('sample.rtf',
  '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Calibri;}}\n'
  + `\\f0\\fs24\\b ${TITLE}\\b0\\par\n\\par\n`
  + PARAS.map((p) => `${p}\\par`).join('\n')
  + '\n}\n');

// ── DOCX: a real OOXML package, not text under a .docx name ───────────
function zip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  let table = null;
  const crc32 = (buf) => {
    if (!table) {
      table = new Int32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c;
      }
    }
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };

  for (const [name, data] of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = zlib.deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, deflated);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(8, 10);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(deflated.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += 30 + nameBuf.length + deflated.length;
  }
  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([Buffer.concat(locals), centralBuf, eocd]);
}

const para = (t, bold) =>
  `<w:p><w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;

fs.writeFileSync(path.join(out, 'sample.docx'), zip([
  ['[Content_Types].xml', Buffer.from(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '</Types>', 'utf8')],
  ['_rels/.rels', Buffer.from(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + '</Relationships>', 'utf8')],
  ['word/document.xml', Buffer.from(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
    + para(TITLE, true) + PARAS.map((p) => para(p)).join('')
    + '<w:sectPr/></w:body></w:document>', 'utf8')],
]));

// ── A binary file, so the refusal can be demonstrated ─────────────────
fs.writeFileSync(path.join(out, 'REJECTED-sample.png'),
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(Array.from({ length: 256 }, (_, i) => i)),
  ]));

for (const f of fs.readdirSync(out).sort()) {
  console.log(`  ${f.padEnd(24)} ${String(fs.statSync(path.join(out, f)).size).padStart(6)} bytes`);
}
console.log(`\n  written to ${out}`);
