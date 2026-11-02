import { execFileSync, spawn } from 'node:child_process'
import * as fs from 'node:fs'
import { createServer } from 'node:net'
import * as path from 'node:path'
import puppeteer from 'puppeteer-core'

/**
 * 生成浏览器扩展商店的截图（Edge Add-ons 与 Chrome Web Store 的截图规格都是 1280×800）。
 *
 * 【为什么不真装扩展】扩展在浏览器 UI 层（工具栏图标）与操作系统层（系统通知）上画画，
 * 页面内的自动化截不到那两处 —— 那两张只能真机手拍（见 CC-for-Web/SUBMISSION-EDGE.md
 * 第 5.1 节）。本脚本只产 **站点这一张**：题目被抓进工作区之后长什么样。
 *
 * 【为什么走 postMessage 而不是伪造界面】商店截图最怕的是「图上是摆拍、装上去不一样」。
 * 这里投递的是**扩展真的会发的那条消息**（cp-task + 真实题目 JSON），走站点自己的
 * useCompanionBridge → importProblem 落盘链路 —— 树、编辑器页签、评测面板都是真状态。
 * 契约见 src/composables/useCompanionBridge.js 顶部那段，改了协议这里要一起改。
 *
 * 【为什么自己起 dev server】与 verify-ui.mjs 同一套路：随机挑空闲端口，跑完自动关，
 * 不跟常驻的 `npm run dev` 抢 5199。代价是两个脚本各自抄了一份 freePort / waitForServer
 * —— 刻意不抽公共模块：verify-ui.mjs 是回归基线，为了少抄 40 行去动它不划算。
 *
 * 产出（都在 .gitignore 里，是本地物料不是站点内容）：
 *   screenshots/store-workspace-<语言>-<面板>.png
 *
 * 用法：node scripts/generate-store-screenshots.mjs
 */

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
]
const CHROME = process.env.CHROME_PATH ?? CHROME_CANDIDATES[0]

/** 商店要求的截图尺寸（Edge 只收 1280×800 或 640×480） */
const SHOT_W = 1280
const SHOT_H = 800
/** 2 倍渲染再缩回 1280×800：文字边缘比 1 倍直出锐利一档 */
const SHOT_SCALE = 2

const ROOT = new URL('../', import.meta.url).pathname
const OUT_DIR = path.join(ROOT, 'screenshots')

/** 截图用哪道题：样例短、行数少，缩到 1280 宽之后评测面板里读得清 */
const PROBLEM = {
  name: 'Next Round',
  group: 'Codeforces Round 146 (Div. 2)',
  url: 'https://codeforces.com/problemset/problem/158/A',
  interactive: false,
  memoryLimit: 256,
  timeLimit: 2000,
  testType: 'single',
  input: { type: 'stdin' },
  output: { type: 'stdout' },
  languages: { java: { mainClass: 'Main', taskClass: 'Main' } },
  batch: { id: '2f1c6a52-1d3a-4a55-9a4e-6b8f0f2c7d31', size: 1 },
  tests: [
    { input: '8 5\n10 9 8 7 7 7 5 5\n', output: '6\n' },
    { input: '4 2\n0 0 0 0\n', output: '0\n' },
  ],
}

/**
 * 编辑器里要显示的正解。
 *
 * 导入时文件正文是模板（那是个 a+b 骨架），与这道题对不上；截图要的是「正常在用」的样子，
 * 所以直接把这个文件改成题目的解。写入走 Monaco 自己的 API —— 不合成键盘事件，
 * 免去自动补括号 / 自动缩进把代码搞乱。
 */
const SOLUTION = `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, k;
    cin >> n >> k;

    vector<int> score(n);
    for (int &x : score) cin >> x;

    int cutoff = score[k - 1];
    int advanced = 0;
    for (int x : score) {
        if (x >= cutoff && x > 0) ++advanced;
    }

    cout << advanced << '\\n';
    return 0;
}
`

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
}

const PORT = Number(process.env.SHOT_PORT ?? 0) || (await freePort())
const APP_URL = `http://localhost:${PORT}/`

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

/** 当前可见的那个侧栏面板的 id（'explorer' | 'tests'）。两份 DOM 里只有一份有布局盒 */
const visiblePanel = (page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('.sidebar__panel')].find((el) => el.getClientRects().length > 0)
        ?.dataset.panel ?? '',
  )

/**
 * 点侧栏页头那枚胶囊翻到另一个面板。
 *
 * 不能 `page.click('.sidebar-switcher__pill')`：侧栏两个面板是 v-show 双份 DOM，
 * page.click 抓的是文档里第一个匹配，多半落在藏起来的那个上，报
 * 「Node is either not clickable or not an Element」。所以取可见面板里的坐标，打真实鼠标点击。
 */
async function clickSwitcherPill(page) {
  const point = await page.evaluate(() => {
    const panel = [...document.querySelectorAll('.sidebar__panel')].find(
      (el) => el.getClientRects().length > 0,
    )
    const pill = panel?.querySelector('.sidebar-switcher__pill')
    if (!pill) return null
    const box = pill.getBoundingClientRect()
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  })
  if (!point) throw new Error('找不到侧栏胶囊开关')
  await page.mouse.click(point.x, point.y)
}

