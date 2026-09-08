/**
 * Runs the canvas at a range of display sizes and reports whether anything
 * overflows, so a screen can be checked before a session is run on it.
 *
 *   node scripts/check-viewports.mjs [baseUrl] [outDir]
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const BASE = process.argv[2] ?? 'http://localhost:3000'
const OUT = process.argv[3] ?? 'screenshots/viewports'

const SIZES = [
  { w: 3840, h: 2160, name: '4k-16x9' },
  { w: 1920, h: 1080, name: 'desktop-16x9' },
  { w: 1440, h: 900, name: 'laptop-16x10' },
  { w: 1280, h: 1024, name: 'square-5x4' },
  { w: 1024, h: 1366, name: 'tablet-portrait' },
  { w: 390, h: 844, name: 'phone' },
]

mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--force-color-profile=srgb'],
})

let failures = 0

for (const size of SIZES) {
  const page = await browser.newPage({
    viewport: { width: size.w, height: size.h },
    deviceScaleFactor: 1,
  })
  page.on('pageerror', (e) => {
    failures++
    console.log(`  ! ${size.name} pageerror: ${e.message}`)
  })

  await page.goto(`${BASE}/?seconds=60&rounds=8`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await page.fill('input[aria-label="Enter your name"]', 'Layout Check')
  await page.keyboard.press('Enter')
  await page.waitForSelector('button[tabindex="0"]:has-text("START")', { timeout: 15000 })
  await page.click('button:has-text("START")')
  await page.waitForTimeout(600)

  for (const word of ['curly hair', 'I can game pretty well', 'restless']) {
    await page.fill('input[aria-label="Type a word or phrase"]', word)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)
  }
  await page.waitForTimeout(1200)
  await page.screenshot({ path: path.join(OUT, `${size.name}.png`) })

  const m = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    scrollH: document.documentElement.scrollHeight,
    innerW: window.innerWidth,
    innerH: window.innerHeight,
    scale: Number(getComputedStyle(document.querySelector('.viewport')).getPropertyValue('--s')),
    narrowNotice: !!document.querySelector('.narrow-notice'),
    chips: document.querySelectorAll('.chip').length,
  }))

  const overflows = m.scrollW > m.innerW + 1 || m.scrollH > m.innerH + 1
  if (overflows) failures++

  console.log(
    `${size.name.padEnd(16)} ${String(size.w).padStart(4)}x${String(size.h).padEnd(4)}` +
      `  scale ${m.scale.toFixed(3)}  chips ${m.chips}` +
      `  ${overflows ? 'OVERFLOWS' : 'no overflow'}` +
      `${m.narrowNotice ? '  (narrow-screen notice shown)' : ''}`,
  )

  await page.close()
}

await browser.close()
console.log(failures ? `\n${failures} problem(s)` : '\nall viewports clean')
process.exit(failures ? 1 : 0)
