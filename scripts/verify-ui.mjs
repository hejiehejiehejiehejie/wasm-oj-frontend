import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import puppeteer from 'puppeteer-core'

// 一条命令跑完整回归：自检 Monaco 是否真的挂载、布局对调是否只靠 CSS、
// 偏好是否持久化、分隔条拖拽、以及运行全部测试的真实结果。
const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
]
const CHROME = process.env.CHROME_PATH ?? CHROME_CANDIDATES[0]

/**
 * 让系统分配一个空闲端口。
 *
 * 这里原来是写死的 5199 配 `--strictPort` —— 后果是「开发者自己开着 npm run dev」时
 * 回归必定以 `dev server 意外退出 code=1` 收场，还得手动 `VERIFY_PORT=xxxx` 绕开。
 * 端口是环境噪音，不该让用脚本的人去记这件事。
 */
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

// 显式给了 VERIFY_PORT 就照用（想看现场时有用），否则自己挑一个空的
const PORT = Number(process.env.VERIFY_PORT ?? 0) || (await freePort())
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

// 单击分隔条 = 折叠 / 展开（**宽屏专属**：窄屏 2026-10-13 起把这个入口去掉了，
// `stop()` 里先 `if (isNarrowLayout()) return`；本脚本跑在 1680 桌面档，不受影响）。
// App.vue 在 pointerup 上认这件事，不看原生 click
// （pointerdown 里的 preventDefault 会抑制兼容鼠标事件，各浏览器补不补回 click 并不一致），
// 所以要合成 pointerdown + 冒泡到 window 的 pointerup，且中间不带位移（位移超 10px 算拖拽）。
const clickSplitter = (page) =>
  page.evaluate(() => {
    const splitter = document.querySelector('.splitter')
    const opts = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse' }
    splitter.dispatchEvent(new PointerEvent('pointerdown', opts))
    window.dispatchEvent(new PointerEvent('pointerup', opts))
  })

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

/**
 * 侧栏是否折叠。
 *
 * 不能用 `getClientRects().length === 0`：2026-10-10 起折叠态**不摘节点**，
 * `.pane--tests` 收成 1px 留在排版里（View Transitions 快照与 syncSidebarPin 都靠它），
 * 只把内层 `visibility/opacity` 归零（见 App.vue 的 `.pane--tests.is-collapsed`）。
 * 所以那条判据恒为假、E / G / H 会集体误报。判据只认 `.is-collapsed`。
 */
const panelCollapsed = (page) =>
  page.evaluate(() => Boolean(document.querySelector('.pane--tests')?.classList.contains('is-collapsed')))

/** 侧栏是否展开（与 panelCollapsed 同一口径；宽度 > 1 只是防御性双保险） */
const panelExpanded = (page) =>
  page.evaluate(() => {
    const pane = document.querySelector('.pane--tests')
    return Boolean(pane) && !pane.classList.contains('is-collapsed') && pane.getBoundingClientRect().width > 1
  })

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
    // 「资源管理器 / 评测样例」的面板可见性用 getClientRects 判（computed display 会误报）。
    const visiblePanel = () =>
      [...document.querySelectorAll('.sidebar__panel')].find((el) => el.getClientRects().length > 0)
    // 页头切换器全站只有一份（2026-10-11 上提到 Sidebar 的共享页头），直接在页头作用域里读
    const sidebarHead = () => document.querySelector('.sidebar__head')
    // 页头上可点的控件：胶囊那颗 toggle（`.sidebar-switcher__pill`）+ 设置那颗。
    // ⚠️ 必须按**可见性**过滤（`getClientRects`，与上面 visiblePanel 同一口径）：
    // 2026-10-13 起页头里还挂着窄屏底部那条那颗「收起侧栏」箭头（同一个 `__tab` 外观类），
    // 它在本脚本的桌面宽度下是 `display: none`，但 `querySelectorAll` 照样拿得到它 ——
    // 不过滤的话 A 组那条精确清单会凭空多一项、整组变红。
    // 这个清单的语义本来就是「眼前看得见的控件」，函数名里的 visible 也该落实在这里。
    const visibleSwitcherTabs = () => [
      ...(sidebarHead()?.querySelectorAll('.sidebar-switcher__pill, .sidebar-switcher__tab') ?? []),
    ].filter((el) => el.getClientRects().length > 0)
    // 胶囊里的两段：纯视觉指示，不可点，所以按它们自己的标记读「哪一段亮着」
    const visibleSegs = () => [...(sidebarHead()?.querySelectorAll('.sidebar-switcher__seg') ?? [])]
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
      storedPanel: stored('cp.panelPosition'),
      storedShare: stored('cp.editorShare'),
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
    document.querySelector('.sidebar__head .sidebar-switcher__pill')?.click()
  }, id)

