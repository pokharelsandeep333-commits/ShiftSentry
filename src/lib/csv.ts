/**
 * A CSV cell. Quoted always, quotes doubled, and a leading = + - @ (or a tab
 * or carriage return) defused with an apostrophe: spreadsheet apps execute a
 * cell that starts with one as a formula, and an email, a display name or a
 * job name is user-controlled text.
 */
export function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function csvRow(values: (string | number | null | undefined)[]) {
  return values.map(csvCell).join(",");
}

/**
 * A whole file: CRLF line ends and a byte-order mark, so spreadsheet apps read
 * it as UTF-8 rather than mangling an accented job name.
 */
export function csvDocument(lines: string[]) {
  return `﻿${lines.join("\r\n")}\r\n`;
}
