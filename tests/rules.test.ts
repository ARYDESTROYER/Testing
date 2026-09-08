import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { tally, type Attribute, type Side } from '@/lib/types'
import { DEFAULT_CONFIG, configFromSearch, FRAME } from '@/lib/config'
import { DIMENSIONS } from '@/lib/prompts'
import {
  makeRng,
  randInt,
  shuffle,
  planRounds,
  placeChip,
  pickSystemTransfer,
  reconstruction,
} from '@/game/engine'
import { CHIP_H, CHIP_MAX_W, ZONE, DROP, TABLE } from '@/game/layout'

/* -------------------------------------------------------------------------- */

let n = 0
function attr(side: Side, text = `a${++n}`): Attribute {
  return {
    id: `id${n}`,
    text,
    dimension: 'physical',
    prompt: 'p',
    round: 0,
    writtenAt: 0,
    side,
    x: 0,
    y: 0,
  }
}

/* -------------------------------------------------------------------------- */

describe('the attribute table', () => {
  test('is all zeroes before anything is written', () => {
    assert.deepEqual(tally([]), {
      totalWritten: 0,
      removed: 0,
      left: 0,
      received: 0,
      toBeGained: 0,
    })
  })

  test('reproduces the comp: 18 written, 5 handed over', () => {
    const attrs = [
      ...Array.from({ length: 13 }, () => attr('ys')),
      ...Array.from({ length: 5 }, () => attr('ds')),
    ]
    assert.deepEqual(tally(attrs), {
      totalWritten: 18,
      removed: 5,
      left: 13,
      received: 5,
      toBeGained: 13,
    })
  })

  test('removed mirrors received exactly while nothing is destroyed', () => {
    for (let handed = 0; handed <= 10; handed++) {
      const attrs = [
        ...Array.from({ length: 10 - handed }, () => attr('ys')),
        ...Array.from({ length: handed }, () => attr('ds')),
      ]
      const t = tally(attrs)
      assert.equal(t.removed, t.received, `handed=${handed}`)
      assert.equal(t.left, t.toBeGained, `handed=${handed}`)
    }
  })

  test('destroying an attribute separates removed from received', () => {
    const attrs = [attr('ys'), attr('ys'), attr('ds'), attr('gone')]
    const t = tally(attrs)
    assert.equal(t.totalWritten, 4)
    assert.equal(t.received, 1, 'only the handed-over one reached the digital self')
    assert.equal(t.removed, 2, 'both the handed-over and the destroyed one left the self')
    assert.equal(t.left, 2)
    assert.equal(t.toBeGained, 2)
  })

  test('the counters always add up', () => {
    const rng = makeRng(99)
    for (let trial = 0; trial < 200; trial++) {
      const attrs = Array.from({ length: randInt(rng, 0, 30) }, () => {
        const r = rng()
        return attr(r < 0.5 ? 'ys' : r < 0.85 ? 'ds' : 'gone')
      })
      const t = tally(attrs)
      assert.equal(t.left + t.removed, t.totalWritten)
      assert.ok(t.received <= t.removed)
      assert.equal(t.toBeGained, t.left)
    }
  })
})

describe('reconstruction', () => {
  test('is zero on an empty canvas', () => {
    assert.equal(reconstruction([]), 0)
  })

  test('reaches one only when the digital self holds everything written', () => {
    assert.equal(reconstruction([attr('ds'), attr('ds')]), 1)
    assert.equal(reconstruction([attr('ds'), attr('ys')]), 0.5)
  })

  test('a destroyed attribute puts a full replica permanently out of reach', () => {
    // Everything the participant still holds has been handed over, and the
    // digital self is still not them.
    const attrs = [attr('ds'), attr('ds'), attr('ds'), attr('gone')]
    assert.equal(tally(attrs).toBeGained, 0, 'nothing left to give')
    assert.ok(reconstruction(attrs) < 1, 'yet the twin is not complete')
    assert.equal(reconstruction(attrs), 0.75)
  })

  test('never leaves 0..1', () => {
    const rng = makeRng(7)
    for (let trial = 0; trial < 300; trial++) {
      const attrs = Array.from({ length: randInt(rng, 1, 40) }, () => {
        const r = rng()
        return attr(r < 0.4 ? 'ys' : r < 0.8 ? 'ds' : 'gone')
      })
      const v = reconstruction(attrs)
      assert.ok(v >= 0 && v <= 1, `got ${v}`)
    }
  })
})

