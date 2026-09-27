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

// 快捷键里的主修饰键：macOS 是 ⌘、其他平台是 Ctrl（与 useShortcutManager 的 IS_MAC 同口径）
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

// 当前可见的那个面板的 data-panel（'explorer' | 'tests' | ''）
const visiblePanelId = (page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('.sidebar__panel')].find(
        (el) => el.getClientRects().length > 0,
      )?.dataset.panel ?? '',
  )

const probe = (page) =>
  page.evaluate(() => {
    const rect = (selector) => {
      const el = document.querySelector(selector)
      if (!el) return null
      const box = el.getBoundingClientRect()
      return { x: Math.round(box.x), w: Math.round(box.width) }
    }
    const text = (selector) => document.querySelector(selector)?.textContent.trim() ?? null
    // 偏好一律以 JSON 形式落在 localStorage（读出来是 '"left"' 这种带引号的字符串），
    // 不解析就永远比不中 'left' —— 这一条曾让 B / C 长期误报
    const stored = (key) => {
      try {
        return JSON.parse(localStorage.getItem(key))
      } catch {
        return null
      }
    }
    // .minimap 节点是常驻 DOM 的：Monaco 靠把宽度压到 0 来隐藏它，而不是移除节点。
    // 所以「可见性」只能看渲染宽度，看节点存在与否恒为真。
    const minimapWidth = Math.round(document.querySelector('.minimap')?.getBoundingClientRect().width ?? 0)
    // 「资源管理器 / 评测样例」的页头切换钮分别渲染在两个面板各自的页头里（v-show 藏着另一个面板），
    // 所以只认当前可见那个面板里的那一份；用 getClientRects 判可见（computed display 会误报）。
    const visiblePanel = () =>
      [...document.querySelectorAll('.sidebar__panel')].find((el) => el.getClientRects().length > 0)
    // 页头上可点的控件：胶囊那颗 toggle（`.sidebar-switcher__pill`）+ 设置那颗
    const visibleSwitcherTabs = () => [
      ...(visiblePanel()?.querySelectorAll('.sidebar-switcher__pill, .sidebar-switcher__tab') ?? []),
    ]
    // 胶囊里的两段：纯视觉指示，不可点，所以按它们自己的标记读「哪一段亮着」
    const visibleSegs = () => [...(visiblePanel()?.querySelectorAll('.sidebar-switcher__seg') ?? [])]
    return {
      // 顶栏已在 2026-09 整体删除（设置入口搬进侧栏页头、运行按钮搬进编辑器页签栏），
      // 这里守的是「它真的不回来了」以及工作区仍然贴顶
      topbarPresent: !!document.querySelector('.topbar'),
      workspaceTop: Math.round(document.querySelector('.workspace').getBoundingClientRect().top),
      flexDirection: getComputedStyle(document.querySelector('.workspace')).flexDirection,
      editorPane: rect('.pane--editor'),
      testsPane: rect('.pane--tests'),
      minimapVisible: minimapWidth > 0,
      minimapWidth,
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
      storedPanel: stored('cph.panelPosition'),
      storedShare: stored('cph.editorShare'),
      // 页头控件的 aria-label：胶囊那颗写的是「将要去的那一个」，设置那颗恒定
      sidebarTabs: visibleSwitcherTabs().map((el) => el.getAttribute('aria-label')),
      // 胶囊里被填亮的那一段。这条守的是「胶囊真的把当前面板画出来了」——
      // 早先那颗动作钮没有这个信号。读 data-current 而不是 class：class 是样式，
      // 这里要的是「哪一段被标记成当前」，换个样式名就不该让断言红。
      sidebarSegActive: visibleSegs()
        .filter((el) => el.dataset.current === 'true')
        .map((el) => el.dataset.panel),
      // 「现在停在哪个面板」认 .sidebar__panel 的 data-panel：比从 class 反推稳。
      sidebarPanel: visiblePanel()?.dataset.panel ?? '',
    }
  })

