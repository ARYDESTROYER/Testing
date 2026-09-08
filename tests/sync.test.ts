import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { isValidAttribute, isValidEvent, parseSyncPayload, SIDES } from '@/lib/sync'
import type { Attribute, Side } from '@/lib/types'

function attribute(overrides: Partial<Attribute> = {}): Attribute {
  return {
    id: 'a1',
    text: 'curly hair',
    dimension: 'physical',
    prompt: 'enter your physical attributes',
    round: 0,
    writtenAt: 1200,
    side: 'ys',
    x: 800,
    y: 900,
    ...overrides,
  }
}

describe('the sync payload', () => {
  test('accepts every side an attribute can be in', () => {
    // This is the regression that mattered: an earlier validator listed 'ys' and
    // 'ds' by hand, so every attribute a participant let go of was thrown away
    // on its way to the database.
    for (const side of SIDES) {
      assert.ok(isValidAttribute(attribute({ side })), `side "${side}" was rejected`)
    }
  })

  test('covers the whole Side union, so a new side cannot be dropped silently', () => {
    const known: Side[] = ['ys', 'ds', 'gone']
    assert.deepEqual([...SIDES].sort(), known.sort())
  })

  test('rejects an unknown side', () => {
    assert.equal(isValidAttribute(attribute({ side: 'elsewhere' as Side })), false)
  })

  test('rejects an attribute missing anything the database needs', () => {
    assert.equal(isValidAttribute(null), false)
    assert.equal(isValidAttribute('nope'), false)
    assert.equal(isValidAttribute({}), false)
    assert.equal(isValidAttribute({ ...attribute(), id: '' }), false)
    assert.equal(isValidAttribute({ ...attribute(), text: 42 }), false)
    assert.equal(isValidAttribute({ ...attribute(), x: NaN }), false)
    assert.equal(isValidAttribute({ ...attribute(), y: 'left' }), false)
    assert.equal(isValidAttribute({ ...attribute(), round: undefined }), false)
    assert.equal(isValidAttribute({ ...attribute(), writtenAt: Infinity }), false)
  })

  test('keeps an empty answer, which is a real thing to record', () => {
    assert.ok(isValidAttribute(attribute({ text: '' })))
  })

  test('accepts a well-formed event and rejects a malformed one', () => {
    assert.ok(isValidEvent({ type: 'attribute_written', at: 0 }))
    assert.ok(isValidEvent({ type: 'game_end', at: 12, payload: { reason: 'accepted' } }))
    assert.equal(isValidEvent({ type: '', at: 0 }), false)
    assert.equal(isValidEvent({ type: 'x' }), false)
    assert.equal(isValidEvent({ at: 0 }), false)
    assert.equal(isValidEvent(null), false)
  })

  test('keeps what is well formed and reports what it dropped', () => {
    const parsed = parseSyncPayload({
      attributes: [attribute({ id: 'a' }), { junk: true }, attribute({ id: 'b', side: 'gone' })],
      events: [{ type: 'attribute_discarded', at: 5 }, { nope: 1 }],
    })
    assert.deepEqual(
      parsed.attributes.map((a) => a.id),
      ['a', 'b'],
    )
    assert.equal(parsed.events.length, 1)
    assert.equal(parsed.dropped, 2)
  })

  test('survives a body that is not the shape it expects', () => {
    for (const body of [null, undefined, 'text', 42, [], { attributes: 'no' }]) {
      const parsed = parseSyncPayload(body)
      assert.deepEqual(parsed.attributes, [])
      assert.deepEqual(parsed.events, [])
      assert.equal(parsed.dropped, 0)
    }
  })
})
