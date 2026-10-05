/* 临时探针：读行号的实际渲染颜色。用完即删。 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import puppeteer from 'puppeteer-core'

const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ROOT = new URL('../', import.meta.url).pathname
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const port = await new Promise((resolve, reject) => {
  const probe = createServer()
  probe.once('error', reject)
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address()
    probe.close(() => resolve(port))
  })
})

const server = spawn(
  process.execPath,
  [`${ROOT}node_modules/vite/bin/vite.js`, 'dev', '--port', String(port), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
)
await new Promise((resolve, reject) => {
  const onData = (c) => String(c).includes('Local') && (server.stdout.off('data', onData), resolve())
  server.stdout.on('data', onData)
  server.once('exit', (code) => reject(new Error(`vite exited ${code}`)))
  setTimeout(() => reject(new Error('vite timeout')), 30000).unref()
})

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900 })
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('.margin-view-overlays .line-numbers', { timeout: 30000 })
  await wait: {
  }
  await wait(1200)
  await page.click('.editor-pane__host')
  await wait(500)

  console.log(
    JSON.stringify(
      await page.evaluate(() => {
        const colorOf = (sel) => {
          const el = document.querySelector(sel)
          return el ? getComputedStyle(el).color : '(none)'
        }
        return {
          theme: document.documentElement.dataset.theme ?? '(unset = dark)',
          lineCount: document.querySelectorAll('.margin-view-overlays .line-numbers').length,
          inactive: colorOf('.margin-view-overlays .line-numbers:not(.active-line-number)'),
          active: colorOf('.margin-view-overlays .active-line-number'),
          cursorLineBorder: (() => {
            const el = document.querySelector('.view-overlays .current-line-exact')
            return el ? getComputedStyle(el).borderTopColor : '(none)'
          })(),
        }
      }),
    ),
  )
} finally {
  await browser.close()
  server.kill()
}