// 切到指定面板：整枚胶囊是一颗 toggle（2026-09-28 定稿），点它一次就是「翻到另一个」。
// 所以只有两个面板时这一下必然到位；先判当前面板是不是目标，是就不点（否则会翻过头）。
// 注意必须把 page 当参数传进来：const page 在下面的 try {} 块里，模块级函数引用不到它。
const showPanel = (page, id) =>
  page.evaluate((target) => {
    const panel = [...document.querySelectorAll('.sidebar__panel')].find(
      (el) => el.getClientRects().length > 0,
    )
    if (!panel || panel.dataset.panel === target) return
    panel.querySelector('.sidebar-switcher__pill')?.click()
  }, id)

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
    // 新契约（2026-09 统一侧边栏）：侧边栏默认停在「资源管理器」，用例卡在「评测样例」
    // 里、被 v-show 藏着（节点在 DOM 里，但不可见）。先确认页头那枚胶囊在，再点过去，
    // 卡片才是真的渲染出来——这也是切面板这条路本身的回归。
    // 切换入口已并入两个面板各自的页头，所以要落在当前可见的那个面板里找；
    // 它只画 logo 不写字，所以认 aria-label 而不是 textContent。
    // 面板那枚胶囊整体是一颗 toggle，文案是「将要去的那一个」；两段在它里面，
    // 所以这里钉住的是「胶囊在（且说的是去向）+ 两段都渲染出来了」。
    const tabs = await page.evaluate(() => {
      const panel = [...document.querySelectorAll('.sidebar__panel')].find(
        (el) => el.getClientRects().length > 0,
      )
      return [
        ...(panel?.querySelectorAll('.sidebar-switcher__pill, .sidebar-switcher__tab') ?? []),
      ].map((el) => el.getAttribute('aria-label'))
    })
    const segIds = await page.evaluate(() => {
      const panel = [...document.querySelectorAll('.sidebar__panel')].find(
        (el) => el.getClientRects().length > 0,
      )
      return [...(panel?.querySelectorAll('.sidebar-switcher__seg') ?? [])].map(
        (el) => el.dataset.panel,
      )
    })
    await showPanel(page, 'tests')
    await page.waitForSelector('.card', { visible: true, timeout: 20000 })
    const state = await probe(page)
    await page.screenshot({ path: `${SHOTS}cph-1-default-right.png` })
    const ok =
      tabs.join('/') === '切换到评测样例/设置' &&
      segIds.join('/') === 'explorer/tests' &&
      state.sidebarSegActive.join('/') === 'tests' &&
      state.sidebarPanel === 'tests' &&
      !state.topbarPresent &&
      state.workspaceTop === 0 &&
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

  await step('B. 切换布局：order 换序，DOM/Monaco 不重建', async () => {
    const monacoBefore = await page.evaluate(() => {
      const el = document.querySelector('.monaco-editor')
      el.dataset.marker = 'keep-me'
      return el.dataset.marker
    })
    // 新架构：换边入口在「设置」页签里。打开设置（侧栏页头的齿轮图标 → 编辑区里多一个页签）
    // → 选「左侧」→ 关掉页签回到代码。
    await page.evaluate(() => {
      const panel = [...document.querySelectorAll('.sidebar__panel')].find(
        (el) => el.getClientRects().length > 0,
      )
      const btn = [...(panel?.querySelectorAll('.sidebar-switcher__tab') ?? [])].find(
        (el) => el.getAttribute('aria-label') === '设置',
      )
      btn?.click()
    })
    await wait(500)
    const settingsShown = await page.evaluate(() => {
      const view = document.querySelector('.settings-view')
      const tab = [...document.querySelectorAll('.editor-tabs__item')].find((el) =>
        el.textContent.includes('设置'),
      )
      return {
        viewVisible: !!view && view.getBoundingClientRect().width > 0,
        tabActive: tab?.classList.contains('editor-tabs__item--active') ?? false,
        navItems: document.querySelectorAll('.settings-nav__item').length,
      }
    })
    // 设置是「目录 + 内容」两栏：默认停在「编辑器」那一组，换边入口在「布局」里。
    // 先点目录里的「布局」，右侧才会渲染出含「左侧」选项的那组设置。
    await page.evaluate(() => {
      const item = [...document.querySelectorAll('.settings-nav__item')].find((el) =>
        el.textContent.includes('布局'),
      )
      item?.click()
    })
    await wait(200)
    await page.evaluate(() => {
      const select = [...document.querySelectorAll('.settings-view select')].find((s) =>
        [...s.options].some((o) => o.textContent.trim() === '左侧'),
      )
      select.value = 'left'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await wait(600)
    await page.evaluate(() => {
      document.querySelector('.editor-tabs__close[aria-label="关闭设置"]')?.click()
    })
    await wait(300)
    const settingsClosed = await page.evaluate(() => {
      const view = document.querySelector('.settings-view')
      const tab = [...document.querySelectorAll('.editor-tabs__item')].find((el) =>
        el.textContent.includes('设置'),
      )
      return {
        viewVisible: !!view && view.getBoundingClientRect().width > 0,
        tabPresent: !!tab,
      }
    })
    const state = await probe(page)
    const markerAlive = await page.evaluate(() => document.querySelector('.monaco-editor')?.dataset.marker)
    await page.screenshot({ path: `${SHOTS}cph-2-swapped-left.png` })
    // 新契约：flex-direction 恒为 row；靠 order 让测试面板跑到左边；Monaco 实例与 DOM 不重建；
    // 设置是个页签（开时铺满编辑区、关时视图与页签一起消失）
    const ok =
      state.flexDirection === 'row' &&
      state.testsPane.x < state.editorPane.x &&
      state.storedPanel === 'left' &&
      markerAlive === monacoBefore &&
      state.codeLineCount > 3 &&
      settingsShown.viewVisible &&
      settingsShown.tabActive &&
      settingsShown.navItems === 8 &&
      !settingsClosed.tabPresent &&
      !settingsClosed.viewVisible
    record('B. 切换布局：order 换序，DOM/Monaco 不重建', ok, {
      ...state,
      monacoInstanceReused: markerAlive === monacoBefore,
      settingsShown,
      settingsClosed,
    })
  })

  await step('C. 刷新后偏好仍在 localStorage', async () => {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.monaco-editor', { visible: true, timeout: 40000 })
    await wait(600)
    const state = await probe(page)
    await page.screenshot({ path: `${SHOTS}cph-3-persisted-left.png` })
    record('C. 刷新后偏好仍在 localStorage', state.storedPanel === 'left' && state.flexDirection === 'row', {
      storedPanel: state.storedPanel,
      flexDirection: state.flexDirection,
    })
  })

  await step('D. 拖动分隔条改变两栏比例', async () => {
    const before = await probe(page)
    // 往哪边拖取决于面板实际位置（新架构 flex-direction 恒为 row，看 x 坐标判断）：
    // 测试面板在右 → 往右拖它变窄；在左 → 往左拖。写死方向会被 B / C 留下的状态坑掉。
    const delta = before.testsPane.x > before.editorPane.x ? 220 : -220
    const handle = await page.waitForSelector('.splitter', { timeout: 10000 })
    const box = await handle.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + delta, box.y + box.height / 2, { steps: 16 })
    await page.mouse.up()
    await wait(400)
    const after = await probe(page)
    await page.screenshot({ path: `${SHOTS}cph-4-resized.png` })
    const shrank = after.testsPane.w < before.testsPane.w - 100
    record('D. 拖动分隔条改变两栏比例', shrank, {
      dragDelta: delta,
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
    // 先把侧栏切回「资源管理器」再双击分隔条折叠它——为的是验新契约：点运行按钮时
    // 侧栏要自己展开、并切到「评测样例」，不然点了运行看不到结果。
    // （顺序不能反：折叠后整栏 display:none，页头那颗切换钮也就点不到了。）
    await showPanel(page, 'explorer')
    await wait(300)
    await page.evaluate(() =>
      document
        .querySelector('.splitter')
        .dispatchEvent(new MouseEvent('dblclick', { bubbles: true })),
    )
    await wait(400)
    const collapsed = await page.evaluate(
      () => document.querySelector('.pane--tests').getClientRects().length === 0,
    )
    // 运行入口：页签栏那颗运行按钮已删（2026-09-28），现在只剩全局快捷键与评测面板
    // 页脚那颗 ▶。此刻侧栏正折叠着（上面刚双击折起来），页脚那颗 display:none 点不到，
    // 所以走快捷键 —— 顺带守住「侧栏收起时快捷键照样能跑、且能把侧栏重新捞回来」。
    await page.keyboard.down(MOD)
    await page.keyboard.press('Enter')
    await page.keyboard.up(MOD)
    await page.waitForFunction(
      () => document.querySelector('.verdict')?.textContent.trim() !== '运行中',
      { timeout: 90000, polling: 500 },
    )
    // 运行确实把侧栏捞了回来，且落在「评测样例」上（这正是「点运行自动亮出结果」那条契约）
    const revealed = await page.evaluate(() => {
      const panel = [...document.querySelectorAll('.sidebar__panel')].find(
        (el) => el.getClientRects().length > 0,
      )
      return {
        visible: document.querySelector('.pane--tests').getClientRects().length > 0,
        activePanel: panel?.dataset.panel ?? '',
      }
    })
    const state = await probe(page)
    await page.screenshot({ path: `${SHOTS}cph-5-run-all.png` })
    record(
      'E. 添加用例并运行全部（真实评测）',
      added === 3 &&
        state.badges.length === 3 &&
        collapsed &&
        revealed.visible &&
        revealed.activePanel === 'tests',
      {
        cardsAfterAdd: added,
        collapsedBeforeRun: collapsed,
        revealedAfterRun: revealed,
        verdict: state.verdict,
        badges: state.badges,
        metrics: state.metrics,
        outputs: state.outputs,
        hints: state.hints,
      },
    )
  })

  // 语言不再有顶栏下拉（2026-09 移除）：语言跟着活跃文件的扩展名走，所以这一步走真实 UI ——
  // 在资源管理器里点开 main.py（迁移在首次启动时已种下它），断言模板 / 页签 / 判题语言都变成 Python。
  await step('F. 打开 main.py：Python 模板与判题语言', async () => {
    // E 步把侧栏切到了「评测样例」（点运行会自动亮出结果），这里先切回「资源管理器」。
    await showPanel(page, 'explorer')
    await page.waitForSelector('.tree-item__label', { visible: true, timeout: 10000 })
    // 用 DOM click（不是坐标点击）：面板被拖窄后标签会省略号化，坐标点击会点偏。
    // 点 .tree-item__row 才走 FileTreeItem.onClick → openFile。
    const clicked = await page.evaluate(() => {
      const label = [...document.querySelectorAll('.tree-item__label')].find(
        (el) => el.textContent.trim() === 'main.py',
      )
      if (!label) return false
      label.closest('.tree-item__row')?.click()
      return true
    })
    if (!clicked) {
      const labels = await page.evaluate(() =>
        [...document.querySelectorAll('.tree-item__label')].map((el) => el.textContent.trim()),
      )
      record('F. 打开 main.py：Python 模板与判题语言', false, {
        treeLabels: labels,
        note: '资源管理器里没有 main.py（迁移未种下？）',
      })
      return
    }
    // Monaco 渲染时把空格转成不间断空格（\u00a0），匹配前先规范化空白
    const hasPythonCode = () => {
      const text = document.querySelector('.view-lines')?.textContent
      return Boolean(text && text.replace(/\u00a0/g, ' ').includes('def solve'))
    }
    await page.waitForFunction(hasPythonCode, { timeout: 20000, polling: 300 })
    const pythonLoaded = await page.evaluate(hasPythonCode)
    // 选择器必须收窄到编辑器页签：侧边栏的切换按钮也是 tab 语义，
    // 用 [role="tab"][aria-selected="true"] 会跟它们撞上（谁在 DOM 里靠前就看运气）。
    const activeIsPy = await page.evaluate(() =>
      document.querySelector('.editor-tabs__item--active')?.textContent.trim() === 'main.py',
    )
    // 判题语言与 model 语言同源（activeLanguage → languageForPath），直接问 workspaceStore；
    // 与 App.vue 是同一个模块实例（URL 一致），不是另建一份。
    const derived = await page.evaluate(async () => {
      const store = await import('/src/services/vfs/workspaceStore.js')
      return { language: store.activeLanguage.value, path: store.activeNode.value?.path ?? null }
    })
    // 语言下拉确实已经没了：全应用的下拉只剩设置视图里那几个（时限 / 换行 / 栏位 / 主题）
    const noLangSelect = await page.evaluate(() =>
      [...document.querySelectorAll('select')].every((el) => !!el.closest('.settings-view')),
    )
    await page.screenshot({ path: `${SHOTS}cph-6-python.png` })
    record(
      'F. 打开 main.py：Python 模板与判题语言',
      Boolean(pythonLoaded) &&
        activeIsPy &&
        derived.language === 'python' &&
        derived.path === '/main.py' &&
        noLangSelect,
      { pythonLoaded, activeIsPy, ...derived, noLangSelect },
    )
  })

  // G. 快捷键切换侧栏面板（switch-panel，默认 Mod+Shift+E）：等价于点页头那枚胶囊。
  //    F 步结束时侧栏正停在「资源管理器」，正好当起点。
  await step('G. 快捷键切换侧栏面板', async () => {
    const pressSwitch = async () => {
      await page.keyboard.down(MOD)
      await page.keyboard.down('Shift')
      await page.keyboard.press('KeyE')
      await page.keyboard.up('Shift')
      await page.keyboard.up(MOD)
      await wait(200)
    }

    await showPanel(page, 'explorer')
    await pressSwitch()
    const afterFirst = await visiblePanelId(page)
    await pressSwitch()
    const afterSecond = await visiblePanelId(page)

    // 侧栏收起时按同一个键：既要翻面，也得先把它捞回来（否则按了看不见任何反应）
    await page.evaluate(() =>
      document
        .querySelector('.splitter')
        .dispatchEvent(new MouseEvent('dblclick', { bubbles: true })),
    )
    await wait(400)
    const collapsed = await page.evaluate(
      () => document.querySelector('.pane--tests').getClientRects().length === 0,
    )
    await pressSwitch()
    // 收起时按一下 = 先捞回来 + 再翻面，所以落点应当是「评测样例」而不是折叠前那个
    const afterCollapsedPress = await visiblePanelId(page)
    const revealed = await page.evaluate(
      () => document.querySelector('.pane--tests').getClientRects().length > 0,
    )
    // 收尾把侧栏恢复成「可见 + 资源管理器」，免得给后续步骤留个歪状态
    await showPanel(page, 'explorer')
    await page.screenshot({ path: `${SHOTS}cph-7-switch-panel.png` })

    record(
      'G. 快捷键切换侧栏面板',
      afterFirst === 'tests' &&
        afterSecond === 'explorer' &&
        collapsed &&
        revealed &&
        afterCollapsedPress === 'tests',
      {
        afterFirst,
        afterSecond,
        collapsedBeforePress: collapsed,
        revealed,
        afterCollapsedPress,
      },
    )
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
