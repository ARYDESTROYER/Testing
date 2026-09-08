import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { tally, type Attribute, type Side } from '@/lib/types'
import { DEFAULT_CONFIG, configFromSearch, sanitizeConfig, FRAME } from '@/lib/config'
import { DIMENSIONS } from '@/lib/prompts'
import {
  makeRng,
  randInt,
  shuffle,
  planRounds,
  placeChip,
  pickSystemTransfer,
  reconstruction,
  attributeId,
} from '@/game/engine'
import { CHIP_H, CHIP_MAX_W, ZONE, ZONE_ANCHOR, DROP, TABLE } from '@/game/layout'

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

/**
 * The digital self receives a COPY: the original stays with the participant and
 * a second row appears pointing back at it.
 */
function copyOf(original: Attribute): Attribute {
  return { ...attr('ds', original.text), copyOf: original.id }
}

/** A participant's attribute plus the copy the digital self now holds. */
function pair(): [Attribute, Attribute] {
  const original = attr('ys')
  return [original, copyOf(original)]
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

  test('reproduces the comp: 18 written, 5 of them copied over', () => {
    const originals = Array.from({ length: 18 }, () => attr('ys'))
    const copies = originals.slice(0, 5).map(copyOf)
    assert.deepEqual(tally([...originals, ...copies]), {
      totalWritten: 18,
      // Nothing has been binned, so nothing has been removed. The comp's
      // "removed 5" was drawn when handing over meant giving away; it is a copy
      // now, so the participant still holds all 18.
      removed: 0,
      left: 18,
      received: 5,
      toBeGained: 13,
    })
  })

  test('a copied attribute is still the participant\u2019s', () => {
    const [original, copy] = pair()
    const t = tally([original, copy])
    assert.equal(t.totalWritten, 1, 'it was typed once')
    assert.equal(t.left, 1, 'the original never left')
    assert.equal(t.received, 1, 'and the digital self has it too')
    assert.equal(t.toBeGained, 0, 'there is nothing more to give of it')
    assert.equal(t.removed, 0)
  })

  test('a copy does not count as something else the participant wrote', () => {
    const originals = Array.from({ length: 3 }, () => attr('ys'))
    const attrs = [...originals, ...originals.map(copyOf)]
    assert.equal(tally(attrs).totalWritten, 3)
  })

  test('binning counts from either side', () => {
    const [original, copy] = pair()
    const binnedOriginal = { ...original, side: 'gone' as const }
    assert.equal(tally([binnedOriginal, copy]).removed, 1)
    assert.equal(tally([binnedOriginal, copy]).left, 0)
    assert.equal(tally([binnedOriginal, copy]).received, 1)

    const binnedCopy = { ...copy, side: 'gone' as const }
    assert.equal(tally([original, binnedCopy]).removed, 1)
    assert.equal(tally([original, binnedCopy]).received, 0)
    assert.equal(tally([original, binnedCopy]).left, 1)
    assert.equal(tally([original, binnedCopy]).toBeGained, 1, 'it can be given again')
  })

  test('to be gained counts only what the digital self does not already have', () => {
    const a = attr('ys')
    const b = attr('ys')
    const c = attr('ys')
    assert.equal(tally([a, b, c]).toBeGained, 3)
    assert.equal(tally([a, b, c, copyOf(a)]).toBeGained, 2)
    assert.equal(tally([a, b, c, copyOf(a), copyOf(b), copyOf(c)]).toBeGained, 0)
  })

  test('the counters always add up', () => {
    const rng = makeRng(99)
    for (let trial = 0; trial < 200; trial++) {
      const originals = Array.from({ length: randInt(rng, 0, 20) }, () =>
        attr(rng() < 0.85 ? 'ys' : 'gone'),
      )
      const copies = originals
        .filter(() => rng() < 0.5)
        .map((o) => (rng() < 0.8 ? copyOf(o) : { ...copyOf(o), side: 'gone' as const }))
      const t = tally([...originals, ...copies])

      assert.equal(t.totalWritten, originals.length)
      assert.ok(t.left <= t.totalWritten, 'cannot hold more than was written')
      assert.ok(t.toBeGained <= t.left, 'cannot give more than is held')
      assert.ok(t.received >= 0 && t.removed >= 0)
    }
  })
})