describe('the random generator', () => {
  test('is deterministic for a seed, so a run can be replayed', () => {
    const a = Array.from({ length: 20 }, makeRng(12345))
    const b = Array.from({ length: 20 }, makeRng(12345))
    assert.deepEqual(a, b)
  })

  test('two seeds do not agree', () => {
    assert.notDeepEqual(
      Array.from({ length: 20 }, makeRng(1)),
      Array.from({ length: 20 }, makeRng(2)),
    )
  })

  test('stays inside 0..1', () => {
    const rng = makeRng(4)
    for (let i = 0; i < 10_000; i++) {
      const v = rng()
      assert.ok(v >= 0 && v < 1)
    }
  })

  test('randInt covers its bounds inclusively and never exceeds them', () => {
    const rng = makeRng(8)
    const seen = new Set<number>()
    for (let i = 0; i < 4000; i++) {
      const v = randInt(rng, 3, 5)
      assert.ok(v >= 3 && v <= 5, `got ${v}`)
      seen.add(v)
    }
    assert.deepEqual([...seen].sort(), [3, 4, 5])
  })

  test('shuffle keeps every element and does not mutate the input', () => {
    const input = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8])
    const out = shuffle(makeRng(2), input)
    assert.deepEqual([...out].sort((a, b) => a - b), [...input])
    assert.deepEqual(input, [1, 2, 3, 4, 5, 6, 7, 8])
  })
})

describe('the round plan', () => {
  test('gives one round per configured prompt', () => {
    for (const rounds of [1, 4, 8, 12, 40]) {
      const plan = planRounds(makeRng(1), { ...DEFAULT_CONFIG, rounds })
      assert.equal(plan.length, rounds)
    }
  })

  test('every prompt belongs to the dimension it is filed under', () => {
    const plan = planRounds(makeRng(3), { ...DEFAULT_CONFIG, rounds: 40 })
    for (const round of plan) {
      assert.ok(
        round.dimension.prompts.includes(round.prompt),
        `"${round.prompt}" is not one of ${round.dimension.id}'s prompts`,
      )
    }
  })

  test('covers every dimension once before repeating any', () => {
    const plan = planRounds(makeRng(5), { ...DEFAULT_CONFIG, rounds: DIMENSIONS.length })
    assert.equal(new Set(plan.map((r) => r.dimension.id)).size, DIMENSIONS.length)
  })

  test('wraps past the last dimension rather than running out', () => {
    const plan = planRounds(makeRng(6), { ...DEFAULT_CONFIG, rounds: DIMENSIONS.length + 3 })
    assert.equal(plan.length, DIMENSIONS.length + 3)
    assert.ok(plan.every((r) => r.dimension && r.prompt))
  })

  test('keeps the authored order when shuffling is off', () => {
    const plan = planRounds(makeRng(1), {
      ...DEFAULT_CONFIG,
      rounds: DIMENSIONS.length,
      shuffleDimensions: false,
    })
    assert.deepEqual(
      plan.map((r) => r.dimension.id),
      DIMENSIONS.map((d) => d.id),
    )
  })

  test('is reproducible from its seed', () => {
    const a = planRounds(makeRng(42), DEFAULT_CONFIG).map((r) => `${r.dimension.id}:${r.prompt}`)
    const b = planRounds(makeRng(42), DEFAULT_CONFIG).map((r) => `${r.dimension.id}:${r.prompt}`)
    assert.deepEqual(a, b)
  })
})

