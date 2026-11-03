const d = require('docx');
const { Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, AlignmentType, HeadingLevel, LevelFormat, Header, Footer, PageNumber, PageBreak } = d;

const W = 9906; // content width on A4 with 1000 margins
const FONT = 'Arial';
const AMBER = 'B45309';
const numConfigs = [];
let listCount = 0;

const APP = process.env.BRAND_NAME || 'MjTech Point Of Sale';
const tok = (t) => String(t).replace(/\{\{APP_UP\}\}/g, APP.toUpperCase()).replace(/\{\{APP\}\}/g, APP);
const run = (t, o = {}) => new TextRun({ text: tok(t), font: FONT, ...o });
// inline **bold** support
function runs(text, base = {}) {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map(p =>
    p.startsWith('**') ? run(p.slice(2, -2), { ...base, bold: true }) : run(p, base));
}

function mk(size) {
  const P = (text, o = {}) => new Paragraph({ spacing: { after: 100, line: 300 }, ...o.para, children: runs(text, { size, ...o.run }) });
  const H1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 140 }, keepNext: true,
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: 'D97706', space: 4 } }, children: [run(text, { size: size + 12, bold: true, color: '111827' })] });
  const H2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 }, keepNext: true, children: [run(text, { size: size + 4, bold: true, color: AMBER })] });
  const bullets = (items) => items.map(t => new Paragraph({ numbering: { reference: 'bul', level: 0 }, spacing: { after: 60, line: 290 }, children: runs(t, { size }) }));
  const steps = (items) => {
    const ref = 'num' + (++listCount);
    numConfigs.push({ reference: ref, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 540, hanging: 360 } }, run: { bold: true, color: AMBER } } }] });
    // a step may contain extra lines after "\n": they are shown indented under the step
    return items.flatMap(t => {
      const [first, ...rest] = t.split('\n');
      return [new Paragraph({ numbering: { reference: ref, level: 0 }, spacing: { after: rest.length ? 30 : 70, line: 290 }, children: runs(first, { size }) }),
        ...rest.map((r, i) => new Paragraph({ indent: { left: 900 }, spacing: { after: i === rest.length - 1 ? 70 : 30, line: 280 }, children: runs(r, { size: size - 1 }) }))];
    });
  };
  const box = (kind, title, lines) => {
    const col = { tip: ['059669', 'ECFDF5'], warn: ['DC2626', 'FEF2F2'], note: ['D97706', 'FFFBEB'], owner: ['4F46E5', 'EEF2FF'] }[kind];
    const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [W], rows: [new TableRow({ cantSplit: true, children: [new TableCell({
      width: { size: W, type: WidthType.DXA }, shading: { fill: col[1], type: ShadingType.CLEAR },
      margins: { top: 100, bottom: 100, left: 180, right: 160 },
      borders: { top: none, bottom: none, right: none, left: { style: BorderStyle.SINGLE, size: 24, color: col[0] } },
      children: [new Paragraph({ spacing: { after: 40 }, children: [run(title, { size, bold: true, color: col[0] })] }),
        ...lines.map(l => new Paragraph({ spacing: { after: 40, line: 280 }, children: runs(l, { size: size - 1 }) }))] })] })] });
  };
  const gap = () => new Paragraph({ spacing: { after: 80 }, children: [] });
  const table = (head, rows, widths) => {
    const b = { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' };
    const borders = { top: b, bottom: b, left: b, right: b };
    const cell = (t, i, header) => new TableCell({ width: { size: widths[i], type: WidthType.DXA }, borders,
      shading: header ? { fill: 'FDE68A', type: ShadingType.CLEAR } : undefined, margins: { top: 70, bottom: 70, left: 110, right: 110 },
      children: String(t).split('\n').map(line => new Paragraph({ spacing: { after: 30, line: 270 }, children: runs(line, { size: size - 1, bold: header }) })) });
    return new Table({ width: { size: widths.reduce((a, c) => a + c, 0), type: WidthType.DXA }, columnWidths: widths, rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: head.map((h, i) => cell(h, i, true)) }),
      ...rows.map(r => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, i, false)) })),
    ] });
  };
  const pb = () => new Paragraph({ children: [new PageBreak()] });
  return { P, H1, H2, bullets, steps, box, gap, table, pb };
}

function cover({ title, sub, who, lines }) {
  const c = (t, o) => new Paragraph({ alignment: AlignmentType.LEFT, ...o.para, children: [run(t, o.run)] });
  return [
    c('', { para: { spacing: { before: 2400 } }, run: {} }),
    c('{{APP_UP}}', { para: { spacing: { after: 60 } }, run: { size: 28, bold: true, color: AMBER, characterSpacing: 60 } }),
    c(title, { para: { spacing: { after: 120 } }, run: { size: 72, bold: true, color: '111827' } }),
    new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 24, color: 'D97706', space: 6 } }, spacing: { after: 200 }, children: [] }),
    c(sub, { para: { spacing: { after: 100 } }, run: { size: 30, color: '374151' } }),
    c(who, { para: { spacing: { after: 900 } }, run: { size: 24, color: '6B7280' } }),
    ...lines.map(l => new Paragraph({ spacing: { before: 200, after: 40 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '9CA3AF', space: 2 } }, children: [run(l, { size: 24, color: '374151' })] })),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

function build(file, name, children) {
  const doc = new d.Document({
    creator: APP, title: tok(name),
    styles: { default: { document: { run: { font: FONT } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, bold: true }, paragraph: { outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, bold: true }, paragraph: { outlineLevel: 1 } } ] },
    numbering: { config: [{ reference: 'bul', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 540, hanging: 280 } }, run: { color: AMBER } } }] }, ...numConfigs] },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1100, right: 1000, bottom: 1000, left: 1000 } }, titlePage: true },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [run(name, { size: 16, color: '9CA3AF' })] })] }), first: new Header({ children: [new Paragraph({ children: [] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run('Page ', { size: 16, color: '9CA3AF' }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: '9CA3AF' })] })] }), first: new Footer({ children: [new Paragraph({ children: [] })] }) },
      children }],
  });
  return d.Packer.toBuffer(doc).then(b => require('fs').writeFileSync(file, b));
}
const FILE = process.env.FILE_PREFIX || 'MjTechPOS';
module.exports = { mk, cover, build, W, APP, FILE };
