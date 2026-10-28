// CSV (RFC 4180) parsing and writing. Pure, no DOM.

/**
 * Parse delimited text into rows of fields. Handles quoted fields with embedded
 * delimiters, doubled quotes and line breaks, and CRLF, LF or CR line endings.
 * A final line break ends the last record rather than starting an empty one.
 * @param {string} text
 * @param {{delimiter?:string}} [options]
 * @returns {string[][]}
 */
export function parseCSV(text, { delimiter = ',' } = {}) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let atFieldStart = true;
  let pending = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 2;
      } else if (ch === '"') {
        quoted = false;
        i += 1;
      } else {
        field += ch;
        i += 1;
      }
      continue;
    }
    pending = true;
    if (ch === '"' && atFieldStart) {
      quoted = true;
      atFieldStart = false;
      i += 1;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
      atFieldStart = true;
      i += 1;
    } else if (ch === '\r' || ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      atFieldStart = true;
      pending = false;
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
    } else {
      field += ch;
      atFieldStart = false;
      i += 1;
    }
  }
  if (pending || quoted) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Quote a field when it holds the delimiter, a quote or a line break.
 * @param {string} field
 * @param {string} delimiter
 * @returns {string}
 */
function quoteField(field, delimiter) {
  const s = String(field);
  if (s.includes(delimiter) || /["\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Write rows of fields as delimited text, each record ending in CRLF.
 * @param {string[][]} rows
 * @param {{delimiter?:string}} [options]
 * @returns {string}
 */
export function serializeCSV(rows, { delimiter = ',' } = {}) {
  return rows.map((r) => r.map((f) => quoteField(f, delimiter)).join(delimiter) + '\r\n').join('');
}