describe('what the system takes each round', () => {
  const config = { ...DEFAULT_CONFIG, transferPerRoundMin: 3, transferPerRoundMax: 5 }

  test('takes nothing when the participant holds nothing', () => {
    assert.deepEqual(pickSystemTransfer(makeRng(1), [], config), [])
    assert.deepEqual(pickSystemTransfer(makeRng(1), [attr('ds'), attr('gone')], config), [])
  })

  test('never takes more than the participant holds', () => {
    const rng = makeRng(11)
    for (let held = 1; held <= 12; held++) {
      const attrs = Array.from({ length: held }, () => attr('ys'))
      const taken = pickSystemTransfer(rng, attrs, config)
      assert.ok(taken.length <= held, `held ${held}, took ${taken.length}`)
      assert.ok(taken.length >= 1)
    }
  })

  test('stays within the configured bounds when there is plenty to take', () => {
    const rng = makeRng(13)
    const attrs = Array.from({ length: 40 }, () => attr('ys'))
    for (let i = 0; i < 300; i++) {
      const taken = pickSystemTransfer(rng, attrs, config)
      assert.ok(taken.length >= 3 && taken.length <= 5, `took ${taken.length}`)
    }
  })

  test('only ever takes attributes the participant still holds', () => {
    const held = [attr('ys'), attr('ys'), attr('ys'), attr('ys')]
    const attrs = [...held, attr('ds'), attr('ds'), attr('gone')]
    const heldIds = new Set(held.map((a) => a.id))
    const rng = makeRng(17)
    for (let i = 0; i < 200; i++) {
      for (const id of pickSystemTransfer(rng, attrs, config)) {
        assert.ok(heldIds.has(id), `took ${id}, which is not the participant's`)
      }
    }
  })

  test('never returns the same attribute twice in one round', () => {
    const attrs = Array.from({ length: 20 }, () => attr('ys'))
    const rng = makeRng(19)
    for (let i = 0; i < 200; i++) {
      const taken = pickSystemTransfer(rng, attrs, config)
      assert.equal(new Set(taken).size, taken.length)
    }
  })
})

describe('chip placement', () => {
  const widths = [180, 400, 900, CHIP_MAX_W, CHIP_MAX_W + 600]

  test('always lands inside its own zone', () => {
    const rng = makeRng(23)
    for (const side of ['ys', 'ds'] as const) {
      const zone = ZONE[side]
      for (const width of widths) {
        for (let i = 0; i < 60; i++) {
          const { x, y } = placeChip(rng, side, width, [])
          assert.ok(x >= zone.x0 - 0.001, `${side} x ${x} < ${zone.x0}`)
          assert.ok(y >= zone.y0 - 0.001, `${side} y ${y} < ${zone.y0}`)
          assert.ok(y + CHIP_H <= zone.y1 + 0.001, `${side} bottom ${y + CHIP_H} > ${zone.y1}`)
          assert.ok(x + Math.min(width, zone.x1 - zone.x0) <= zone.x1 + 0.001)
        }
      }
    }
  })

  test('never lands on the artboard edge or off it', () => {
    const rng = makeRng(29)
    for (const side of ['ys', 'ds'] as const) {
      for (let i = 0; i < 200; i++) {
        const { x, y } = placeChip(rng, side, 500, [])
        assert.ok(x >= 0 && x + 500 <= FRAME.width)
        assert.ok(y >= 0 && y + CHIP_H <= FRAME.height)
      }
    }
  })

  test('the two zones never overlap, so a chip cannot look like it is on the wrong side', () => {
    assert.ok(ZONE.ys.x1 < ZONE.ds.x0)
  })

  test('neither zone runs into the figures or the attribute table', () => {
    assert.ok(ZONE.ys.x1 <= DROP.ys.x0, 'the left zone reaches the self')
    assert.ok(ZONE.ds.x0 >= DROP.ds.x1, 'the right zone reaches the digital self')
    for (const zone of [ZONE.ys, ZONE.ds]) {
      const overlapsTable =
        zone.x0 < TABLE.x + TABLE.w &&
        zone.x1 > TABLE.x &&
        zone.y0 < TABLE.y + TABLE.h &&
        zone.y1 > TABLE.y
      assert.ok(!overlapsTable, 'a chip could land on the attribute table')
    }
  })

  test('avoids chips that are already there when there is room', () => {
    const rng = makeRng(31)
    const placed: { x: number; y: number; w: number; h: number }[] = []
    for (let i = 0; i < 8; i++) {
      const w = 300
      const { x, y } = placeChip(rng, 'ys', w, placed)
      for (const p of placed) {
        const overlaps = x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + CHIP_H > p.y
        assert.ok(!overlaps, `chip ${i} overlaps an earlier one`)
      }
      placed.push({ x, y, w, h: CHIP_H })
    }
  })

  test('still places something once the zone is full rather than giving up', () => {
    const crowd = Array.from({ length: 400 }, (_, i) => ({
      x: ZONE.ys.x0 + (i % 20) * 5,
      y: ZONE.ys.y0 + Math.floor(i / 20) * 5,
      w: 1200,
      h: 1600,
    }))
    const { x, y } = placeChip(makeRng(37), 'ys', 300, crowd, 20)
    assert.ok(Number.isFinite(x) && Number.isFinite(y))
    assert.ok(x >= ZONE.ys.x0 && y >= ZONE.ys.y0)
  })
})