// 主修饰键 + 一个键码。题解那 14 条格式键与几条全局键同键，所以按下之前
// 必须知道焦点在哪，见 focusEditor。
const pressMod = async (page, code) => {
  await page.keyboard.down(MOD)
  await page.keyboard.press(code)
  await page.keyboard.up(MOD)
  await wait(150)
}

/**
 * 把焦点确定地送进 Monaco。
 * 题解那 14 条（⌘B / ⌘⇧E …）与全局的「收侧栏」「翻面板」同键，App.vue 的让路判据
 * 正是「焦点在不在编辑器里」—— 靠上一步顺手留下的焦点太看运气，这里显式点一把。
 */
const focusEditor = (page) =>
  page.evaluate(async () => {
    const { monaco } = await import('/src/monaco-setup.js')
    monaco.editor.getEditors()[0]?.focus()
  })

/**
 * 活跃 model 的全文。VFS 的 model uri 是 `vfs://file/<uuid>`，认不出文件名，
 * 所以不问「哪个文件」只问「这个编辑器现在挂着什么」——本应用只有一个编辑器组。
 */
const editorValue = (page) =>
  page.evaluate(async () => {
    const { monaco } = await import('/src/monaco-setup.js')
    return monaco.editor.getEditors()[0]?.getValue() ?? ''
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
    // Monaco 画出行 ≠ 工作区就绪（VFS 根是在 init() 里索引的，界面会先渲染出来）。
    // 首启要等 /main.cpp 真的被打开、正文落进编辑器，再往下读面板状态，否则会抓到
    // 「编辑器还空着」的中间态（届时侧栏停在哪儿都不作数）。
    await page.waitForFunction(() => document.querySelectorAll('.view-line').length > 3, {
      timeout: 40000,
    })
    // 新契约（2026-09 统一侧边栏）：侧边栏默认停在「资源管理器」，评测面板被 v-show 藏着。
    // 先确认页头那枚胶囊在，再点过去，面板才真的渲染出来——这也是切面板这条路本身的回归。
    // 首启的虚拟工作区**没有样例**：样例只来自当前文件的 config.tests（见 App.vue 的
    // normalizeTests），而 /main.cpp 是普通模板，所以这里守的是空态，不是在数卡片。
    // 切换器全站只有一份（2026-10-11 上提到 Sidebar 的共享页头），直接在页头里找；
    // 段位带短标签（窄屏退回纯图标），所以认 aria-label / data-panel 而不是 textContent。
    // 面板那枚胶囊整体是一颗 toggle，文案是「将要去的那一个」；两段在它里面，
    // 所以这里钉住的是「胶囊在（且说的是去向）+ 两段都渲染出来了」。
    // 同上：按可见性过滤（页头里还挂着窄屏才显示的「收起侧栏」那颗，桌面下是 display: none）
    const tabs = await page.evaluate(() => {
      const head = document.querySelector('.sidebar__head')
      return [...(head?.querySelectorAll('.sidebar-switcher__pill, .sidebar-switcher__tab') ?? [])]
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => el.getAttribute('aria-label'))
    })
    const segIds = await page.evaluate(() => {
      const head = document.querySelector('.sidebar__head')
      return [...(head?.querySelectorAll('.sidebar-switcher__seg') ?? [])].map(
        (el) => el.dataset.panel,
      )
    })
    await showPanel(page, 'tests')
    await page.waitForSelector('.cases .empty', { visible: true, timeout: 20000 })
    const state = await probe(page)
    await page.screenshot({ path: `${SHOTS}cp-1-default-right.png` })
    const ok =
      // 「组件」那颗是侧栏页头的第三颗控件（2026-10 加入），清单按可见顺序写全
      tabs.join('/') === '切换到评测样例/组件/设置' &&
      segIds.join('/') === 'explorer/tests' &&
      state.sidebarSegActive.join('/') === 'tests' &&
      state.sidebarPanel === 'tests' &&
      !state.topbarPresent &&
      state.workspaceTop === 0 &&
      state.codeLineCount > 3 &&
      state.editorText.includes('include') &&
      !state.minimapVisible &&
      state.flexDirection === 'row' &&
      state.cardCount === 0 &&
      state.stdinBoxes === 0 &&
      state.readonlyOuts === 0 &&
      state.storedPanel === 'left' &&
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
    // 新架构：换边入口在「设置」页签里。打开设置 → 选「右侧」→ 关掉页签回到代码。
    // 打开设置现在要走两步（2026-10-11）：侧栏页头那颗齿轮先弹出 Quick Settings 菜单，
    // 再由菜单里的「打开设置面板…」开出编辑区里那个页签 —— 齿轮本身不再直接开页签。
    await page.evaluate(async () => {
      const btn = [
        ...(document
          .querySelector('.sidebar__head')
          ?.querySelectorAll('.sidebar-switcher__tab') ?? []),
      ].find((el) => el.getAttribute('aria-label') === '设置')
      btn?.click()
      await new Promise((resolve) => setTimeout(resolve, 120))
      const row = [...document.querySelectorAll('.settings-menu__row')].find((el) =>
        el.textContent.includes('打开设置面板'),
      )
      row?.querySelector('.settings-menu__item')?.click()
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
        menuTrigger: !!document.querySelector('.settings-menu'),
      }
    })
    // 目录换成「齿轮 + Quick Settings 下拉菜单」后，分类藏在「设置分类」的二级子菜单里。
    // 从菜单里逐项点开、要求它真的渲染出内容：分类是 v-else-if 互斥的，所以每一项点开后
    // `section.setting-group` 必须恰好是 1 个，且设置视图的目录里当前那一项就是刚点的那个。
    // ⚠️ 2026-11-07 起横滑翻页要「两页一起走」，设置正文是**一页一个** DOM（`.settings-pane`，
    // 当前页 + 左右各一页都在树里），所以「恰好 1 个」这个契约点搬到了**当前页内部**：
    // `.settings-pane--current` 必须恰好 1 个，它里面的 `section.setting-group` 恰好 1 个。
    //
    // 三个契约点跟着实现走（2026-10-11）：
    // - 齿轮是侧栏页头里 aria-label 为「设置」的那颗 `.sidebar-switcher__tab`，
    //   而 `.settings-menu` 是**弹出来的浮层本身**，不能再拿它当触发器点；
    // - 菜单项统一是 `.settings-menu__item`（二级那批额外带 `--sub`）；
    // - 「设置分类」选完会连菜单一起收掉（它把人送到设置面板去），所以每一项都要重开一次。
    const navCoverage = await page.evaluate(async () => {
      const gear = () => {
        return [
          ...(document
            .querySelector('.sidebar__head')
            ?.querySelectorAll('.sidebar-switcher__tab') ?? []),
        ].find((el) => el.getAttribute('aria-label') === '设置')
      }
      const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      const labelOf = (el) => el?.querySelector('.settings-menu__label')?.textContent?.trim() ?? ''
      /**
       * 重开菜单并展开「设置分类」的二级，返回那一批子项。
       * 齿轮是 toggle：上一步可能把菜单留在开着的状态，先按一次把状态归零再开，
       * 否则这一次点下去是「关」。
       */
      const openSections = async () => {
        if (document.querySelector('.settings-menu')) gear()?.click()
        await tick(90)
        gear()?.click()
        await tick(120)
        if (!document.querySelector('.settings-menu')) {
          gear()?.click()
          await tick(120)
        }
        const row = [...document.querySelectorAll('.settings-menu__row')].find((el) =>
          el.textContent.includes('设置分类'),
        )
        row?.querySelector('.settings-menu__item')?.click()
        await tick(90)
        return [...document.querySelectorAll('.settings-menu__sub .settings-menu__item--sub')]
      }

      const labels = (await openSections()).map(labelOf)
      // 先随便选一项把菜单收掉，回到「设置已打开」这个稳定状态
      const first = document.querySelector('.settings-menu__sub .settings-menu__item--sub')
      first?.click()
      await tick(80)

      const results = []
      for (const label of labels) {
        const items = await openSections()
        const target = items.find((el) => labelOf(el) === label)
        target?.click()
        await tick(80)
        const current = document.querySelectorAll('.settings-pane--current')
        results.push({
          label,
          current:
            document.querySelector('.settings-nav__item--active .settings-nav__label')?.textContent?.trim() ===
            label,
          panes: current.length,
          // 普通分类的「页」就是那个 section 自己，云端那页是包着两张卡的 div —— 两头都算上
          groups: current[0]
            ? (current[0].matches('section.setting-group') ? 1 : 0) +
              current[0].querySelectorAll('section.setting-group').length
            : 0,
          textLength: (current[0]?.textContent ?? '').trim().length,
        })
      }
      return results
    })
    const navOk =
      navCoverage.length > 0 &&
      navCoverage.every((entry) => entry.current && entry.panes === 1 && entry.groups === 1 && entry.textLength > 0)

    // 换边入口（侧边栏位置）在「外观」这一组里。目录改成菜单后，仍显式从菜单里点「外观」，
    // 这样默认分类以后再变，这一步也不会跟着坏。
    await page.evaluate(async () => {
      const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      const gear = () => {
        return [
          ...(document
            .querySelector('.sidebar__head')
            ?.querySelectorAll('.sidebar-switcher__tab') ?? []),
        ].find((el) => el.getAttribute('aria-label') === '设置')
      }
      gear()?.click()
      await tick(90)
      const row = [...document.querySelectorAll('.settings-menu__row')].find((el) =>
        el.textContent.includes('设置分类'),
      )
      row?.querySelector('.settings-menu__item')?.click()
      await tick(90)
      const item = [...document.querySelectorAll('.settings-menu__sub .settings-menu__item--sub')].find(
        (el) => (el.querySelector('.settings-menu__label')?.textContent ?? '').includes('外观'),
      )
      item?.click()
    })
    await wait(200)
    // 侧边栏位置已改成单颗钮一键切换（2026-10-30，原先是下拉）：按钮显示当前档（如「左侧」），
    // 点一下翻到另一档。这里的目标是「左侧 → 右侧」，所以只有当前显示「左侧」时点一下；
    // 若已是「右侧」（残留）就再点一下翻回左侧后重试，保证落到右侧。
    await page.evaluate(() => {
      const row = [...document.querySelectorAll('.settings-view .settings-pane--current .setting-row')].find(
        (r) => r.querySelector('.setting-row__label')?.textContent === '侧边栏位置',
      )
      const btn = row?.querySelector('.toggle-seg')
      if (!btn) return
      if (btn.textContent.trim() !== '左侧') btn.click() // 先翻回左侧
    })
    await wait(120)
    await page.evaluate(() => {
      const row = [...document.querySelectorAll('.settings-view .settings-pane--current .setting-row')].find(
        (r) => r.querySelector('.setting-row__label')?.textContent === '侧边栏位置',
      )
      row?.querySelector('.toggle-seg')?.click() // 左侧 → 右侧
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
    await page.screenshot({ path: `${SHOTS}cp-2-swapped-right.png` })
    // 新契约：flex-direction 恒为 row；靠 order 让测试面板跑到右边；Monaco 实例与 DOM 不重建；
    // 设置是个页签（开时铺满编辑区、关时视图与页签一起消失）
    const ok =
      state.flexDirection === 'row' &&
      state.testsPane.x > state.editorPane.x &&
      state.storedPanel === 'right' &&
      markerAlive === monacoBefore &&
      state.codeLineCount > 3 &&
      settingsShown.viewVisible &&
      settingsShown.tabActive &&
      navOk &&
      !settingsClosed.tabPresent &&
      !settingsClosed.viewVisible
    record('B. 切换布局：order 换序，DOM/Monaco 不重建', ok, {
      ...state,
      monacoInstanceReused: markerAlive === monacoBefore,
      settingsShown,
      navCoverage: navCoverage.map((entry) => `${entry.current ? '✓' : '✗'}${entry.panes}p/${entry.groups}g${entry.textLength > 0 ? '' : '!空'} ${entry.label}`),
      settingsClosed,
    })
  })

  await step('C. 刷新后偏好仍在 localStorage', async () => {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.monaco-editor', { visible: true, timeout: 40000 })
    await wait(600)
    const state = await probe(page)
    await page.screenshot({ path: `${SHOTS}cp-3-persisted-right.png` })
    record('C. 刷新后偏好仍在 localStorage', state.storedPanel === 'right' && state.flexDirection === 'row', {
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
    await page.screenshot({ path: `${SHOTS}cp-4-resized.png` })
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
    // 加之前面板是空的（首启工作区不带默认样例），所以这一下是 0 → 1
    const added = await page.evaluate(() => document.querySelectorAll('.card').length)
    // 先把侧栏切回「资源管理器」再单击分隔条折叠它——为的是验新契约：点运行按钮时
    // 侧栏要自己展开、并切到「评测样例」，不然点了运行看不到结果。
    // （顺序不能反：折叠后内层被 visibility 收掉，页头那颗切换钮也就点不到了。）
    await showPanel(page, 'explorer')
    await wait(300)
    await clickSplitter(page)
    await wait(400)
    const collapsed = await panelCollapsed(page)
    // 运行入口：页签栏那颗运行按钮已删（2026-09-28），现在只剩全局快捷键与评测面板
    // 页脚那颗 ▶。此刻侧栏正折叠着（上面刚单击折起来），页脚那颗 display:none 点不到，
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
      const pane = document.querySelector('.pane--tests')
      return {
        visible: Boolean(pane) && !pane.classList.contains('is-collapsed'),
        activePanel: panel?.dataset.panel ?? '',
      }
    })
    const state = await probe(page)
    await page.screenshot({ path: `${SHOTS}cp-5-run-all.png` })
    record(
      'E. 添加用例并运行全部（真实评测）',
      added === 1 &&
        state.badges.length === 1 &&
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
    await page.screenshot({ path: `${SHOTS}cp-6-python.png` })
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
    await clickSplitter(page)
    await wait(400)
    const collapsed = await panelCollapsed(page)
    await pressSwitch()
    // 收起时按一下 = 先捞回来 + 再翻面，所以落点应当是「评测样例」而不是折叠前那个
    const afterCollapsedPress = await visiblePanelId(page)
    const revealed = await panelExpanded(page)
    // 收尾把侧栏恢复成「可见 + 资源管理器」，免得给后续步骤留个歪状态
    await showPanel(page, 'explorer')
    await page.screenshot({ path: `${SHOTS}cp-7-switch-panel.png` })

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

  // H. 题解（.md）回归（2026-09-30 加）。.md 是非判题语言，编辑器里多出一行工具栏、
  //    状态栏收掉、运行入口整体置灰；同在编辑器里按 ⌘B，题解里是加粗、回到 .cpp 仍是收侧栏。
  await step('H. 题解（.md）：工具栏、运行闸门与快捷键让路', async () => {
    // G 步收尾把侧栏留在「资源管理器」上，正好从这里开工。
    await showPanel(page, 'explorer')
    await page.waitForSelector('.explorer__btn', { visible: true, timeout: 10000 })
    // 页头第一颗就是「新建文件」（第二颗是新建文件夹）
    await page.evaluate(() => document.querySelector('.explorer__btn')?.click())
    await page.waitForSelector('.create-row__input', { timeout: 5000 })
    // 预填名（new.cpp）只选中主干、后缀留在选区外，直接打字会得到 notes.cpp ——
    // 全选再敲，才是连扩展名一起换掉
    await page.evaluate(() => {
      const input = document.querySelector('.create-row__input')
      input.focus()
      input.select()
    })
    await page.keyboard.type('notes.md')
    await page.keyboard.press('Enter')
    // 建完会自动打开它（createFile → openFile）。题解那行工具栏就是「.md 真被当成题解」的信号
    await page.waitForSelector('.md-tools', { visible: true, timeout: 20000 })
    await wait(400)

    const mdState = await page.evaluate(() => {
      const visible = (selector) => {
        const el = document.querySelector(selector)
        return !!el && el.getClientRects().length > 0
      }
      const runButton = document.querySelector('.run-inline')
      return {
        toolsVisible: visible('.md-tools'),
        stats: document.querySelector('.md-stats')?.textContent.trim() ?? null,
        // 统计块是「数字在上、单位在下」的两列（2026-11-01 起不再用「N 字 · M 行」整句），
        // 两块各自带一个数字 + 单位，竖线只管视觉、不带文字
        statCount: document.querySelectorAll('.md-stats > .md-stat').length,
        // 状态栏是 v-if 存在、靠 .editor-pane.is-md 收掉，所以只能看渲染盒
        statusVisible: visible('.editor-pane__status'),
        // 运行按钮在「评测样例」页签里（v-show 藏着，但节点在 DOM 里，disabled 读得到）；
        // 此刻有用例（E 步加的那 1 条）、没在运行，唯一能置灰它的就是题解这条闸门
        runDisabled: runButton ? runButton.disabled : null,
        runBlocked: document.querySelector('.run-blocked')?.textContent.trim() ?? '',
      }
    })

    // ⌘B：焦点在题解编辑器里时这一发归 Monaco 的「加粗」，不该去收侧栏
    const mdTextBefore = await editorValue(page)
    await focusEditor(page)
    await pressMod(page, 'KeyB')
    await wait(300)
    const mdTextAfter = await editorValue(page)
    const mdSidebarAfter = await panelExpanded(page)

    // 回到 .cpp 按同一个键：题解那 14 条只认 .md，这一发应当落回全局的「收侧栏」
    await page.evaluate(() => {
      const label = [...document.querySelectorAll('.tree-item__label')].find(
        (el) => el.textContent.trim() === 'main.cpp',
      )
      label?.closest('.tree-item__row')?.click()
    })
    await wait(400)
    await pressMod(page, 'KeyB')
    await wait(400)
    const cppSidebarCollapsed = await panelCollapsed(page)
    // 收尾：把侧栏再打开，别给后续留个折叠状态
    await pressMod(page, 'KeyB')
    await wait(400)
    await page.screenshot({ path: `${SHOTS}cp-8-markdown.png` })

    record(
      'H. 题解（.md）：工具栏、运行闸门与快捷键让路',
      mdState.toolsVisible &&
        mdState.statCount === 2 &&
        /\d+\s*(字|chars)/.test(mdState.stats ?? '') &&
        /\d+\s*(行|lines)/.test(mdState.stats ?? '') &&
        !mdState.statusVisible &&
        mdState.runDisabled === true &&
        mdState.runBlocked.length > 0 &&
        !mdTextBefore.includes('**') &&
        mdTextAfter.includes('**') &&
        mdSidebarAfter &&
        cppSidebarCollapsed,
      { ...mdState, mdTextBefore, mdTextAfter, mdSidebarAfter, cppSidebarCollapsed },
    )
  })

  console.log(`\n控制台告警/错误: ${JSON.stringify(logs.slice(0, 12), null, 1)}`)
  console.log(`localStorage: panel=${await page.evaluate(() => localStorage.getItem('cp.panelPosition'))}`)
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
