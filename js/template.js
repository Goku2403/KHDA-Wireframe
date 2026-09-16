/* KHDA — Excel template writer.
   Builds a real .xlsx (zip + OOXML) so the Data sheet can carry dropdown lists and validation rules,
   which the SheetJS community build cannot write. No external dependency, works offline.

   Data sheet columns A-I use the HEDB database field names; J-L are read-only lookups that show
   the description of the code picked in C, D and E. Column B looks up the institution name from A. */
(function () {
  'use strict';

  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const enc = new TextEncoder();

  // ---------- helpers ----------
  function esc(s) {
    return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }
  function escAttr(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function colName(i) {
    let s = '';
    for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    return s;
  }

  // ---------- zip (stored, no compression) ----------
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function zip(files) {
    const local = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = f.data, crc = crc32(data);
      const lh = new Uint8Array(30 + name.length), lv = new DataView(lh.buffer);
      lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0, true);
      lv.setUint16(8, 0, true); lv.setUint16(10, 0, true); lv.setUint16(12, 0x0021, true);
      lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true);
      lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true);
      lh.set(name, 30);
      local.push(lh, data);

      const cd = new Uint8Array(46 + name.length), cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
      cv.setUint16(8, 0, true); cv.setUint16(10, 0, true); cv.setUint16(12, 0, true); cv.setUint16(14, 0x0021, true);
      cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true);
      cd.set(name, 46);
      central.push(cd);
      offset += lh.length + data.length;
    }
    const cdSize = central.reduce((n, c) => n + c.length, 0);
    const eocd = new Uint8Array(22), ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
    const parts = [...local, ...central, eocd];
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  }

  // ---------- sheet xml ----------
  // cell: primitive, or { v, f, s, t }. Style 0 default, 1 header, 2 lookup (italic grey), 3 date.
  function cellXml(ref, cell, headerRow) {
    if (cell === null || cell === undefined || cell === '') return '';
    const isObj = typeof cell === 'object';
    const style = isObj && cell.s !== undefined ? cell.s : (headerRow ? 1 : 0);
    const s = style ? ` s="${style}"` : '';
    if (isObj && cell.f) return `<c r="${ref}"${s} t="str"><f>${esc(cell.f)}</f></c>`;
    const v = isObj ? cell.v : cell;
    if (v === undefined || v === null || v === '') return `<c r="${ref}"${s}/>`;
    if (typeof v === 'number') return `<c r="${ref}"${s}><v>${v}</v></c>`;
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  }
  function sheetXml(rows, opts) {
    opts = opts || {};
    let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + `<worksheet xmlns="${NS}">`;
    xml += '<sheetViews><sheetView workbookViewId="0">';
    if (opts.freeze) xml += '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>';
    xml += '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>';
    if (opts.cols) xml += '<cols>' + opts.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>';
    xml += '<sheetData>';
    rows.forEach((row, r) => {
      const cells = row.map((c, i) => cellXml(colName(i) + (r + 1), c, r === 0)).join('');
      if (cells) xml += `<row r="${r + 1}">${cells}</row>`;
    });
    xml += '</sheetData>';
    if (opts.validations && opts.validations.length) {
      xml += `<dataValidations count="${opts.validations.length}">`;
      for (const v of opts.validations) {
        xml += `<dataValidation type="${v.type}"`;
        if (v.operator) xml += ` operator="${v.operator}"`;
        xml += ' allowBlank="1" showInputMessage="1" showErrorMessage="1"';
        if (v.promptTitle) xml += ` promptTitle="${escAttr(v.promptTitle)}" prompt="${escAttr(v.prompt)}"`;
        if (v.errorTitle) xml += ` errorTitle="${escAttr(v.errorTitle)}" error="${escAttr(v.error)}"`;
        xml += ` sqref="${v.sqref}"><formula1>${esc(v.formula1)}</formula1>`;
        if (v.formula2) xml += `<formula2>${esc(v.formula2)}</formula2>`;
        xml += '</dataValidation>';
      }
      xml += '</dataValidations>';
    }
    return xml + '</worksheet>';
  }

  const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<styleSheet xmlns="${NS}">` +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts>' +
    '<fonts count="3">' +
    '<font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/></font>' +
    '<font><i/><sz val="11"/><color rgb="FF5E5E62"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF5F3F7"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left/><right/><top/><bottom style="thin"><color rgb="FFC0C6CF"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="4">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  // ---------- workbook ----------
  function build(sheets, definedNames) {
    const files = [];
    const types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>';
    files.push({ name: '[Content_Types].xml', data: enc.encode(types) });
    files.push({
      name: '_rels/.rels', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
    });

    const wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      `<workbook xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      '<sheets>' + sheets.map((s, i) => `<sheet name="${escAttr(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets>' +
      (definedNames.length ? '<definedNames>' + definedNames.map(d => `<definedName name="${escAttr(d.name)}">${esc(d.ref)}</definedName>`).join('') + '</definedNames>' : '') +
      '<calcPr calcId="124519" fullCalcOnLoad="1"/></workbook>';
    files.push({ name: 'xl/workbook.xml', data: enc.encode(wb) });

    const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
    files.push({ name: 'xl/_rels/workbook.xml.rels', data: enc.encode(rels) });
    files.push({ name: 'xl/styles.xml', data: enc.encode(STYLES) });
    sheets.forEach((s, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(sheetXml(s.rows, s.opts)) }));

    return new Blob([zip(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  window.KHDA_XLSX = { build, sheetXml, zip };
})();