describe('config from the URL', () => {
  test('falls back to the defaults for an empty query', () => {
    assert.deepEqual(configFromSearch(''), DEFAULT_CONFIG)
  })

  test('reads every documented parameter', () => {
    const c = configFromSearch('?seconds=45&rounds=6&min=2&max=4&every=2&shuffle=0&coach=0&discard=0')
    assert.equal(c.roundSeconds, 45)
    assert.equal(c.rounds, 6)
    assert.equal(c.transferPerRoundMin, 2)
    assert.equal(c.transferPerRoundMax, 4)
    assert.equal(c.transferEveryNRounds, 2)
    assert.equal(c.shuffleDimensions, false)
    assert.equal(c.showCoachOverlays, false)
    assert.equal(c.allowDiscard, false)
  })

  test('clamps values a facilitator could plausibly mistype', () => {
    const c = configFromSearch('?seconds=0&rounds=9999&every=-4')
    assert.ok(c.roundSeconds >= 5)
    assert.ok(c.rounds <= 40)
    assert.ok(c.transferEveryNRounds >= 1)
  })

  test('ignores nonsense rather than producing NaN', () => {
    const c = configFromSearch('?seconds=abc&rounds=')
    assert.equal(c.roundSeconds, DEFAULT_CONFIG.roundSeconds)
    assert.equal(c.rounds, DEFAULT_CONFIG.rounds)
  })

  test('swaps a reversed min/max instead of producing an empty range', () => {
    const c = configFromSearch('?min=7&max=2')
    assert.equal(c.transferPerRoundMin, 2)
    assert.equal(c.transferPerRoundMax, 7)
    assert.ok(c.transferPerRoundMin <= c.transferPerRoundMax)
  })
})

describe('config from the URL, blank values', () => {
  test('a parameter left blank means unset, not zero', () => {
    const c = configFromSearch('?rounds=&seconds=&min=&max=&every=')
    assert.deepEqual(c, DEFAULT_CONFIG)
  })

  test('a blank flag keeps its default rather than turning on', () => {
    const c = configFromSearch('?shuffle=&coach=&discard=')
    assert.equal(c.shuffleDimensions, DEFAULT_CONFIG.shuffleDimensions)
    assert.equal(c.showCoachOverlays, DEFAULT_CONFIG.showCoachOverlays)
    assert.equal(c.allowDiscard, DEFAULT_CONFIG.allowDiscard)
  })

  test('accepts the ways a flag is actually written', () => {
    for (const off of ['0', 'false', 'no', 'off', 'OFF', 'False']) {
      assert.equal(configFromSearch(`?coach=${off}`).showCoachOverlays, false, off)
    }
    for (const on of ['1', 'true', 'yes', 'on']) {
      assert.equal(configFromSearch(`?coach=${on}`).showCoachOverlays, true, on)
    }
  })
})
