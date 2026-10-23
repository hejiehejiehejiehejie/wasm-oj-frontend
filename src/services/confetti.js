import confetti from 'canvas-confetti'

/**
 * 「全部样例通过」的庆祝纸屑（2026-10-23 加，同日改过三次口径）
 *
 * 一次评测**每一张样例都 AC** 时，在侧栏的样例面板里落一片彩色纸屑。现行口径：
 * · **只有全部样例通过才放**，任一 WA / TLE / RE / MLE / CE 都不放；**单卡 ▶** 只有
 *   在它把整组用例凑成全过的那一次才放（跑之前已经全过就不再放）——
 *   单样例是例外：每次 AC 都放（那一次运行就是整份提交，用户 2026-10-24 要求），
 *   纸屑是「这一份提交过了」的奖励，不是「有结果了」的通知。
 * · **范围是侧栏那块样例面板**（canvas 由 `TestPanel.vue` 摆在 `.panel` 里、盖满整块面板），
 *   不是整页也不是单个卡片：这一栏就是「评测页」，庆祝落在这一栏。
 * · **可以在 设置 › 评测 关掉**（`cp.editorSettings.celebration`，见 services/editorOptions.js）。
 *
 * ⚠️ 四条别动：
 * 1. **不给 `useWorker`**：worker 模式下 canvas 的控制权会被 `transferControlToOffscreen`
 *    永久交出去，尺寸从此只能靠库自己的 `resize: true`（挂在 window 的 resize 上）改 ——
 *    而拖分隔条、折叠侧栏、切窄屏都不发 window resize，位图会停在旧尺寸、粒子被 CSS 拉伸变形。
 *    几十颗粒子画在主线程上没有成本，别为它换回 worker。
 * 2. **尺寸每次自己量**（`resize: false`）：面板是 flex 子项，高度随窗口、宽度随拖拽变。
 *    放之前按 `getBoundingClientRect()` 重设位图，**1 CSS px = 1 位图 px**
 *    （与库自己的 `setCanvasWindowSize` 同口径；乘 devicePixelRatio 会让粒子只剩一半大）。
 * 3. **颜色现读 CSS 变量**：四支纸屑色两套主题各有一档，`styles/base.css` 是唯一出处，
 *    JS 里不写十六进制。读不到就少用一支，一支都读不到就干脆不放，不拿自造颜色兜底。
 * 4. **面板不可见时不放**：`v-show` 藏起来时是 0×0，放进去只会画在一块空位图上。
 */

// 四支节日色（不是状态色）：深色那套是糖果色，浅色那套压深一档，否则白底上看不见
const COLOR_TOKENS = ['--confetti-1', '--confetti-2', '--confetti-3', '--confetti-4']

/**
 * 一次庆祝由**几小把**拼成一条横贯面板的帘子，不是从一个点喷一股 —— 单点的观感是
 * 「半空中炸开一团」，与「从顶上飘落」差得远（2026-10-23 首版就是这个毛病）。
 *
 * 把数按面板宽度选：侧栏常态 500~600 CSS px，三把刚好铺满；面板被拖宽时才加到五把，
 * 否则固定五把在 550px 里会挤成一团。
 */
const CURTAIN_WIDE = [
  { delay: 0, x: 0.1 },
  { delay: 70, x: 0.3 },
  { delay: 140, x: 0.5 },
  { delay: 210, x: 0.7 },
  { delay: 280, x: 0.9 },
]
const CURTAIN_NARROW = [
  { delay: 0, x: 0.2 },
  { delay: 90, x: 0.5 },
  { delay: 180, x: 0.8 },
]

let fire = null
let canvasEl = null
/** 几把之间那几个 setTimeout 的句柄；卸载时要清掉，否则会往已摘掉的画布上放 */
const pending = new Set()

/**
 * 把面板里那块 canvas 交给纸屑层。`onMounted` 挂、`onBeforeUnmount` 调 `unmountConfetti` 摘。
 * @param {HTMLCanvasElement|null} el
 */
export function mountConfetti(el) {
  if (!el) return
  canvasEl = el
  fire = confetti.create(el, {
    // 见文件头第 1、2 条：自己管尺寸，也因此不能走 worker
    resize: false,
    useWorker: false,
    // 系统开了「减弱动态效果」就整个不出（库内部读 matchMedia，调用侧不用再判一次）
    disableForReducedMotion: true,
  })
}

export function unmountConfetti() {
  pending.forEach(clearTimeout)
  pending.clear()
  fire?.reset()
  fire = null
  canvasEl = null
}

function drawBurst(x, count, colors) {
  fire({
    particleCount: count,
    colors,
    // 朝正下方扇开 —— 这就是「飘落」。库的默认 90° 是斜上喷，那是礼炮不是纸屑。
    angle: 270,
    spread: 80,
    // 初速压得比默认 45 低得多：落得慢，才看得出是一片片纸屑而不是一条射线；
    // 重力给到 1.2 是补回「太慢」那一头 —— 1.0 以下时纸屑在半空就淡没了，落不到面板下沿
    startVelocity: 13,
    gravity: 1.2,
    // 每把左右偏一点，连放几次不会一成不变地走同一条线
    drift: (Math.random() - 0.5) * 1.2,
    // 300 ≈ 5s：够它从顶上落到面板下沿再消失。给 260（首版）时纸屑在半空就淡没了，
    // 看着像「炸了一团」而不是「落下去」
    ticks: 300,
    scalar: 0.85,
    // 起点在面板**上沿之外**一点：纸屑是「从上面落进来」的，
    // 而不是凭空出现在半空（y 给 0 会看到一片粒子在边框内突然冒出来）
    origin: { x, y: -0.05 },
    disableForReducedMotion: true,
  })
}

/**
 * 一组用例全部 AC 时调一次（App.vue 的 celebrateIfAllPassed / runOne 的凑齐判断）。
 * 面板不可见时这里量到 0×0，自己跳过。
 */
export function celebrateAllPassed() {
  if (!fire || !canvasEl) return

  const rect = canvasEl.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) return

  const styles = getComputedStyle(document.documentElement)
  const colors = COLOR_TOKENS.map((token) => styles.getPropertyValue(token).trim()).filter(Boolean)
  if (!colors.length) return

  // 重设位图 = 顺便清空上一把还在空中的粒子。库每帧都先 clearRect 再把**所有**活着的粒子
  // 重画一遍，所以不会出现半截闪烁。
  // ⚠️ 只在这里设一次：几把里每把都设一遍的话，后一把会把前一把还在空中的粒子抹掉。
  canvasEl.width = Math.round(rect.width)
  canvasEl.height = Math.round(rect.height)

  const wide = rect.width >= 700
  const curtain = wide ? CURTAIN_WIDE : CURTAIN_NARROW
  const count = wide ? 18 : 20

  for (const burst of curtain) {
    // 横向再加一点抖动，连放几次不会落在同几条线上
    const x = burst.x + (Math.random() - 0.5) * 0.08
    if (!burst.delay) {
      drawBurst(x, count, colors)
      continue
    }
    const id = setTimeout(() => {
      pending.delete(id)
      if (fire && canvasEl) drawBurst(x, count, colors)
    }, burst.delay)
    pending.add(id)
  }
}
