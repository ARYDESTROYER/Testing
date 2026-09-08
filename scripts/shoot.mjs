/**
 * Drives a full session in a real browser and writes a screenshot per state.
 *   node scripts/shoot.mjs [outDir] [baseUrl]
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const OUT = process.argv[2] ?? 'screenshots'
const BASE = process.argv[3] ?? 'http://localhost:3000'
const VIEWPORT = { width: 1792, height: 1120 }

mkdirSync(OUT, { recursive: true })

const shots = []
let n = 0
const shot = async (page, name, waitMs = 700) => {
  await page.waitForTimeout(waitMs)
  const file = path.join(OUT, `${String(++n).padStart(2, '0')}-${name}.png`)
  await page.screenshot({ path: file })
  shots.push(file)
  console.log('  ▸', file)
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--force-color-profile=srgb', '--font-render-hinting=none'],
})
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 })

page.on('console', (m) => {
  if (m.type() === 'error') console.log('  ! console:', m.text())
})
page.on('pageerror', (e) => console.log('  ! pageerror:', e.message))

// Short rounds so a whole session fits in one pass.
await page.goto(`${BASE}/?seconds=8&rounds=4&min=2&max=3`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1400)
await shot(page, 'name-gate', 400)

await page.fill('input[aria-label="Enter your name"]', 'Ruchira Sharma')
await shot(page, 'name-typed', 300)
await page.keyboard.press('Enter')
await page.waitForTimeout(1800)
await shot(page, 'ready', 400)

await page.click('button:has-text("START")')
await page.waitForTimeout(900)

const words = [
  'curly hair',
  'narrow face',
  'I can game pretty well',
  'athletic',
  'sharp jaw',
  'tired eyes',
  'quiet hands',
  'restless',
  'listens first',
  'reads a room fast',
  'stubborn about fairness',
  'laughs too loud',
]

for (let i = 0; i < 5; i++) {
  await page.fill('input[aria-label="Type a word or phrase"]', words[i])
  await page.keyboard.press('Enter')
  await page.waitForTimeout(320)
}
await shot(page, 'writing', 900)

// Drag one chip onto the digital self by hand, to prove the interaction works.
const chip = page.locator('.chip[data-side="ys"]').first()
const box = await chip.boundingBox()
const dsFigure = page.locator('.figure-wrap').nth(1)
const dsBox = await dsFigure.boundingBox()
if (box && dsBox) {
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  for (let i = 1; i <= 18; i++) {
    await page.mouse.move(
      box.x + box.width / 2 + ((dsBox.x + dsBox.width / 2 - box.x - box.width / 2) * i) / 18,
      box.y + box.height / 2 + ((dsBox.y + dsBox.height / 2 - box.y - box.height / 2) * i) / 18,
    )
    await page.waitForTimeout(16)
  }
  await shot(page, 'dragging', 120)
  await page.mouse.up()
}
await shot(page, 'after-drag', 1500)

// Let the round roll over so the system takes its share and the cards appear.
await page.waitForSelector('.modal', { timeout: 20000 }).catch(() => {})
await shot(page, 'modal-transferred', 500)
await page.keyboard.press('Enter')
await page.waitForTimeout(900)
await shot(page, 'modal-drag-coach', 400)
await page.click('.pill-done').catch(() => {})
await page.waitForTimeout(900)

for (let i = 5; i < words.length; i++) {
  await page.fill('input[aria-label="Type a word or phrase"]', words[i]).catch(() => {})
  await page.keyboard.press('Enter')
  await page.waitForTimeout(280)
}
await shot(page, 'mid-session', 1200)

// Run out the remaining rounds so the digital self fills in.
const deadline = Date.now() + 45000
while (Date.now() < deadline) {
  const closed = await page.evaluate(
    () => !!document.querySelector('input[aria-label="Type a word or phrase"]:disabled'),
  )
  if (closed) break
  const modal = await page.$('.modal')
  if (modal) {
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)
    await page.click('.pill-done').catch(() => {})
  }
  await page.waitForTimeout(700)
}
await shot(page, 'writing-closed', 1400)

await page.click('.verdict-accept')
await shot(page, 'end-card', 1600)

await page.goto(`${BASE}/data`, { waitUntil: 'networkidle' })
await shot(page, 'dashboard', 900)

await browser.close()
console.log(`\n${shots.length} screenshots in ${OUT}`)
