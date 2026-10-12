/**
 * @module exportDocument
 *
 * Converts a stored editor document (TipTap HTML) into the formats a user can
 * actually download.
 *
 * Downloads used to be forced to `.txt` with no choice offered, because the
 * app could not honestly produce anything else — a file named `.docx` that
 * contained plain text is not a Word document, and no word processor would
 * open it. So the options here are limited to what can be produced correctly:
 * plain text, Markdown, a standalone HTML page, and a real OOXML `.docx`
 * built as a proper ZIP container rather than text wearing a `.docx` name.
 */

/** One block of the document, flattened out of the editor's HTML. */
/** One cell's content: the same runs a paragraph is made of. */
type Run = { text: string; bold?: boolean; italic?: boolean; underline?: boolean };

/** A row of a table, and whether it is the header row. */
export interface TableRowModel {
  header: boolean;
  cells: Run[][];
}

interface Block {
  kind: 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'li' | 'oli' | 'quote' | 'code' | 'table';
  /**
   * Paragraph alignment, where the author set one. Dropped entirely before,
   * so a centred title came back left-aligned in every download — the
   * document looked rearranged rather than exported.
   */
  align?: 'left' | 'center' | 'right' | 'justify';
  runs: Run[];
  /**
   * Set only on `kind: 'table'`.
   *
   * A table was previously flattened: the parser walked block tags, found
   * the paragraph TipTap puts inside each cell, and emitted them as loose
   * paragraphs. So a downloaded document had the words but no table at
   * all -- rows and columns silently became a list of lines. The panel's
   * point was that a table is part of the text, and it was the one part
   * that did not survive being exported.
   */
  rows?: TableRowModel[];
}

const BLOCK_TAGS = 'table,p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,div,tr';

/**
 * Walks the editor HTML into a flat block list. Everything downstream works
 * from this, so the four exporters cannot drift apart in what they consider
 * a paragraph.
 */
export function parseBlocks(html: string): Block[] {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: Block[] = [];

  const runsOf = (el: Element): Block['runs'] => {
    const runs: Block['runs'] = [];
    const walk = (node: Node, bold: boolean, italic: boolean, underline: boolean) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (text) runs.push({ text, bold, italic, underline });
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const element = node as Element;
      const tag = element.tagName.toLowerCase();
      if (tag === 'br') { runs.push({ text: '\n', bold, italic, underline }); return; }
      const b = bold || tag === 'strong' || tag === 'b';
      const i = italic || tag === 'em' || tag === 'i';
      // Underline was not read at all, so an underlined heading or term came
      // back plain. The editor writes it as <u>, and pasted content often
      // carries it as an inline style instead.
      const u = underline || tag === 'u'
        || /underline/i.test(element.getAttribute('style') || '');
      element.childNodes.forEach(c => walk(c, b, i, u));
    };
    el.childNodes.forEach(c => walk(c, false, false, false));
    return runs.filter(r => r.text.length > 0);
  };

  /** The alignment the author set on a block, if any. */
  const alignOf = (el: Element): Block['align'] => {
    const style = el.getAttribute('style') || '';
    const match = /text-align\s*:\s*(left|center|right|justify)/i.exec(style);
    if (match) return match[1].toLowerCase() as Block['align'];
    // TipTap can also carry it as a class.
    const cls = el.getAttribute('class') || '';
    const viaClass = /\b(?:text|align)-(left|center|right|justify)\b/i.exec(cls);
    return viaClass ? (viaClass[1].toLowerCase() as Block['align']) : undefined;
  };

  doc.body.querySelectorAll(BLOCK_TAGS).forEach(el => {
    // A table is taken whole, before the nested-block guard below would
    // reject it for containing paragraphs — those paragraphs are its
    // cells, not siblings of it.
    if (el.tagName.toLowerCase() === 'table') {
      const rows: TableRowModel[] = [];
      el.querySelectorAll('tr').forEach(tr => {
        const cells: Run[][] = [];
        let header = false;
        tr.querySelectorAll('th,td').forEach(cell => {
          if (cell.tagName.toLowerCase() === 'th') header = true;
          cells.push(runsOf(cell));
        });
        if (cells.length) rows.push({ header, cells });
      });
      if (rows.length) out.push({ kind: 'table', runs: [], rows });
      return;
    }
    // Anything inside a table was already captured as a cell above.
    if (el.closest('table')) return;
    // Skip wrappers whose text belongs to a nested block we will visit anyway.
    if (el.querySelector(BLOCK_TAGS)) return;
    const tag = el.tagName.toLowerCase();
    const runs = runsOf(el);
    if (runs.length === 0) {
      // An empty paragraph is spacing the author put there on purpose.
      // Skipping it closed up the gaps, so a downloaded document came back
      // more tightly set than the one on screen. Only paragraphs are kept
      // this way; an empty heading or list item is a leftover, not spacing.
      if (tag === 'p') out.push({ kind: 'p', align: alignOf(el), runs: [] });
      return;
    }
    let kind: Block['kind'] = 'p';
    if (tag === 'h1') kind = 'h1';
    else if (tag === 'h2') kind = 'h2';
    else if (tag === 'h3') kind = 'h3';
    else if (tag === 'h4' || tag === 'h5' || tag === 'h6') kind = 'h4';
    else if (tag === 'li') kind = el.closest('ol') ? 'oli' : 'li';
    else if (tag === 'blockquote') kind = 'quote';
    else if (tag === 'pre') kind = 'code';
    out.push({ kind, align: alignOf(el), runs });
  });

  // A document with no block tags at all is already plain text.
  if (out.length === 0) {
    const text = doc.body.textContent || '';
    if (text.trim()) out.push({ kind: 'p', runs: [{ text }] });
  }
  return out;
}

