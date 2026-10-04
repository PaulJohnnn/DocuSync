/**
 * Builds the sample files the binary-integrity matrix is measured against.
 *
 * Each one is a genuine file of its type — a real ZIP container for the
 * Office formats, a real deflate stream in the PNG, real JPEG markers — so
 * that "does it still open" is a question with a meaningful answer. They
 * also carry byte sequences that a text encoder cannot survive: NUL, every
 * value 0x00-0xFF, and lone high bytes that are not valid UTF-8.
 *
 * Run: node scripts/make-binary-fixtures.js <outDir>
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const out = process.argv[2] || path.join(__dirname, 'fixtures');
fs.mkdirSync(out, { recursive: true });

// ── A minimal but real ZIP writer (stored + deflated entries) ───────────
function zip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = zlib.deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, deflated);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0, 8); cen.writeUInt16LE(8, 10);
    cen.writeUInt32LE(0, 12);
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

let TABLE = null;
function crc32(buf) {
  if (!TABLE) {
    TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

// ── A real 2x2 PNG: signature, IHDR, deflated IDAT, IEND ───────────────
function png() {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  // Two rows, each: filter byte 0 then 2 RGB pixels.
  const raw = Buffer.from([0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 0, 255, 255, 255, 0]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── A real baseline JPEG (1x1, grey) ───────────────────────────────────
function jpg() {
  return Buffer.from(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
    'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');
}

// ── A real, openable PDF ───────────────────────────────────────────────
function pdf() {
  const body =
    '%PDF-1.4\n' +
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]/Contents 4 0 R' +
    '/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
    '4 0 obj<</Length 56>>stream\nBT /F1 18 Tf 20 40 Td (DocuSync fixture) Tj ET\nendstream endobj\n' +
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n';
  const xref = body.length;
  return Buffer.from(
    body +
    'trailer<</Size 6/Root 1 0 R>>\n' +
    `startxref\n${xref}\n%%EOF\n`, 'latin1');
}

const ooxml = (type) => {
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<root type="${type}"><body>DocuSync fixture for ${type}</body></root>`;
  return zip([
    ['[Content_Types].xml', Buffer.from(ct, 'utf8')],
    ['_rels/.rels', Buffer.from(rels, 'utf8')],
    [`${type}/document.xml`, Buffer.from(doc, 'utf8')],
  ]);
};

// Every byte value, so any encoding step anywhere shows up immediately.
const allBytes = Buffer.from(Array.from({ length: 256 }, (_, i) => i));

const files = {
  'sample.txt':  Buffer.from('Hello DocuSync.\nSecond line.\nCafé — naïve — 日本語\n', 'utf8'),
  'sample.csv':  Buffer.from('name,role\nPaul,author\nZyra,reviewer\n', 'utf8'),
  'sample.json': Buffer.from(JSON.stringify({ title: 'Chapter 3', authors: ['Paul', 'Zyra'] }, null, 2), 'utf8'),
  'sample.pdf':  pdf(),
  'sample.docx': ooxml('word'),
  'sample.xlsx': ooxml('xl'),
  'sample.pptx': ooxml('ppt'),
  'sample.png':  png(),
  'sample.jpg':  jpg(),
  'sample.zip':  zip([['readme.txt', Buffer.from('inside the archive', 'utf8')], ['bytes.bin', allBytes]]),
  'allbytes.bin': allBytes,
};

const manifest = [];
for (const [name, buf] of Object.entries(files)) {
  const p = path.join(out, name);
  fs.writeFileSync(p, buf);
  manifest.push({
    name,
    bytes: buf.length,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
  });
}
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`  wrote ${manifest.length} fixtures to ${out}\n`);
manifest.forEach((m) => console.log(`    ${m.name.padEnd(14)} ${String(m.bytes).padStart(6)} bytes  ${m.sha256.slice(0, 16)}…`));
