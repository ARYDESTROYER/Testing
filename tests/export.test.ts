import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { csvCell, toCsv } from '@/lib/csv'
import { initialsOf, participantCode } from '@/lib/participants'

describe('participant codes', () => {
  test('match the comp: initials plus a padded number', () => {
    assert.equal(participantCode('Vidhi', 1), 'V01')
    assert.equal(participantCode('Ruchira Sharma', 7), 'RS07')
    assert.equal(participantCode('Ruchira Sharma', 42), 'RS42')
  })

  test('keep growing past two digits rather than wrapping', () => {
    assert.equal(participantCode('Ruchira Sharma', 128), 'RS128')
  })

  test('handle the shapes a name is actually typed in', () => {
    assert.equal(initialsOf('ruchira'), 'R')
    assert.equal(initialsOf('  Ruchira   Sharma  '), 'RS')
    assert.equal(initialsOf('Ruchira-Sharma'), 'RS')
    assert.equal(initialsOf('ruchira.sharma'), 'RS')
    assert.equal(initialsOf('Ruchira Devi Sharma Iyer'), 'RDS', 'capped at three')
  })

  test('work on non-Latin names', () => {
    assert.equal(initialsOf('रुचिरा शर्मा'), 'रश')
    assert.equal(initialsOf('Ólafur Þór'), 'ÓÞ')
  })

  test('never produce an empty code', () => {
    assert.equal(initialsOf(''), 'P')
    assert.equal(initialsOf('   '), 'P')
    assert.equal(initialsOf('123 456'), 'P')
    assert.equal(participantCode('!!!', 3), 'P03')
  })

  test('skip a leading emoji rather than using it as the initial', () => {
    assert.equal(initialsOf('🙂 Ruchira'), 'R')
  })
})

describe('the CSV export', () => {
  test('leaves an ordinary answer untouched', () => {
    assert.equal(csvCell('curly hair'), 'curly hair')
    assert.equal(csvCell(42), '42')
    assert.equal(csvCell(null), '')
    assert.equal(csvCell(undefined), '')
  })

  test('quotes an answer containing a comma', () => {
    assert.equal(csvCell('quiet, then loud'), '"quiet, then loud"')
  })

  test('doubles quotes inside an answer', () => {
    assert.equal(csvCell('the "polite" version of me'), '"the ""polite"" version of me"')
  })

  test('quotes an answer containing a newline', () => {
    assert.equal(csvCell('line one\nline two'), '"line one\nline two"')
    assert.equal(csvCell('line one\r\nline two'), '"line one\r\nline two"')
  })

  test('defuses an answer a spreadsheet would run as a formula', () => {
    assert.equal(csvCell('=1+1'), "'=1+1")
    assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)")
    // Still quoted when it also contains a delimiter.
    assert.equal(csvCell('=HYPERLINK("http://x","y")'), `"'=HYPERLINK(""http://x"",""y"")"`)
  })

  test('leaves an ordinary answer that merely starts with a dash alone', () => {
    assert.equal(csvCell('-tired most days'), '-tired most days')
  })

  test('writes a header row and CRLF line endings', () => {
    const csv = toCsv([
      { code: 'RS01', text: 'curly hair' },
      { code: 'RS01', text: 'I can game pretty well' },
    ])
    const lines = csv.replace(/^﻿/, '').split('\r\n')
    assert.equal(lines[0], 'code,text')
    assert.equal(lines[1], 'RS01,curly hair')
    assert.equal(lines[2], 'RS01,I can game pretty well')
  })

  test('starts with a byte-order mark so a spreadsheet reads it as UTF-8', () => {
    assert.ok(toCsv([{ a: 'é' }]).startsWith('﻿'))
  })

  test('is empty for no rows rather than a bare header', () => {
    assert.equal(toCsv([]), '')
  })

  test('round-trips an answer through a minimal CSV parser', () => {
    const text = 'she said "hello", then left\nand did not come back'
    const csv = toCsv([{ text }])
    const body = csv.replace(/^﻿/, '').split('\r\n')[1]
    assert.equal(parseOneCell(body), text)
  })
})

/** Just enough CSV parsing to prove a cell survives the round trip. */
function parseOneCell(line: string): string {
  if (!line.startsWith('"')) return line
  let out = ''
  for (let i = 1; i < line.length; i++) {
    if (line[i] === '"') {
      if (line[i + 1] === '"') {
        out += '"'
        i++
      } else break
    } else out += line[i]
  }
  return out
}