/** 缩回商店要求的 1280×800。sips 是 macOS 自带的，别的平台上保留 2 倍原图 */
function downscale(file) {
  if (process.platform !== 'darwin') {
    console.warn(`  跳过缩放（非 macOS）：${file} 仍是 ${SHOT_W * SHOT_SCALE}×${SHOT_H * SHOT_SCALE}`)
    return
  }
  execFileSync('sips', ['-z', String(SHOT_H), String(SHOT_W), file], { stdio: 'ignore' })
}

/** 打印落盘尺寸，好一眼看出商店要求的那两个数字对不对 */
function pngSize(file) {
  const buffer = fs.readFileSync(file)
  return `${buffer.readUInt32BE(16)}×${buffer.readUInt32BE(20)}`
}

/**
 * 一个语言、一个面板出一张图。
 *
 * 每张图用一个**全新的隐身上下文**：站点把「当前停在哪一栏」「上次打开的文件」都落在
 * localStorage / IndexedDB 里，同一个上下文里连着截第二张时会继承上一张的状态
 * （实测踩过：第二张切到了评测样例，第三张一进来资源管理器是收起的，等 .tree-item__row
 * 可见永远等不到）。商店截图本来就该是首启的样子，隔离比逐个清理省事。
 *
 * @param {import('puppeteer-core').Browser} browser
 * @param {string} locale 'en' | 'zh-CN' —— 写进 localStorage 的 cp.uiLocale，站点据此定语言
 * @param {string} panel 'explorer' | 'tests'
 */
async function shoot(browser, locale, panel) {
  const context = await browser.createBrowserContext()
  const page = await context.newPage()

  // 在页面脚本跑起来之前种存档：与手动切完语言后落盘的是同一份数据 ——
  // 键名见 i18n/index.js 的 LOCALE_STORAGE_KEY，值是 JSON 字符串（带引号，读侧走 JSON.parse），
  // 写成裸 `en` 会被当成「值认不出来」而退回跟随浏览器语言
  await page.evaluateOnNewDocument((value) => {
    try {
      window.localStorage.setItem('cp.uiLocale', JSON.stringify(value))
    } catch {
      /* 隐私模式：退回跟随浏览器语言 */
    }
  }, locale)

  await page.setViewport({ width: SHOT_W, height: SHOT_H, deviceScaleFactor: SHOT_SCALE })
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.monaco-editor .view-line', { visible: true, timeout: 60000 })

  // 【别省这一步】编辑器画出行 ≠ VFS 就绪：VFS 的根节点是在 init() 里索引的，
  // 而界面会先把首启文件渲染出来。抢在 init 之前投递，ensureDirectory 会在
  // 「父目录不存在：/」上直接失败（实测踩过，症状是树里什么都没多出来）。
  // 树里出现第一行才是「VFS 真的能落盘了」。
  await page.waitForSelector('.tree-item__row', { visible: true, timeout: 60000 })
  await wait(500)

  // 投递题目：扩展真发的那条消息，taskId 只用于去重
  await page.evaluate((task) => {
    window.postMessage(
      {
        source: 'competitive-companion',
        type: 'cp-task',
        taskId: 'store-screenshot',
        payload: JSON.stringify(task),
      },
      window.location.origin,
    )
  }, PROBLEM)

  // 树里出现这个文件 = 导入真的落盘了（而不是只看页签变了）
  await page.waitForFunction(
    (name) =>
      [...document.querySelectorAll('.tree-item__row')].some((el) => el.textContent.includes(name)),
    { timeout: 30000 },
    PROBLEM.name,
  )

  // 当前页签必须是这道题，否则下面 setValue 会写进别的文件
  const activeTab = await page.evaluate(
    () => document.querySelector('.editor-tabs__item--active')?.textContent ?? '',
  )
  if (!activeTab.includes(PROBLEM.name)) {
    throw new Error(`导入后活跃页签不是这道题，实际是「${activeTab.trim()}」`)
  }

  await page.evaluate(async (code) => {
    const { monaco } = await import('/src/monaco-setup.js')
    // 全站共用一个编辑器实例（换页签是换 model），所以这里就是当前文件
    monaco.editor.getEditors()[0]?.setValue(code)
  }, SOLUTION)

  // 等自动保存把正文写回 VFS（默认开，防抖几百毫秒），免得截到「未保存」的中间态
  await wait(600)

  const current = await visiblePanel(page)
  if (current !== panel) {
    await clickSwitcherPill(page)
    // 胶囊高亮滑过去 260ms + 图标点亮 90ms 延迟，等动画收干净再截
    await wait(500)
  }

  const file = path.join(OUT_DIR, `store-workspace-${locale === 'en' ? 'en' : 'zh'}-${panel}.png`)
  await page.screenshot({ path: file })
  downscale(file)
  console.log(`  ${path.relative(ROOT, file)} ${pngSize(file)}`)

  await context.close()
}

fs.mkdirSync(OUT_DIR, { recursive: true })

try {
  await waitForServer()
  console.log(`dev server 已就绪：${APP_URL}`)

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox'],
  })

  try {
    for (const locale of ['en', 'zh-CN']) {
      for (const panel of ['explorer', 'tests']) {
        console.log(`生成截图：${locale} / ${panel}`)
        await shoot(browser, locale, panel)
      }
    }
  } finally {
    await browser.close()
  }
} finally {
  server.kill()
}