const plainOf = (b: Block) => b.runs.map(r => r.text).join('');

/** A cell's text, with newlines flattened so a row stays one row. */
const NEWLINE = String.fromCharCode(10);

/** A cell's text, with newlines flattened so a row stays one row. */
const cellText = (cell: Run[]) =>
  cell.map(r => r.text).join('').replace(new RegExp('[ \t]*' + NEWLINE + '[ \t]*', 'g'), ' ').trim();

/**
 * A table drawn in plain text, with columns padded to line up.
 *
 * A downloaded .txt is often what someone prints or pastes elsewhere, so
 * a table arriving as a run-on line is worse than no table. Padding costs
 * nothing and keeps the rows readable.
 */
function tableToText(rows: TableRowModel[]): string {
  const grid = rows.map(r => r.cells.map(cellText));
  const width = Math.max(...grid.map(r => r.length), 0);
  const widths: number[] = [];
  for (let c = 0; c < width; c++) {
    widths[c] = Math.max(...grid.map(r => (r[c] ?? '').length), 3);
  }
  const line = (cells: string[]) =>
    Array.from({ length: width }, (_, c) => (cells[c] ?? '').padEnd(widths[c])).join('  ').trimEnd();
  const out: string[] = [];
  grid.forEach((r, i) => {
    out.push(line(r));
    if (i === 0 && rows[0]?.header) out.push(widths.map(w => '-'.repeat(w)).join('  '));
  });
  return out.join(NEWLINE);
}

/** A table as a Markdown pipe table. */
function tableToMarkdown(rows: TableRowModel[]): string {
  if (!rows.length) return '';
  const esc = (t: string) => t.split('|').join('&#124;');
  const width = Math.max(...rows.map(r => r.cells.length));
  const row = (cells: Run[][]) =>
    '| ' + Array.from({ length: width }, (_, c) => esc(cellText(cells[c] ?? []))).join(' | ') + ' |';
  const out = [row(rows[0].cells)];
  // Markdown has no table without a header rule, so one is written even
  // when the author never marked a header row -- otherwise the table
  // renders as literal pipes wherever the file is opened.
  out.push('| ' + Array.from({ length: width }, () => '---').join(' | ') + ' |');
  rows.slice(1).forEach(r => out.push(row(r.cells)));
  return out.join(NEWLINE);
}