describe('reconstruction', () => {
  test('is zero on an empty canvas', () => {
    assert.equal(reconstruction([]), 0)
  })

  test('reaches one when the digital self has a copy of everything written', () => {
    const a = attr('ys')
    const b = attr('ys')
    assert.equal(reconstruction([a, b]), 0)
    assert.equal(reconstruction([a, b, copyOf(a)]), 0.5)
    assert.equal(reconstruction([a, b, copyOf(a), copyOf(b)]), 1)
  })

  test('an original binned before it was copied puts a full replica out of reach', () => {
    const a = attr('ys')
    const b = attr('ys')
    const c = attr('ys')
    const attrs = [{ ...a, side: 'gone' as const }, b, c, copyOf(b), copyOf(c)]
    assert.equal(tally(attrs).toBeGained, 0, 'nothing left to give')
    assert.ok(reconstruction(attrs) < 1, 'yet the twin is not complete')
    assert.equal(Number(reconstruction(attrs).toFixed(4)), 0.6667)
  })

  test('taking a copy back out of the bin\u2019s reach lowers it again', () => {
    const a = attr('ys')
    const withCopy = [a, copyOf(a)]
    assert.equal(reconstruction(withCopy), 1)
    assert.equal(reconstruction([a, { ...withCopy[1], side: 'gone' as const }]), 0)
  })

  test('never leaves 0..1', () => {
    const rng = makeRng(7)
    for (let trial = 0; trial < 300; trial++) {
      const originals = Array.from({ length: randInt(rng, 1, 20) }, () =>
        attr(rng() < 0.8 ? 'ys' : 'gone'),
      )
      const copies = originals.filter(() => rng() < 0.7).map(copyOf)
      const v = reconstruction([...originals, ...copies])
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

  test('only ever names attributes the participant still holds', () => {
    const held = [attr('ys'), attr('ys'), attr('ys'), attr('ys')]
    const attrs = [...held, attr('ds'), attr('gone')]
    const heldIds = new Set(held.map((a) => a.id))
    const rng = makeRng(17)
    for (let i = 0; i < 200; i++) {
      for (const id of pickSystemTransfer(rng, attrs, config)) {
        assert.ok(heldIds.has(id), `named ${id}, which is not the participant\u2019s`)
      }
    }
  })

  test('skips anything the digital self already has a copy of', () => {
    const already = attr('ys')
    const fresh = attr('ys')
    const attrs = [already, fresh, copyOf(already)]
    const rng = makeRng(23)
    for (let i = 0; i < 200; i++) {
      assert.deepEqual(pickSystemTransfer(rng, attrs, config), [fresh.id])
    }
  })

  test('stops once the digital self has everything', () => {
    const originals = Array.from({ length: 5 }, () => attr('ys'))
    const attrs = [...originals, ...originals.map(copyOf)]
    assert.deepEqual(pickSystemTransfer(makeRng(29), attrs, config), [])
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

describe('chips gather around their figure', () => {
  test('the first chip on each side lands near its anchor, not at random', () => {
    for (const side of ['ys', 'ds'] as const) {
      const anchor = ZONE_ANCHOR[side]
      for (let seed = 1; seed <= 30; seed++) {
        const { x, y } = placeChip(makeRng(seed), side, 300, [])
        const d = Math.hypot(x + 150 - anchor.x, y + CHIP_H / 2 - anchor.y)
        assert.ok(d < 420, `${side} seed ${seed}: landed ${Math.round(d)} away from the figure`)
      }
    }
  })

  test('a crowd near the figure pushes later chips outward instead of stacking them', () => {
    const rng = makeRng(77)
    const placed: { x: number; y: number; w: number; h: number }[] = []
    const distances: number[] = []
    for (let i = 0; i < 10; i++) {
      const { x, y } = placeChip(rng, 'ys', 300, placed)
      placed.push({ x, y, w: 300, h: CHIP_H })
      distances.push(Math.hypot(x + 150 - ZONE_ANCHOR.ys.x, y + CHIP_H / 2 - ZONE_ANCHOR.ys.y))
    }
    const early = distances.slice(0, 3).reduce((a, b) => a + b) / 3
    const late = distances.slice(-3).reduce((a, b) => a + b) / 3
    assert.ok(late > early, `later chips (${Math.round(late)}) should sit further out than the first (${Math.round(early)})`)
  })

  test('the anchors sit inside their own zones', () => {
    for (const side of ['ys', 'ds'] as const) {
      const z = ZONE[side]
      const a = ZONE_ANCHOR[side]
      assert.ok(a.x >= z.x0 && a.x <= z.x1, `${side} anchor x`)
      assert.ok(a.y >= z.y0 && a.y <= z.y1, `${side} anchor y`)
    }
  })
})

describe('the shared config clamp', () => {
  test('is what the URL parser produces, so client and server cannot diverge', () => {
    const fromUrl = configFromSearch('?seconds=45&rounds=6&min=4&max=2&every=99')
    assert.deepEqual(sanitizeConfig(fromUrl), fromUrl)
  })

  test('refuses a session with no rounds or a negative one', () => {
    assert.equal(sanitizeConfig({ rounds: 0 }).rounds, 1)
    assert.equal(sanitizeConfig({ rounds: -5 }).rounds, 1)
    assert.equal(sanitizeConfig({ roundSeconds: 0 }).roundSeconds, 5)
  })

  test('never lets the transfer interval exceed the number of rounds', () => {
    // Otherwise the system would never take anything and the digital self would
    // stay dark for the whole session.
    for (const rounds of [1, 3, 8, 40]) {
      const c = sanitizeConfig({ rounds, transferEveryNRounds: 99 })
      assert.ok(c.transferEveryNRounds <= c.rounds, `rounds=${rounds}`)
    }
  })

  test('keeps min below max whichever way round they arrive', () => {
    const c = sanitizeConfig({ transferPerRoundMin: 9, transferPerRoundMax: 2 })
    assert.equal(c.transferPerRoundMin, 2)
    assert.equal(c.transferPerRoundMax, 9)
  })

  test('survives junk', () => {
    for (const input of [null, undefined, 'nope', 42, { rounds: 'many' }]) {
      const c = sanitizeConfig(input)
      assert.ok(Number.isFinite(c.rounds) && c.rounds >= 1)
      assert.ok(Number.isFinite(c.roundSeconds) && c.roundSeconds >= 5)
    }
  })
})

describe('a configured minimum of zero', () => {
  test('lets a round legitimately take nothing', () => {
    const config = { ...DEFAULT_CONFIG, transferPerRoundMin: 0, transferPerRoundMax: 0 }
    const attrs = Array.from({ length: 10 }, () => attr('ys'))
    for (let seed = 1; seed <= 20; seed++) {
      assert.deepEqual(pickSystemTransfer(makeRng(seed), attrs, config), [])
    }
  })

  test('still takes something when the range allows it', () => {
    const config = { ...DEFAULT_CONFIG, transferPerRoundMin: 0, transferPerRoundMax: 3 }
    const attrs = Array.from({ length: 10 }, () => attr('ys'))
    const counts = new Set<number>()
    const rng = makeRng(5)
    for (let i = 0; i < 200; i++) counts.add(pickSystemTransfer(rng, attrs, config).length)
    assert.ok(counts.has(0), 'never drew zero')
    assert.ok([...counts].some((n) => n > 0), 'never drew anything')
    assert.ok(Math.max(...counts) <= 3, `drew ${Math.max(...counts)}`)
  })
})

describe('attribute ids', () => {
  test('do not collide, even minted back to back in the same millisecond', () => {
    const ids = new Set(Array.from({ length: 5000 }, () => attributeId()))
    assert.equal(ids.size, 5000)
  })

  test('carry entropy, so two machines against one database cannot clash', () => {
    // The primary key is global rather than per-session, so a timestamp and a
    // per-tab counter alone would let one participant overwrite another's row.
    const id = attributeId()
    assert.match(id, /-[a-z0-9]{6,}$/i, id)
  })
})
