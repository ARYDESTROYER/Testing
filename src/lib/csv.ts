/**
 * CSV for the researcher's export.
 *
 * A participant's answer is arbitrary text, so cells are quoted whenever they
 * contain a delimiter, a quote or a newline. Cells that a spreadsheet would
 * evaluate as a formula get a leading apostrophe: an answer starting with "="
 * is a spreadsheet's idea of code, and this file is meant to be opened in one.
 * The apostrophe only affects the CSV — the JSON export keeps every answer
 * exactly as it was typed.
 */

const NEEDS_QUOTING = /[",\r\n]/
const FORMULA_START = /^[=@\t\r]/

export function csvCell(value: unknown): string {
  if (value == null) return ''
  let s = String(value)
  if (FORMULA_START.test(s)) s = `'${s}`
  return NEEDS_QUOTING.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const lines = [headers.map(csvCell).join(',')]
  for (const row of rows) lines.push(headers.map((h) => csvCell(row[h])).join(','))
  // A byte-order mark so a spreadsheet opens the participants' answers as UTF-8.
  return `﻿${lines.join('\r\n')}\r\n`
}
