/**
 * Drives the canvas in a real browser and asserts the interaction properties a
 * session depends on — the ones a unit test cannot reach, because they only
 * exist once GSAP Draggable, the stage transform and the real font are in play.
 *
 *   node scripts/check-interaction.mjs [baseUrl]
 */
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://localhost:3000'
const failures = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? `  — ${detail}` : ''}`)
  if (!ok) failures.push(name)
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1792, height: 1120 } })
page.on('pageerror', (e) => check('no page errors', false, e.message))

await page.goto(`${BASE}/?seconds=600&rounds=8`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.fill('input[aria-label="Enter your name"]', 'Interaction Check')
await page.keyboard.press('Enter')
await page.waitForSelector('button[tabindex="0"]:has-text("START")')

/* --- the endings are inert until a session is running --------------------- */
const idle = await page.evaluate(() => {
  const el = document.querySelector('.verdict-reject')
  return { disabled: el.disabled, pointerEvents: getComputedStyle(el).pointerEvents }
})
check(
  'the verdict buttons cannot be triggered before START',
  idle.disabled && idle.pointerEvents === 'none',
  JSON.stringify(idle),
)

await page.click('button:has-text("START")')
await page.waitForTimeout(500)

const words = ['curly hair', 'narrow face', 'athletic', 'listens first', 'restless']
for (const w of words) {
  await page.fill('input[aria-label="Type a word or phrase"]', w)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(250)
}
await page.waitForTimeout(1400)

/* --- the measurer uses the family the chips actually render in ------------ */
const font = await page.evaluate(() => {
  const family = getComputedStyle(document.documentElement).getPropertyValue('--font-sora').trim()
  const chip = getComputedStyle(document.querySelector('.chip')).fontFamily
  return { family, chip, matches: !!family && chip.includes(family.split(',')[0].replace(/["']/g, '')) }
})
check('chip widths are measured against the rendered font', font.matches, font.family)

/* --- a plain click hands a chip over --------------------------------------- */
const dsBefore = await page.evaluate(() => document.querySelectorAll('.chip[data-side="ds"]').length)
const clickBox = await page.locator('.chip[data-side="ys"]').first().boundingBox()
await page.mouse.click(clickBox.x + clickBox.width / 2, clickBox.y + clickBox.height / 2)
await page.waitForTimeout(1600)
const dsAfter = await page.evaluate(() => document.querySelectorAll('.chip[data-side="ds"]').length)
check('a click hands a chip to the digital self', dsAfter === dsBefore + 1, `${dsBefore} -> ${dsAfter}`)

/* --- a thrown chip records where it settles, not where it was released ---- */
const chip = page.locator('.chip[data-side="ys"]').first()
const start = await chip.boundingBox()
await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
await page.mouse.down()
for (let i = 1; i <= 10; i++) {
  await page.mouse.move(start.x + start.width / 2 - i * 12, start.y + start.height / 2)
  await page.waitForTimeout(8)
}
const released = await chip.boundingBox()
await page.mouse.up()
await page.waitForTimeout(1500)
const settled = await chip.boundingBox()
const drift = Math.hypot(settled.x - released.x, settled.y - released.y)

const stored = await page.evaluate(async () => {
  const res = await fetch('/api/sessions')
  const { sessions } = await res.json()
  const s = sessions[0]
  const full = await (await fetch(`/api/export?session=${encodeURIComponent(s.id)}`)).json()
  return full.attributes.map((a) => ({ id: a.id, x: a.x, y: a.y, side: a.side }))
})
const onScreen = await page.evaluate(() => {
  const el = document.querySelector('.chip[data-side="ys"]')
  const m = new DOMMatrix(getComputedStyle(el).transform)
  return { x: m.m41, y: m.m42, text: el.textContent }
})
const match = stored.find((a) => Math.hypot(a.x - onScreen.x, a.y - onScreen.y) < 3)
check(
  'the position stored for a thrown chip is where it came to rest',
  !!match,
  `drifted ${Math.round(drift)}px after release; on screen (${Math.round(onScreen.x)}, ${Math.round(onScreen.y)})`,
)

/* --- nothing auto-placed can sit on a control ------------------------------ */
const overlaps = await page.evaluate(() => {
  const rect = (s) => document.querySelector(s)?.getBoundingClientRect()
  const hits = (a, b) => a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  const controls = ['.verdict-reject', '.verdict-accept', '.inputbar'].map(rect)
  const chips = [...document.querySelectorAll('.chip')].map((e) => e.getBoundingClientRect())
  return chips.filter((c) => controls.some((k) => hits(c, k))).length
})
check('no chip overlaps a control', overlaps === 0, `${overlaps} overlapping`)

const atControls = await page.evaluate(() =>
  ['.verdict-reject', '.verdict-accept', '.inputbar'].map((s) => {
    const r = document.querySelector(s).getBoundingClientRect()
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return el?.closest(s) ? 'reachable' : 'blocked'
  }),
)
check('every control is reachable at its centre', atControls.every((v) => v === 'reachable'), atControls.join(', '))

await browser.close()
console.log(failures.length ? `\n${failures.length} problem(s)` : '\nall interaction checks passed')
process.exit(failures.length ? 1 : 0)
