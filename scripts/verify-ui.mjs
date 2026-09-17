import { spawn } from 'node:child_process'
import puppeteer from 'puppeteer-core'

// 一条命令跑完整回归：自检 Monaco 是否真的挂载、布局对调是否只靠 CSS、
// 偏好是否持久化、分隔条拖拽、以及运行全部测试的真实结果。
const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
]
const CHROME = process.env.CHROME_PATH ?? CHROME_CANDIDATES[0]
const PORT = Number(process.env.VERIFY_PORT ?? 5199)
const APP_URL = `http://localhost:${PORT}/`
const ROOT = new URL('../', import.meta.url).pathname
const SHOTS = process.env.SHOT_DIR ?? ROOT

const server = spawn(
  process.execPath,
  [`${ROOT}node_modules/vite/bin/vite.js`, 'dev', '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
)

function waitForServer() {
  return new Promise((resolve, reject) => {
    const onData = (chunk) => {
      if (String(chunk).includes('Local')) {
        cleanup()
        resolve()
      }
    }
    const onExit = (code) => {
      cleanup()
      reject(new Error(`dev server 意外退出 code=${code}`))
    }
    function cleanup() {
      server.stdout.off('data', onData)
      server.off('exit', onExit)
    }
    server.stdout.on('data', onData)
    server.once('exit', onExit)
    setTimeout(() => {
      cleanup()
      reject(new Error('dev server 启动超时'))
    }, 30000).unref()
  })
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const probe = (page) =>
  page.evaluate(() => {
    const rect = (selector) => {
      const el = document.querySelector(selector)
      if (!el) return null
      const box = el.getBoundingClientRect()
      return { x: Math.round(box.x), w: Math.round(box.width) }
    }
    const text = (selector) => document.querySelector(selector)?.textContent.trim() ?? null
    return {
      topbarHeight: Math.round(document.querySelector('.topbar')?.getBoundingClientRect().height ?? -1),
      flexDirection: getComputedStyle(document.querySelector('.workspace')).flexDirection,
      editorPane: rect('.pane--editor'),
      testsPane: rect('.pane--tests'),
      minimapVisible: Boolean(document.querySelector('.minimap')),
      editorText: document.querySelector('.view-lines')?.textContent ?? '',
      codeLineCount: document.querySelectorAll('.view-line').length,
      cardCount: document.querySelectorAll('.card').length,
      stdinBoxes: document.querySelectorAll('.card textarea.ta').length,
      readonlyOuts: document.querySelectorAll('.card pre.out').length,
      verdict: text('.verdict'),
      badges: [...document.querySelectorAll('.badge')].map((el) => el.textContent.trim()),
      outputs: [...document.querySelectorAll('.card pre.out')].map((el) => el.textContent.trim().slice(0, 60)),
      hints: [...document.querySelectorAll('.card .hint')].map((el) => el.textContent.trim()),
      metrics: [...document.querySelectorAll('.card .metric')].map((el) => el.textContent.trim()),
      horizontalScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
      storedPanel: localStorage.getItem('cph.panelPosition'),
      storedShare: localStorage.getItem('cph.editorShare'),
      panelTitle: text('.panel__title'),
    }
  })

const results = []
const logs = []

function record(name, ok, detail) {
  results.push({ step: name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(detail).slice(0, 460)}`)
}

async function step(name, fn) {
  try {
    await fn()
  } catch (error) {
    record(name, false, { error: String(error?.message ?? error).slice(0, 300) })
    throw error
  }
}

await waitForServer()

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})

let exitCode = 0
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1680, height: 1000, deviceScaleFactor: 1 })
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      logs.push(`[${msg.type()}] ${String(msg.text()).slice(0, 200)}`)
    }
  })
  page.on('pageerror', (err) => logs.push(`[pageerror] ${String(err.message).slice(0, 240)}`))

  await step('A. 首屏：Monaco 与评测面板真实渲染', async () => {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForSelector('.monaco-editor', { visible: true, timeout: 40000 })
    await page.waitForSelector('.card', { visible: true, timeout: 20000 })
    const state = await probe(page)
    await page.screenshot({ path: `${SHOTS}cph-1-default-right.png` })
    const ok =
      state.topbarHeight === 50 &&
      state.codeLineCount > 3 &&
      state.editorText.includes('include') &&
      !state.minimapVisible &&
      state.flexDirection === 'row' &&
      state.cardCount === 2 &&
      state.stdinBoxes === 4 &&
      state.readonlyOuts === 2 &&
      state.storedPanel === 'right' &&
      !state.horizontalScroll
    record('A. 首屏：Monaco 与评测面板真实渲染', ok, state)
    process.stdout.write('')
  })

  await step('B. 切换布局：仅 flex-direction 变化，DOM 不重建', async () => {
    const monacoBefore = await page.evaluate(() => {
      const el = document.querySelector('.monaco-editor')
      el.dataset.marker = 'keep-me'
      return el.dataset.marker
    })
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.topbar button')].find((b) =>
        (b.getAttribute('title') ?? '').includes('换到左侧'),
      )
      btn?.click()
    })
    await wait(1000)
    const state = await probe(page)
    const markerAlive = await page.evaluate(() => document.querySelector('.monaco-editor')?.dataset.marker)
    await page.screenshot({ path: `${SHOTS}cph-2-swapped-left.png` })
    const ok =
      state.flexDirection === 'row-reverse' &&
      state.testsPane.x < state.editorPane.x &&
      state.storedPanel === 'left' &&
      markerAlive === monacoBefore &&
      state.codeLineCount > 3
    record('B. 切换布局：仅 flex-direction 变化，DOM 不重建', ok, {
      ...state,
      monacoInstanceReused: markerAlive === monacoBefore,
    })
  })

  await step('C. 刷新后偏好仍在 localStorage', async () => {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.monaco-editor', { visible: true, timeout: 40000 })
    await wait(600)
    const state = await probe(page)
    await page.screenshot({ path: `${SHOTS}cph-3-persisted-left.png` })
    record('C. 刷新后偏好仍在 localStorage', state.storedPanel === 'left' && state.flexDirection === 'row-reverse', {
      storedPanel: state.storedPanel,
      flexDirection: state.flexDirection,
    })
  })

  await step('D. 拖动分隔条改变两栏比例', async () => {
    const before = await probe(page)
    const handle = await page.waitForSelector('.splitter', { timeout: 10000 })
    const box = await handle.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 220, box.y + box.height / 2, { steps: 16 })
    await page.mouse.up()
    await wait(400)
    const after = await probe(page)
    await page.screenshot({ path: `${SHOTS}cph-4-resized.png` })
    const grew = after.testsPane.w < before.testsPane.w - 100
    record('D. 拖动分隔条改变两栏比例', grew, {
      beforeTests: before.testsPane,
      afterTests: after.testsPane,
      storedShare: after.storedShare,
    })
  })

  await step('E. 添加用例并运行全部（真实评测）', async () => {
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        b.textContent.includes('添加测试样例'),
      )
      btn?.click()
    })
    await wait(400)
    const added = await page.evaluate(() => document.querySelectorAll('.card').length)
    await page.evaluate(() => document.querySelector('.primary')?.click())
    await page.waitForFunction(
      () => document.querySelector('.verdict')?.textContent.trim() !== '运行中',
      { timeout: 90000, polling: 500 },
    )
    const state = await probe(page)
    await page.screenshot({ path: `${SHOTS}cph-5-run-all.png` })
    record('E. 添加用例并运行全部（真实评测）', added === 3 && state.badges.length === 3, {
      cardsAfterAdd: added,
      verdict: state.verdict,
      badges: state.badges,
      metrics: state.metrics,
      outputs: state.outputs,
      hints: state.hints,
    })
  })

  await step('F. 语言切到 Python 并重新运行', async () => {
    await page.evaluate(() => {
      const select = document.querySelector('.topbar select')
      select.value = 'python'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await wait(900)
    const pythonLoaded = await page.evaluate(() =>
      document.querySelector('.view-lines')?.textContent.includes('def solve'),
    )
    await page.screenshot({ path: `${SHOTS}cph-6-python.png` })
    record('F. 语言切到 Python 并重新运行', Boolean(pythonLoaded), { pythonLoaded })
  })

  console.log(`\n控制台告警/错误: ${JSON.stringify(logs.slice(0, 12), null, 1)}`)
  console.log(`localStorage: panel=${await page.evaluate(() => localStorage.getItem('cph.panelPosition'))}`)
  if (results.some((item) => !item.ok)) exitCode = 1
} catch (error) {
  console.log(`运行中断: ${String(error?.message ?? error).slice(0, 300)}`)
  console.log(JSON.stringify({ results, logs: logs.slice(0, 12) }, null, 1))
  exitCode = 1
} finally {
  await browser.close()
  server.kill('SIGTERM')
}

process.exit(exitCode)
