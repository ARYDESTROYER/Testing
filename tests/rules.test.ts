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
  clusterCentre,
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

/* -------------------------------------------------------------------------- */

describe('the attribute table', () => {
  test('is all zeroes before anything is written', () => {
    assert.deepEqual(tally([]), {
      totalWritten: 0,
      removed: 0,
      left: 0,
      received: 0,
      toBeGained: 0,
      discarded: 0,
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
      discarded: 0,
    })
  })

  test('handing an attribute over takes it off the participant', () => {
    const a = attr('ds')
    const t = tally([a])
    assert.equal(t.totalWritten, 1, 'it was typed once')
    assert.equal(t.left, 0, 'the participant no longer holds it')
    assert.equal(t.received, 1, 'the digital self does')
    assert.equal(t.removed, 1, 'and it left the self to get there')
    assert.equal(t.toBeGained, 0, 'there is nothing more to give of it')
  })

  test('removed mirrors received exactly while nothing is let go of', () => {
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

  test('letting an attribute go separates removed from received', () => {
    const attrs = [attr('ys'), attr('ys'), attr('ds'), attr('gone')]
    const t = tally(attrs)
    assert.equal(t.totalWritten, 4)
    assert.equal(t.received, 1, 'only the handed-over one reached the digital self')
    assert.equal(t.removed, 2, 'both the handed-over and the binned one left the self')
    assert.equal(t.left, 2)
    assert.equal(t.toBeGained, 2)
    assert.equal(t.discarded, 1, 'but only one of them was let go of')
  })

  test('binning counts from either side', () => {
    const fromYs = [{ ...attr('ys'), side: 'gone' as const }, attr('ds')]
    assert.equal(tally(fromYs).discarded, 1)
    assert.equal(tally(fromYs).left, 0)
    assert.equal(tally(fromYs).received, 1)

    const fromDs = [attr('ys'), { ...attr('ds'), side: 'gone' as const }]
    assert.equal(tally(fromDs).discarded, 1)
    assert.equal(tally(fromDs).received, 0)
    assert.equal(tally(fromDs).left, 1)
    assert.equal(tally(fromDs).toBeGained, 1, 'what is still held can still be given')
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
      assert.equal(t.discarded + t.received, t.removed)
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

  test('an attribute let go of puts a full replica permanently out of reach', () => {
    // Everything the participant still holds has been handed over, and the
    // digital self is still not them.
    const attrs = [attr('ds'), attr('ds'), attr('ds'), attr('gone')]
    assert.equal(tally(attrs).toBeGained, 0, 'nothing left to give')
    assert.ok(reconstruction(attrs) < 1, 'yet the twin is not complete')
    assert.equal(reconstruction(attrs), 0.75)
  })

  test('taking an attribute off the twin lowers it again', () => {
    const a = attr('ds')
    assert.equal(reconstruction([a]), 1)
    assert.equal(reconstruction([{ ...a, side: 'gone' as const }]), 0)
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

describe('what the system takes each round, with a fixed range', () => {
  const config = {
    ...DEFAULT_CONFIG,
    fullyRandomTransfer: false,
    transferPerRoundMin: 3,
    transferPerRoundMax: 5,
  }

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

  test('never reaches back for something already on the digital self', () => {
    const fresh = attr('ys')
    const attrs = [attr('ds'), fresh, attr('ds')]
    const rng = makeRng(23)
    for (let i = 0; i < 200; i++) {
      assert.deepEqual(pickSystemTransfer(rng, attrs, config), [fresh.id])
    }
  })

  test('stops once the digital self has everything', () => {
    const attrs = Array.from({ length: 5 }, () => attr('ds'))
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
    const { x, y } = placeChip(makeRng(37), 'ys', 300, crowd, { attempts: 20 })
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
    const config = {
      ...DEFAULT_CONFIG,
      fullyRandomTransfer: false,
      transferPerRoundMin: 0,
      transferPerRoundMax: 0,
    }
    const attrs = Array.from({ length: 10 }, () => attr('ys'))
    for (let seed = 1; seed <= 20; seed++) {
      assert.deepEqual(pickSystemTransfer(makeRng(seed), attrs, config), [])
    }
  })

  test('still takes something when the range allows it', () => {
    const config = {
      ...DEFAULT_CONFIG,
      fullyRandomTransfer: false,
      transferPerRoundMin: 0,
      transferPerRoundMax: 3,
    }
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

describe('chips that belong together land together', () => {
  const boxesFor = (placed: { x: number; y: number }[], w = 300) =>
    placed.map((p) => ({ ...p, w, h: CHIP_H }))

  const placeGroup = (side: 'ys' | 'ds', group: number, count: number, seed = 5) => {
    const rng = makeRng(seed)
    const placed: { x: number; y: number }[] = []
    for (let i = 0; i < count; i++) {
      placed.push(placeChip(rng, side, 300, boxesFor(placed), { group }))
    }
    return placed
  }

  const spread = (placed: { x: number; y: number }[]) => {
    let worst = 0
    for (const a of placed) {
      for (const b of placed) worst = Math.max(worst, Math.hypot(a.x - b.x, a.y - b.y))
    }
    return worst
  }

  test('answers to one prompt sit near each other', () => {
    for (const side of ['ys', 'ds'] as const) {
      const placed = placeGroup(side, 0, 5)
      assert.ok(
        spread(placed) < 900,
        `${side}: five answers to one prompt spread ${Math.round(spread(placed))} units apart`,
      )
    }
  })

  test('a batch the digital self receives arrives together', () => {
    const placed = placeGroup('ds', 2, 6)
    assert.ok(spread(placed) < 900, `spread ${Math.round(spread(placed))}`)
  })

  test('different prompts land in different places', () => {
    const centres = Array.from({ length: 8 }, (_, g) => clusterCentre('ys', g))
    for (let i = 0; i < centres.length; i++) {
      for (let j = i + 1; j < centres.length; j++) {
        const d = Math.hypot(centres[i].x - centres[j].x, centres[i].y - centres[j].y)
        assert.ok(d > 200, `groups ${i} and ${j} are only ${Math.round(d)} units apart`)
      }
    }
  })

  test('a group past the end of the lattice does not sit on an earlier one', () => {
    const seen = Array.from({ length: 24 }, (_, g) => clusterCentre('ys', g))
    for (let i = 0; i < seen.length; i++) {
      for (let j = i + 1; j < seen.length; j++) {
        const d = Math.hypot(seen[i].x - seen[j].x, seen[i].y - seen[j].y)
        assert.ok(d > 40, `groups ${i} and ${j} coincide`)
      }
    }
  })

  test('every cluster centre is inside its own zone', () => {
    for (const side of ['ys', 'ds'] as const) {
      for (let g = 0; g < 30; g++) {
        const c = clusterCentre(side, g)
        assert.ok(c.x >= ZONE[side].x0 && c.x <= ZONE[side].x1, `${side} group ${g} x`)
        assert.ok(c.y >= ZONE[side].y0 && c.y <= ZONE[side].y1, `${side} group ${g} y`)
      }
    }
  })

  test('a grouped chip still lands inside the zone', () => {
    const rng = makeRng(3)
    for (const side of ['ys', 'ds'] as const) {
      for (let g = 0; g < 12; g++) {
        for (let i = 0; i < 20; i++) {
          const { x, y } = placeChip(rng, side, 900, [], { group: g })
          assert.ok(x >= ZONE[side].x0 - 0.001 && y >= ZONE[side].y0 - 0.001)
          assert.ok(y + CHIP_H <= ZONE[side].y1 + 0.001)
          assert.ok(x + 900 <= ZONE[side].x1 + 0.001)
        }
      }
    }
  })
})

describe('how much the digital self takes', () => {
  const attrs = (n: number) => Array.from({ length: n }, () => attr('ys'))

  test('is fully random by default: sometimes none, sometimes all', () => {
    const config = { ...DEFAULT_CONFIG }
    assert.equal(config.fullyRandomTransfer, true)
    const held = attrs(8)
    const counts = new Set<number>()
    const rng = makeRng(11)
    for (let i = 0; i < 600; i++) counts.add(pickSystemTransfer(rng, held, config).length)
    assert.ok(counts.has(0), 'never took none')
    assert.ok(counts.has(8), 'never took all of them')
    assert.ok(counts.size >= 7, `only saw ${counts.size} different amounts`)
    assert.ok(Math.max(...counts) <= 8, 'took more than the participant holds')
  })

  test('spans the whole range rather than hugging the middle', () => {
    const held = attrs(10)
    const rng = makeRng(13)
    const seen = new Set<number>()
    for (let i = 0; i < 800; i++) seen.add(pickSystemTransfer(rng, held, DEFAULT_CONFIG).length)
    for (let n = 0; n <= 10; n++) assert.ok(seen.has(n), `never took exactly ${n}`)
  })

  test('honours the fixed range when the facilitator turns randomness off', () => {
    const config = {
      ...DEFAULT_CONFIG,
      fullyRandomTransfer: false,
      transferPerRoundMin: 3,
      transferPerRoundMax: 5,
    }
    const held = attrs(20)
    const rng = makeRng(17)
    for (let i = 0; i < 300; i++) {
      const n = pickSystemTransfer(rng, held, config).length
      assert.ok(n >= 3 && n <= 5, `took ${n}`)
    }
  })

  test('never takes what the digital self already has, however random', () => {
    const gone = attr('ds')
    const held = attr('ys')
    const attrs = [gone, held]
    const rng = makeRng(19)
    for (let i = 0; i < 300; i++) {
      for (const id of pickSystemTransfer(rng, attrs, DEFAULT_CONFIG)) {
        assert.equal(id, held.id)
      }
    }
  })
})