export function toPlainText(html: string): string {
  return parseBlocks(html)
    .map(b => (b.kind === 'table' && b.rows)
      ? tableToText(b.rows)
      : (b.kind === 'li' ? '• ' : b.kind === 'oli' ? '1. ' : '') + plainOf(b))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function toMarkdown(html: string): string {
  const esc = (s: string) => s.replace(/([*_`[\]])/g, '\\$1');
  return parseBlocks(html).map(b => {
    if (b.kind === 'table' && b.rows) return tableToMarkdown(b.rows);
    const body = b.runs.map(r => {
      let t = esc(r.text);
      if (r.bold) t = `**${t}**`;
      if (r.italic) t = `*${t}*`;
      return t;
    }).join('');
    switch (b.kind) {
      case 'h1': return `# ${body}`;
      case 'h2': return `## ${body}`;
      case 'h3': return `### ${body}`;
      case 'h4': return `#### ${body}`;
      case 'li': return `- ${body}`;
      case 'oli': return `1. ${body}`;
      case 'quote': return `> ${body}`;
      case 'code': return '```\n' + plainOf(b) + '\n```';
      default: return body;
    }
  }).join('\n\n').trim() + '\n';
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** A cell's runs as inline HTML, so formatting inside a cell survives. */
function cellHtml(cell: Run[]): string {
  return cell.map(r => {
    let t = xmlEscape(r.text).split(String.fromCharCode(10)).join('<br>');
    if (r.bold) t = `<strong>${t}</strong>`;
    if (r.italic) t = `<em>${t}</em>`;
    if (r.underline) t = `<u>${t}</u>`;
    return t;
  }).join('');
}

/** A real HTML table, with a header row where the author marked one. */
function tableToHtml(rows: TableRowModel[]): string {
  const width = Math.max(...rows.map(r => r.cells.length), 0);
  const cellsOf = (r: TableRowModel) =>
    Array.from({ length: width }, (_, c) => {
      const tag = r.header ? 'th' : 'td';
      return `<${tag}>${cellHtml(r.cells[c] ?? [])}</${tag}>`;
    }).join('');
  const body = rows.map(r => `    <tr>${cellsOf(r)}</tr>`).join(String.fromCharCode(10));
  return `  <table>${String.fromCharCode(10)}${body}${String.fromCharCode(10)}  </table>`;
}

export function toHtmlDocument(html: string, title: string): string {
  const body = parseBlocks(html).map(b => {
    if (b.kind === 'table' && b.rows) return tableToHtml(b.rows);
    const inner = b.runs.map(r => {
      let t = xmlEscape(r.text).replace(/\n/g, '<br>');
      if (r.bold) t = `<strong>${t}</strong>`;
      if (r.italic) t = `<em>${t}</em>`;
      if (r.underline) t = `<u>${t}</u>`;
      return t;
    }).join('');
    // Carried on the element, so the saved page is laid out the way the
    // editor showed it rather than everything flush left.
    const a = b.align && b.align !== 'left' ? ` style="text-align:${b.align}"` : '';
    switch (b.kind) {
      case 'h1': return `  <h1${a}>${inner}</h1>`;
      case 'h2': return `  <h2${a}>${inner}</h2>`;
      case 'h3': return `  <h3${a}>${inner}</h3>`;
      case 'h4': return `  <h4${a}>${inner}</h4>`;
      case 'li': case 'oli': return `  <li${a}>${inner}</li>`;
      case 'quote': return `  <blockquote${a}>${inner}</blockquote>`;
      case 'code': return `  <pre>${xmlEscape(plainOf(b))}</pre>`;
      default: return `  <p${a}>${inner}</p>`;
    }
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${xmlEscape(title)}</title>
<style>
  body { max-width: 46rem; margin: 3rem auto; padding: 0 1rem;
         font: 16px/1.65 Calibri, Carlito, system-ui, sans-serif; color: #1a1a1a; }
  blockquote { border-left: 3px solid #ccc; margin: 0; padding-left: 1rem; color: #555; }
  /* Without borders a saved table reads as columns of loose words, which
     is the thing the export was meant to stop happening. */
  table { border-collapse: collapse; margin: 1rem 0; }
  th, td { border: 1px solid #999; padding: 6px 10px; text-align: left; vertical-align: top; }
  th { background: #f2f2f2; font-weight: 600; }
  pre { background: #f5f5f5; padding: 1rem; overflow-x: auto; }
</style>
</head>
<body>
${body}
</body>
</html>
`;
}

// ── Minimal ZIP writer (store, no compression) ───────────────────────────────
// A .docx is a ZIP of XML parts. Writing the container by hand keeps this
// honest — the result is a real OOXML package Word opens — without pulling a
// compression library into the client bundle for a handful of small files.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipStore(entries: { name: string; data: string }[]): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const u16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff];
  const u32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];

  /** Appends raw bytes to a plain number array (no typed-array spreading). */
  const push = (arr: number[], src: ArrayLike<number>) => {
    for (let i = 0; i < src.length; i++) arr.push(src[i]);
  };

  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const dataBytes = enc.encode(e.data);
    const crc = crc32(dataBytes);

    const l: number[] = [];
    push(l, u32(0x04034b50)); push(l, u16(20)); push(l, u16(0)); push(l, u16(0));
    push(l, u16(0)); push(l, u16(0));                      // time, date
    push(l, u32(crc)); push(l, u32(dataBytes.length)); push(l, u32(dataBytes.length));
    push(l, u16(nameBytes.length)); push(l, u16(0));
    push(l, nameBytes);
    const local = new Uint8Array(l);
    chunks.push(local, dataBytes);

    const c: number[] = [];
    push(c, u32(0x02014b50)); push(c, u16(20)); push(c, u16(20)); push(c, u16(0)); push(c, u16(0));
    push(c, u16(0)); push(c, u16(0));
    push(c, u32(crc)); push(c, u32(dataBytes.length)); push(c, u32(dataBytes.length));
    push(c, u16(nameBytes.length)); push(c, u16(0)); push(c, u16(0)); push(c, u16(0)); push(c, u16(0));
    push(c, u32(0)); push(c, u32(offset));
    push(c, nameBytes);
    central.push(new Uint8Array(c));

    offset += local.length + dataBytes.length;
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const z: number[] = [];
  push(z, u32(0x06054b50)); push(z, u16(0)); push(z, u16(0));
  push(z, u16(entries.length)); push(z, u16(entries.length));
  push(z, u32(centralSize)); push(z, u32(offset)); push(z, u16(0));
  const eocd = new Uint8Array(z);

  return new Blob([...chunks, ...central, eocd] as BlobPart[], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

/**
 * One cell's runs as OOXML, reusing the same rules as a paragraph so
 * bold, italic and underline survive inside a table.
 */
function docxRuns(runs: Run[], prefix = ''): string {
  return runs.map((r, i) => {
    const rPr = (r.bold || r.italic || r.underline)
      ? `<w:rPr>${r.bold ? '<w:b/>' : ''}${r.italic ? '<w:i/>' : ''}${r.underline ? '<w:u w:val="single"/>' : ''}</w:rPr>` : '';
    const text = (i === 0 ? prefix : '') + r.text;
    const body = text.split(String.fromCharCode(10)).map((seg, j) =>
      (j > 0 ? '<w:br/>' : '') + `<w:t xml:space="preserve">${xmlEscape(seg)}</w:t>`
    ).join('');
    return `<w:r>${rPr}${body}</w:r>`;
  }).join('');
}

/**
 * A real Word table, not paragraphs pretending to be one.
 *
 * Word needs the borders stated on the table itself (`<w:tblBorders>`) --
 * without them it opens as an invisible grid, which looks to the reader
 * exactly like the flattened text this export exists to replace. Every
 * cell must also contain at least one `<w:p>`, or Word reports the
 * document as corrupt.
 */
function tableToDocx(rows: TableRowModel[]): string {
  const width = Math.max(...rows.map(r => r.cells.length), 1);
  const edge = (side: string) => `<w:${side} w:val="single" w:sz="6" w:space="0" w:color="999999"/>`;
  const borders = `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(edge).join('')}</w:tblBorders>`;
  const grid = `<w:tblGrid>${Array.from({ length: width }, () => '<w:gridCol w:w="2400"/>').join('')}</w:tblGrid>`;
  const tblPr = `<w:tblPr><w:tblW w:w="0" w:type="auto"/>${borders}</w:tblPr>`;

  const body = rows.map(r => {
    const cells = Array.from({ length: width }, (_, c) => {
      const runs = docxRuns(r.cells[c] ?? []);
      const shade = r.header ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : '';
      const bold = r.header ? '<w:rPr><w:b/></w:rPr>' : '';
      const pPr = bold ? `<w:pPr>${bold}</w:pPr>` : '';
      // An empty cell still needs its paragraph.
      return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>${shade}</w:tcPr><w:p>${pPr}${runs}</w:p></w:tc>`;
    }).join('');
    return `<w:tr>${cells}</w:tr>`;
  }).join('');

  // A table followed immediately by another table, or ending the body,
  // needs a paragraph after it or Word runs them together.
  return `<w:tbl>${tblPr}${grid}${body}</w:tbl><w:p/>`;
}

export function toDocx(html: string): Blob {
  const paras = parseBlocks(html).map(b => {
    if (b.kind === 'table' && b.rows) return tableToDocx(b.rows);
    const style =
      b.kind === 'h1' ? 'Heading1' : b.kind === 'h2' ? 'Heading2' :
      b.kind === 'h3' ? 'Heading3' : b.kind === 'h4' ? 'Heading4' :
      b.kind === 'quote' ? 'Quote' : b.kind === 'li' || b.kind === 'oli' ? 'ListParagraph' : '';
    // Alignment and style are both paragraph properties and have to go in
    // the same <w:pPr>; Word ignores a second one. Writing only the style
    // meant every centred or right-aligned paragraph came back flush left.
    const jc = b.align && b.align !== 'left'
      ? `<w:jc w:val="${b.align === 'justify' ? 'both' : b.align}"/>` : '';
    const pPr = (style || jc)
      ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${jc}</w:pPr>` : '';
    const bullet = b.kind === 'li' ? '• ' : b.kind === 'oli' ? '1. ' : '';

    const runs = b.runs.map((r, i) => {
      const rPr = (r.bold || r.italic || r.underline)
        ? `<w:rPr>${r.bold ? '<w:b/>' : ''}${r.italic ? '<w:i/>' : ''}${r.underline ? '<w:u w:val="single"/>' : ''}</w:rPr>` : '';
      // A newline inside a run is a <w:br/> in OOXML, not a literal character.
      const text = (i === 0 ? bullet : '') + r.text;
      const parts = text.split('\n');
      const body = parts.map((seg, j) =>
        (j > 0 ? '<w:br/>' : '') + `<w:t xml:space="preserve">${xmlEscape(seg)}</w:t>`
      ).join('');
      return `<w:r>${rPr}${body}</w:r>`;
    }).join('');

    return `<w:p>${pPr}${runs}</w:p>`;
  }).join('');

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

  // Without these definitions Word silently falls back to Normal for every
  // pStyle the document references, so headings came out looking like body
  // text. Half-point sizes: 32 = 16pt, 28 = 14pt, 24 = 12pt.
  const heading = (id: string, name: string, size: number, outline: number) =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="${outline}"/><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:style>${heading('Heading1', 'heading 1', 40, 0)}${heading('Heading2', 'heading 2', 32, 1)}${heading('Heading3', 'heading 3', 28, 2)}${heading('Heading4', 'heading 4', 24, 3)}<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720"/></w:pPr><w:rPr><w:i/><w:color w:val="555555"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720"/><w:spacing w:after="60"/></w:pPr></w:style></w:styles>`;

  return zipStore([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rels },
    { name: 'word/_rels/document.xml.rels', data: docRels },
    { name: 'word/document.xml', data: document },
    { name: 'word/styles.xml', data: styles },
  ]);
}

/** The formats offered in the download menu, in the order they appear. */
export const EXPORT_FORMATS = [
  { ext: 'docx', label: 'Word document', hint: '.docx' },
  { ext: 'txt', label: 'Plain text', hint: '.txt' },
  { ext: 'md', label: 'Markdown', hint: '.md' },
  { ext: 'html', label: 'Web page', hint: '.html' },
] as const;

export type ExportExt = typeof EXPORT_FORMATS[number]['ext'];

/** Builds the downloadable blob for one format. */
export function buildExport(html: string, ext: ExportExt, title: string): Blob {
  switch (ext) {
    case 'docx': return toDocx(html);
    case 'md':   return new Blob([toMarkdown(html)], { type: 'text/markdown;charset=utf-8' });
    case 'html': return new Blob([toHtmlDocument(html, title)], { type: 'text/html;charset=utf-8' });
    default:     return new Blob([toPlainText(html)], { type: 'text/plain;charset=utf-8' });
  }
}

/** File extensions the uploader accepts, shared with the file picker. */
export const ACCEPTED_UPLOAD_EXTS = [
  '.txt', '.md', '.markdown', '.html', '.htm', '.json', '.csv', '.tsv',
  // `.tex` is listed as a supported format in the manuscript's Scope (p.5)
  // but was missing here, so a LaTeX file — plain text, and perfectly safe
  // for the delta pipeline — was refused by a system that claims to take it.
  '.docx', '.doc', '.rtf', '.log', '.xml', '.yml', '.yaml', '.tex',
];
