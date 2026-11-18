/**
 * useSelectionHandles —— 触屏编辑区的选区手柄（2026-10-10 加）。
 *
 * Monaco **没有**「拖两端圆点改选区」的能力（它的 `Gesture` 只认轻点 / 双击 / 长按，
 * 见 HANDOFF 第 5 节坑 31），所以这一层整个自己画：一块盖在编辑器上的浮层 + 两颗圆点。
 *
 * 【位置怎么算】
 * `editor.getScrolledVisiblePosition(position)` —— 给的是**相对编辑器 DOM 节点**（`.monaco-editor`）
 * 的 `{ top, left, height }`，**已经含滚动偏移**，比自己在 JS 里复刻一遍行高 / 折行 / 横向滚动可靠。
 * 浮层挂在 `.editor-pane__stage` 上（host 的父层），所以再补一个「host 相对 stage」的偏移即可。
 *
 * 【拖动怎么改选区】
 * 按下时把**对面那一端**的位置存成 `fixed`，此后每次移动都用
 * `getTargetAtClientPoint()` 把手势坐标换回 model 位置，再 `setSelection(Range.fromPositions(fixed, next))`。
 * 选区、高亮、状态栏的「已选中 N 字符」全部仍由 Monaco 自己维护，这里不碰任何渲染。
 *
 * ⚠️ **换行的判据是「手柄顶边走完一整行」，不是「指尖落在哪一行」**（`drag.handleTop`）。
 * 手柄挂在行底往下伸，盒子**顶边**本来就贴在「选中这一行的下沿」上；拖动时整个盒子跟着手指走
 * （`左上角 = 指尖 − grip`，`grip` 是按下那一刻量到的落点，横纵各一份、全程不变，所以按下去不会跳），
 * 换行只看这条顶边：**上、下都要走满 0.8 行**（`ROW_SWITCH_RATIO`）。做法是「拿哪个 y 去命中」
 * （`applyDrag()` 里的 `probeY`）：往下用「顶边 − 0.8 行」、往上用「顶边 − 0.2 行」，
 * 两个方向各欠 0.8 行，迟滞带宽 1.6 行，既有缓冲、又不会两头手感不一。
 * 早先的做法是拿「指尖往上抬一个指腹的命中点」去 `getTargetAtClientPoint()`，行由那个点决定 ——
 * 那个点比手柄顶边还高十几到几十 px，于是手指还没到位、行就先变了，手柄与指尖之间像隔着一根
 * 橡皮筋（2026-11-14 触屏用户报：手柄不跟手，换行阈值不对）。
 * 更早还有一版「顶边一压进下一行就换」：往下只要 1px、往上一整行，手感一头轻一头重
 * （2026-11-14 用户报：往下也要留缓冲 → 先改成走满一行 → 再改成上下各 0.7 行 → 定在 0.8 行）。
 *
 * ⚠️ 同样地，**端点也不再是指尖**：端点落在手柄顶边所在的那一行，手指在下面拖着，
 * 选中与圆点都露在它外侧 —— 早先直接拿 `event.clientY` 命中，端点被拽到指尖底下，
 * 选中的那一处整个被手指盖住，用户只能靠放大镜猜（2026-11-14 触屏用户报：太反直觉）。
 *
 * ⚠️ **手柄拖动永远不该把选区拖成空**（`applyDrag()` 里那个 `equals(drag.fixed)` 的提前返回）。
 * 空选区没有手柄可抓、高亮也整块消失，手指却还在拖一个看不见的东西 —— 观感就是「拖着拖着选区没了」。
 * 两条路都会撞上：越过钉住的那一端（穿过时长度必为 0，一帧空窗）、以及落点被夹在文档开头
 * 而钉住的那一端正好也在 `1:1`（一路往上的终点，空窗会一直持续，直到往回拖）。原生控件同样会把
 * 两端对调后继续选，而不是塌成光标，这里照此办理：落点压在钉住的那一端上时**这一帧不动**，
 * 保留上一个非空端点（2026-11-14 用户报：拖右边手柄到第一行往上，选中的区域直接消失）。
 *
 * ⚠️ **拖动期间必须让手柄对命中测试隐身**（`dragging` → CSS 的 `.is-dragging`）。
 * `getTargetAtClientPoint` 在没传 `eventTarget` 时会**自己做一次 DOM 命中测试**
 * （`mouseTarget.js` 的 `HitTestRequest._useHitTestTarget`），而我们的手柄是编辑器 DOM
 * **之外**的元素 —— 落点压在手柄上时，`_hitTestViewLines` 拿到的 target 不在 `.overflow-guard`
 * 里，于是整条链走到 `fulfillUnknown()`，返回 `type: 0 / position: null`，`applyDrag` 直接
 * 放弃这一帧。后果是**手指一旦移进手柄自己那 44px 的盒子里就再也拖不动了**（实测：
 * 起点手柄往上拖一行的距离正好落在盒内，拖动当场卡死；x 轴上扫一遍能看到
 * `elementFromPoint` 从 `span.selection-handle--start` 切到 `span.mtk8` 的那一列就是分界）。
 * `pointer-events: none` 的元素会被 `elementFromPoint` 跳过，所以拖动一开始就把两颗手柄
 * 都设成隐身即可；监听挂在 window 上、触摸另有隐式指针捕获，拖动本身不受影响。
 *
 * 【按住手柄不动 450ms = 第二拍（弹菜单）（2026-11-18 加）】
 * 两拍长按（选词一拍、选区里再长按一拍弹菜单，见 useEditorMenu.js 文件头）有个洞：
 * 第二拍最自然的落点——**圆点与手柄的热区**——根本到不了那条路。长按计时器挂在 host
 * 的 pointerdown 上，而手柄层住在 stage 里（host 的兄弟层），按住圆点只会被
 * `onHandleDown` 当场抓成拖拽现场（放大镜弹出、is-dragging 挂上），450ms 时什么
 * 都不发生 —— 用户看到的就是「无论如何长按都唤出手柄，菜单唤不出」（2026-11-18 报）。
 * 修法与 iOS 同款：**长按已选中的内容（含手柄）= 弹菜单**。按下那一刻起表
 * （`HANDLE_LONG_PRESS_MS`，与文本那条 450ms 同口径），到点还没动就整场退掉抓取
 * （`abortDrag`，选区不动）并在按点弹菜单；动了（> `HANDLE_LONG_PRESS_SLOP`）就是
 * 真拖拽，长按作废。判定期间放大镜也不出（它挪到第一发 `applyDrag()` 才画）——
 * 按住不动的窗口里画面保持干净，不再「先闪一下放大镜又收掉」。
 *
 * 【只对触摸出手柄】
 * 桌面鼠标本来就有一条「按住拖选」的路，再挂两颗圆点只会碍事（也挡不住手柄底下的点击）。
 * 判据是「最近一次落在编辑区的指针是不是触摸」：初值取触摸屏的两种口径
 * （`isTouchPointer()` 看粗指针、`navigator.maxTouchPoints` 看有没有触摸硬件，后者是给
 * 「触摸屏笔记本 + 鼠标」这种粗指针为 fine 的设备兜底），之后每次 `pointerdown` 按
 * `pointerType` 更新 —— 鼠标一按就收起来，不需要猜设备型号。
 *
 * 【两颗手柄的几何：完全同一套，盒顶都贴「自己那一行的下沿」】
 * 起点手柄管选区**第一行**的起点、终点手柄管**最后一行**的终点，两颗都取那一行的
 * `top + height`（行底）当锚点，盒子从锚点往下伸、圆点贴盒顶、杆朝上接文字（原来那两套
 * 「朝上 / 朝下」的类已并进基类，只剩一份样式）。于是 `place()` 里没有任何分支：
 * 同样的算式、同样的夹取，只有喂进去的行不同。
 * 圆点中心恒在这一行下方 14px（= `KNOB_GAP + KNOB_SIZE / 2`），长什么样靠 CSS 一套决定。
 *
 * ⚠️ 曾经的做法与教训（别再改回去）：端点是选区**上沿**时若也「朝下」，盒子就落进行内、
 * 圆点正好盖住行首文字（实测圆点 `104..120` 对行 `98..119`，`void` 的 `v` `o` 被挡）；
 * 改成「朝外」（起点朝上、终点朝下）则是两套朝向、两套夹取，代码分叉且不对称。
 * 现在统一挂行底：左手柄的圆点落在第一行与第二行之间的行缝里，**不挡行首文字**，
 * 两端也终于只有一份几何逻辑。代价是它和右手柄可能落到同一侧，见下面那条 ⚠️。
 *
 * ⚠️ 由此带来的唯一一个坑：两端在**同一行**时（单行选区、或两端恰好同一行）两个 44px 盒子
 * 几乎完全重叠，DOM 里后渲染的终点手柄会抢走落点 —— 点左边那颗圆点、拖的却是右边。
 * 所以按下时不看事件落在哪个元素上，改按**圆点圆心距离**认领（`nearestHandle()`）。
 *
 * 盒子位置仍夹在编辑器可视区内：端点滚出视口时手柄贴在边上，不会飘到页签栏或状态栏上。
 *
 * ⚠️ 静止时贴行底，**拖动时那颗被抓的横纵两个方向都跟手**（`update()` 里用 `drag.handleLeft /
 * handleTop` 覆写整个盒子的左上角）。跟手是「手柄到哪儿、选中的行就到哪儿」的前提：判据全部
 * 建立在手柄顶边之上，手柄若还钉在行底，换行就只能按手指位移猜，手感与看到的位置对不上。
 * 横向同理 —— 若只让纵向跟手、横向还挂在端点那一列上，端点会吸附到字符边界，圆点就与指尖
 * 差开最多一个字符宽，往右拖时看着像被一根横着的橡皮筋拽着（2026-11-14 触屏用户报：
 * 「跟手是横向和纵向都跟着手的移动，而不是只在纵向」）。
 *
 * 【拖动时那颗「放大镜」胶囊（`probe`）】
 * 手指按住手柄时，指头本身把落点附近的代码全挡住了 —— 胶囊把**选区端点周围那一片代码**
 * 原样搬到**指针（＝端点所在那一行）的上方**。iOS 的放大镜是同一个动机，只是那边会放大
 * （它要看清插入点在哪两字之间）；这边要的是「到底选中了哪一处」外加一点上下文，
 * **原尺寸**反而更好读，所以 `LENS_ZOOM` 是 1；镜片本身也只有 `LENS_ROWS` 行高 × `LENS_COLS`
 * 字符宽（默认 14px 等宽下约 42×67），尺寸按编辑器当下的字体度量**现算** ——
 * 用户改了字号 / 行高，它跟着变，见 `lensSize()`。它只在**拖手柄期间**存在，松手即撤。
 *
 * ⚠️ **横向纵向都跟着「指针」走，不再跟指尖**：横向锚在端点那一列、纵向锚在端点那一行，
 * 也就是真正参与命中的那个点（`drag.at`）—— 手指在一行之内的上下位置本来就没有意义，
 * 逐像素跟着手抖反而看不清罩住的是哪一行（2026-11-14 用户要求）。
 * 而且**永远挂在行上方，不翻到下方**：编辑区上方是页签栏，那一条允许被镜片盖住；
 * 翻面会让镜片在拖动中忽然跳到另一行，比压住页签更难理解。只有贴近视口上沿时
 * 光束会收短、让镜片整体留在屏内（见 `syncProbe()`）。
 *
 * 【为什么是「搬 DOM」而不是截图 / 第二个编辑器】
 * 主编辑器的 `.view-lines` / `.view-overlays` / `.cursors-layer` 三层，外加 `.selection-handles`
 * 里那两颗手柄（手指正抓着哪一端，镜片里得看得见），一共四层的 `innerHTML` 直接搬进胶囊。
 * Monaco 的 token 颜色是**全局**规则（`.mtk1 { color: … }`，见
 * `common/languages/supports/tokenization.js` 的 `generateTokensCSSForColorMap`），
 * 选中背景 / 当前行 / 缩进参考线则是 `.monaco-editor .xxx` 前缀的规则 —— 所以只要给胶囊挂上
 * `monaco-editor` + 主题类名（`vs-dark` / `vs`），搬过来的 DOM 当场就是原来的样子：
 * 不截图、不 `cloneNode`、不开第二个编辑器实例，一帧只是四次 `innerHTML` 赋值。
 * 手柄那一层多一步坐标换算：它的 `left / top` 相对 stage，得先减掉 `.view-lines` 在 stage 里的偏移
 * 才落到内容坐标上（见 `paintProbe()`）。
 *
 * ⚠️ 搬得走 `innerHTML`，搬不走**宿主元素自己的内联样式** —— Monaco 把字体写在 `.view-lines`
 * 的内联 style 上（`vs/editor/browser/config/domFontInfo.js` 的 `applyFontInfo()`：font-family /
 * font-weight / font-size / font-feature-settings / font-variation-settings / line-height /
 * letter-spacing），只搬 DOM 的话 `.magnifier__lines` 会退化成从页面继承来的无衬线字体。
 * 实测（monaco 0.56 + 站内主题）：镜片里的字是 13px 系统字体而非 14px 等宽，同一个 `#include`
 * span 真实宽 67.44px、镜片里只有 51.94px —— 差 23% 且**不是等宽**，整行字距全是错的，
 * 「镜片里的代码和编辑器里一样大」就成了空话。所以 `copyFontInfo()` 每帧照抄那几个属性
 * （旁边另有一条同样的坑：字体**不能**靠 `var(--vscode-editor-font-*)` 取，这版 monaco
 * 根本不输出这几个变量，实测六个全空）。
 *
 * ⚠️ 搬进来的是**内容坐标**：`.view-line` 与 overlay 子层的内联 `top` 就是该行相对内容原点的 y
 * （实测第 1 行是 14px 而不是 0，所以别拿「行号 × 行高」去推），横向的内联 `left` 同理。
 * 于是「把选区端点推到镜片正中心」只需要给这些内容套一个 `translate + scale`
 * （`transform-origin: 0 0`，见 `paintProbe()`）：
 *   tx = 镜片宽/2 − 倍数 × (端点 x − `.view-lines` 左缘)
 *   ty = 镜片高/2 − 倍数 × (那一行中心的 y − `.view-lines` 顶缘)
 * 两处都用 `getBoundingClientRect()` **量出来的真实位置**，不复刻滚动偏移 —— 编辑器的横竖滚动
 * 全写在 `.lines-content` 的内联 transform 上（`translate3d(-scrollLeft, -scrollTop, 0)`），
 * 量一次就都带上了。倍数为 1 时这两条就退化成 `t = c − p0`（纯平移，镜片里与编辑器逐像素同级）。
 *
 * ⚠️ 与手柄同一条命中测试的坑：**胶囊必须对命中测试隐身**（`pointer-events: none`）。
 * 它 Teleport 到了 body 上，是编辑器 DOM 之外的元素；一旦它压在手指落点上，
 * `getTargetAtClientPoint` 就会走 `fulfillUnknown()` 返回 `position: null`，拖动当场卡死
 * （机制见文件头那条 ⚠️，`.selection-handles` 里那两颗是同一回事）。
 *
 * ⚠️ 位置算好再交给模板（viewport 坐标 + 光束长度 + 镜片尺寸），模板只管画：
 * 夹取要用 `--ui-scale` 与视口尺寸，这些东西待在 CSS 里拿不到。镜片尺寸也由这里发出去
 * （`--probe-lens-w / -h / -gap`），**只此一份常量** —— 与 `.magnifier*` 的 CSS 不重复定义。
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { monaco } from '../monaco-setup.js'
import { isTouchPointer } from './useMobileKeyboard.js'

/**
 * 手柄盒子的逻辑尺寸 —— **必须与 `.selection-handle` 的 CSS 宽高一致**。
 * 那一边写 px，构建期被 postcss-pxtorem 转成 rem、跟着 `--ui-scale` 缩放，
 * 所以这里读一次 `--ui-scale` 再乘上去，两边才是同一套屏幕坐标（见 `uiScale()`）。
 */
const HANDLE_BOX = 44
/** 圆点直径与它离盒子端边的间距 —— 同样必须与 `.selection-handle::before` 的 CSS 一致 */
const KNOB_SIZE = 16
const KNOB_GAP = 6
/** 手指拖到距编辑器上下边这么近就开始自动滚动（逻辑 px） */
const EDGE_ZONE = 32
/** 自动滚动每帧的量（逻辑 px） */
const EDGE_STEP = 8
/** 拖动时把坐标再往内容区里推一点，免得落在行号槽上拿不到 position */
const CONTENT_PAD = 2
/**
 * 换行阈值（**行高的比例**）：往上、往下都是 0.8 行。盒顶静止时贴在「本行的下沿」，
 * 走满这个比例就换行 —— 一整行太迟钝，一压进下一行就换又只有 1px，
 * 0.8 是 2026-11-14 触屏用户点的数（0.7 试过，偏灵敏）。
 */
const ROW_SWITCH_RATIO = 0.8
/**
 * 手柄上的长按判定：按住 450ms 不动 = 第二拍（弹菜单），动了 = 真拖拽。
 * 与 useEditorMenu.js / useTreeDrag.js 的 LONG_PRESS_MS 同口径 —— 改一处要三处对齐，
 * 不然「文本上的长按」和「手柄上的长按」手感会分岔。
 */
const HANDLE_LONG_PRESS_MS = 450
/** 长按判定的位移窗（同 useEditorMenu 的 MOVE_SLOP）：动过这么多就当拖拽，撤掉长按 */
const HANDLE_LONG_PRESS_SLOP = 10
/**
 * 放大镜镜片的参数（逻辑 px）。这几个数是**唯一出处** —— 镜片尺寸由 `syncProbe()` 连同位置
 * 一起写进 `--probe-lens-w / -h / -gap`，CSS 只消费变量，不再重复写一遍。
 * 逻辑 px 同样要乘 `uiScale()`（CSS 那边写 px 会被 postcss-pxtorem 转 rem、跟着 --ui-scale 缩，
 * 这边走内联 px 就得自己乘，否则缩放一改镜片就和内容对不上）。
 */
/** 镜片装几行高 / 几个字符宽。**镜片是胶囊形**（CSS 那边 `border-radius: 999px`），
 *  所以高就是两端半圆的直径 —— 高改小，两个端头跟着一起收。
 *  两个数都取**整数行 / 整数格**：里面是整行整行的代码、逐格的等宽字，卡在半行或半格上
 *  只会看到两截。 */
const LENS_ROWS = 2
const LENS_COLS = 8
/** 镜片里内容的放大倍数。**1 = 里面的代码与编辑器里一模一样大**（镜片就是个「搬过来的窗口」，
 *  不是放大镜）。要放大就把它调上去，但镜片尺寸得同步放大同一个倍数才是同一片内容。 */
const LENS_ZOOM = 1
/** 镜片最近那条边离**选中那一行**的距离 —— 也就是那条光束的长度（贴到视口上沿时会被收短） */
const LENS_GAP = 22
/** 镜片离视口左右边 / 上下边至少留出的余量 */
const PROBE_SAFE = 10

/**
 * Monaco 写在 `.view-lines` **内联样式**上的那几个字体属性 —— 与
 * `vs/editor/browser/config/domFontInfo.js` 的 `applyFontInfo()` 一一对应。
 * 写死一份名单而不是遍历 `style` 按前缀挑：Safari 上 `CSSStyleDeclaration` 不可迭代
 * （`for…of` 直接 TypeError），而这套东西主要就跑在手机上。
 */
const FONT_PROPS = [
  'font-family',
  'font-weight',
  'font-size',
  'font-feature-settings',
  'font-variation-settings',
  'line-height',
  'letter-spacing',
]

/**
 * 把 `.view-lines` 的内联字体照抄到镜片里的那一层上（为什么必须抄见文件头那条 ⚠️）。
 * 逐条 `setProperty` / `removeProperty`：属性名是白的，值原样搬，不解析、不做单位换算。
 */
function copyFontInfo(from, to) {
  for (const prop of FONT_PROPS) {
    const value = from.style.getPropertyValue(prop)
    if (value) to.style.setProperty(prop, value)
    else to.style.removeProperty(prop)
  }
}

/**
 * 镜片该多大 —— 按**编辑器当下真实的字体度量**算，而不是写死像素。
 *
 * 字号（`fontSize`，8–32）与行高倍数（`lineHeightRatio`）都是设置项，用户一改，行高与字符宽
 * 全变；写死的 `LENS_H` 在 32px 字号下连一行都装不满，「两行高」这个语义当场就没了。
 * 所以取 `EditorOption.fontInfo` 的 `typicalHalfwidthCharacterWidth`（等宽字体下就是每个字符的
 * 宽度）与 Monaco 报的行高，各乘行数 / 格数。
 *
 * ⚠️ 这两个值**已经是屏幕 px，不要再乘 `uiScale()`**：`editorOptions()` 下发 fontSize / lineHeight
 * 时就乘过 scale 了（见 services/editorOptions.js 的「全局缩放的补偿点」），而行高直接取自
 * `getScrolledVisiblePosition()` 的返回值 —— 它们本来就是缩放后的真实像素。
 * 这一点与旁边的 `LENS_GAP` / `PROBE_SAFE` 不同：那两个是「逻辑 px × uiScale()」。
 */
function lensSize(instance, tip) {
  const info = instance.getOption(monaco.editor.EditorOption.fontInfo)
  // 兜底链：等宽字体三条都有值；万一某条缺失（比如字体还没量完），按 0.6 em 估一个
  const charWidth =
    info.typicalHalfwidthCharacterWidth || info.spaceWidth || info.fontSize * 0.6
  return {
    lensW: Math.round(charWidth * LENS_COLS),
    // 行高取 Monaco 报的那一份（与 `paintProbe()` 里对齐行中心用的是同一个数）
    lensH: Math.round(tip.height * LENS_ROWS),
  }
}

/**
 * @param {{
 *   editor: import('vue').Ref,
 *   host: import('vue').Ref,
 *   stage: import('vue').Ref,
 *   active: import('vue').Ref<boolean>,
 *   magnifier: import('vue').Ref<HTMLElement|null>,
 *   onLongPress?: (clientX: number, clientY: number) => void,
 * }} options
 *   `editor` = Monaco 实例（setup 里还是 null，由 watch 在它出现时补订阅）
 *   `host` = 编辑器容器（指针类型探测挂它）
 *   `stage` = 浮层的定位父层（手柄坐标相对它）
 *   `active` = 编辑区此刻真的露着（被设置 / 抽题 / 预览盖住时为 false，手柄整层收掉）
 *   `magnifier` = 放大镜那层的外壳（EditorPane 里 v-if 出来的，`paintProbe()` 往它里面搬 DOM）
 *   `onLongPress` = 按住手柄不动 450ms（第二拍）时回调，参数是按压点坐标。
 *     由 EditorPane 接到 useEditorMenu 的 `openMenu` 上 —— 菜单的判空 / 条目 / 定位都同源。
 */
export function useSelectionHandles({ editor, host, stage, active, magnifier, onLongPress }) {
  /** 两颗手柄：相对 stage 的**盒子左上角**；null = 当下不该显示 */
  const handles = ref(null)

  /**
   * 是否正在拖。模板拿它挂 `.is-dragging`，好让手柄在拖动期间对命中测试隐身
   * （为什么必须这么做见文件头那条 ⚠️）。
   */
  const dragging = ref(false)

  /**
   * 拖动期间的放大镜胶囊；null = 不显示（没在拖）。
   * `{ left, top, lensW, lensH, gap, anchorX, lineTop, lineHeight }`：
   * `left / top` 是**视口坐标**（胶囊 Teleport 到 body、fixed 定位，不必换算 stage 偏移），
   * 两者都取**选区端点**的坐标（跟着指针走：横向那一列、纵向那一行的顶边，镜片永远挂在上方）；
   * 后面几个是给 `paintProbe()` 算反向位移用的现场（`anchorX` 就是 `left` 那个点）。
   */
  const probe = ref(null)

  /** 最近一次落在编辑区的指针是不是触摸 */
  const touchActive = ref(
    typeof navigator !== 'undefined' &&
      (isTouchPointer() || navigator.maxTouchPoints > 0),
  )

  /** Monaco 事件订阅，实例就绪时挂、卸载 / 换实例时摘 */
  let disposables = []
  /** 拖动现场；null = 没在拖 */
  let drag = null
  /**
   * 手柄上的长按现场（2026-11-18 加）：按下圆点 / 热区那一刻起表，按住不动 450ms
   * 就是第二拍 —— 整场退掉这次「抓取」、在按点弹菜单；动了（> slop）就是真拖拽，
   * 撤掉长按。`null` = 已触发 / 已撤销 / 没在按。
   */
  let handlePress = null
  /**
   * 手柄长按弹菜单之后的「滚动锁」（2026-11-18 用户报，与 useEditorMenu.js 的
   * touchLock 同一条口径）：菜单已出、手指未松时继续滑动，内容不许滚动 / 翻动。
   * 触摸事件始终派发在 touchstart 的目标元素上 —— 手柄上的长按，后续 touchmove
   * 沿 stage 一路冒泡，**根本不经过 host**，useEditorMenu 那把锁够不着，所以
   * 这里在 stage 上自己拦（stage 是 host 的父层，恰好覆盖手柄这条链）。
   * 锁到 touchend（全部手指离开）/ touchcancel / 下一次 pointerdown 解除。
   */
  let touchLock = false
  /** 边缘自动滚动的 rAF 句柄 */
  let edgeFrame = 0
  /** 重算的 rAF 句柄（滚动 / 选区变动会成串地来，一帧算一次够了） */
  let updateFrame = 0

  /** `--ui-scale` 是 `applyUiScale()` 写在 `<html>` 上的无单位倍数，读不到就按 1 */
  function uiScale() {
    if (typeof document === 'undefined') return 1
    const value = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--ui-scale'),
    )
    return Number.isFinite(value) && value > 0 ? value : 1
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max)
  }

  // --------------------------------------------------------------- 算位置

  function schedule() {
    if (updateFrame) return
    updateFrame = window.requestAnimationFrame(() => {
      updateFrame = 0
      update()
    })
  }

  function update() {
    const instance = editor.value
    const hostEl = host.value
    const stageEl = stage.value
    if (
      !instance?.getModel() ||
      !hostEl ||
      !stageEl ||
      !active.value ||
      !touchActive.value
    ) {
      handles.value = null
      syncHandlesLayer()
      return
    }
    const selection = instance.getSelection()
    if (!selection || selection.isEmpty()) {
      handles.value = null
      syncHandlesLayer()
      return
    }

    const hostRect = hostEl.getBoundingClientRect()
    const stageRect = stageEl.getBoundingClientRect()
    const dx = hostRect.left - stageRect.left
    const dy = hostRect.top - stageRect.top
    const viewW = hostEl.clientWidth
    const viewH = hostEl.clientHeight
    const scale = uiScale()
    const box = HANDLE_BOX * scale
    /** 圆点半径 —— 夹取时按「圆点不出可视区」算，盒子超出的那部分交给 overflow 裁 */
    const halfKnob = (KNOB_SIZE / 2) * scale
    /** 圆点整个露出来所需的最小边距（＝圆点到盒子那一条端边的距离） */
    const inset = (KNOB_GAP + KNOB_SIZE) * scale

    /**
     * `pos` → 盒子的左上角（相对 stage）。
     *
     * **一条规则，两端共用**：锚点一律取那一行的**下沿**（`top + height`），盒子从锚点往下伸，
     * 圆点贴盒顶、杆朝上接文字。两颗手柄唯一的差别是喂进来的是哪一行 —— 起点喂选区第一行、
     * 终点喂最后一行，`place()` 里没有任何分支。
     *
     * 为什么是行底而不是端点自己那条边（2026-11-14 定）：端点在选区上沿时「朝下」会把圆点
     * 送进行内、盖住行首文字（实测圆点 104..120 对行 98..119，`void` 的 `v` `o` 被挡）；
     * 改成「朝外」（起点朝上、终点朝下）则要两套朝向 + 两套夹取，代码分叉。统一挂行底两头都占：
     * 左手柄的圆点落在第一行与第二行之间的行缝里，不挡字，两端也只有一份几何。
     *
     * ⚠️ 夹取**只保证圆点不出可视区** —— 盒子为了凑满 44px 触摸目标必然超出文字那一条，
     * 那部分由 `.selection-handles` 的 `overflow: hidden` 裁掉。这样圆点始终完整可见可抓，
     * 而编辑器之外（页签栏 / 状态栏）不会留下一块看不见的点击区。
     * **左右边界的修正是减号**（`halfKnob`）：写成 `viewW + halfKnob` 会让圆点中心跑到右缘外
     * 8px、被裁掉一半（2026-11-14 修）。
     */
    function place(pos) {
      if (!pos) return null
      // 整行都滚出去了就没有意义；只露半行时仍留手柄（贴在边上）
      if (pos.top + pos.height <= 0 || pos.top >= viewH) return null
      const anchorX = pos.left + dx
      const anchorY = pos.top + pos.height + dy
      const left = clamp(anchorX - box / 2, halfKnob - box / 2, viewW - halfKnob - box / 2)
      // 盒顶贴行底、透明热区最多伸出视口底边 (box - inset)
      const top = clamp(anchorY, 0, viewH - inset)
      return { left: Math.round(left), top: Math.round(top) }
    }

    const next = {
      start: place(instance.getScrolledVisiblePosition(selection.getStartPosition())),
      end: place(instance.getScrolledVisiblePosition(selection.getEndPosition())),
    }
    /**
     * 拖动中，**手指抓着的那一颗横纵都跟手**：左上角取 `drag.handleLeft / handleTop`，
     * 不再用 `place()` 给的行底 + 端点列。静止时贴那一格是「手柄属于这一行/这一列」的提示；
     * 拖动时这条信息已经由选区高亮在报，手柄再钉在格子上就会与手指脱开一段、越拖越错位
     * （2026-11-14 用户报：跟手是横向和纵向都跟着手走）。
     *
     * 抓的是哪一颗由 **`drag.fixed` 现在落在哪一端**决定，不能看 `drag.which`：手拖过对面
     * 那一端之后 Monaco 会把 start / end 对调，`which` 记的仍是按下时那个名字，而手指按着的
     * 始终是同一颗 —— 跟手的应该是「不是钉住端」的那一颗。
     */
    if (drag && drag.handleTop !== null) {
      const pinnedIsStart = selection.getStartPosition().equals(drag.fixed)
      const key = pinnedIsStart ? 'end' : 'start'
      const target = next[key]
      if (target) {
        // 与 `place()` 同一套夹取：圆点不出可视区，盒子超出的部分交给 overflow 裁
        const left = clamp(
          drag.handleLeft - stageRect.left,
          halfKnob - box / 2,
          viewW - halfKnob - box / 2,
        )
        const top = clamp(drag.handleTop - stageRect.top, 0, viewH - inset)
        next[key] = { left: Math.round(left), top: Math.round(top) }
      }
    }
    handles.value = next.start || next.end ? next : null
    syncHandlesLayer()
  }

  /**
   * 镜片里那层手柄要跟着 `handles.value` 的 DOM 渲染走，不能在 `paintProbe()` 里顺手搬
   * —— 两者的时序差一帧，理由见 `paintHandles()` 的注释。
   */
  function syncHandlesLayer() {
    if (probe.value) nextTick(paintHandles)
  }

  // --------------------------------------------------------------- 拖动

  /**
   * 那一颗手柄**盒子左上角**在视口里的坐标 —— 按下时用它算出「指尖在盒子里的落点」
   * （`gripX / gripY`），之后整段拖动都按「盒子左上角 ＝ 指尖 − 落点」跟手（见 `applyDrag()`）。
   * `handles` 还没量出来（首帧 / 端点在视口外）时返回 null，交给 0 兜底。
   */
  function boxOriginOf(which) {
    const stageEl = stage.value
    const box = handles.value?.[which]
    if (!stageEl || !box) return null
    const rect = stageEl.getBoundingClientRect()
    return { left: rect.left + box.left, top: rect.top + box.top }
  }

  /**
   * 指针离哪颗手柄的**圆点圆心**更近 —— 只用来决定「这一按算抓住了哪一颗」。
   *
   * 两颗都挂行底之后，只要两端在同一行（单行选区、或两端恰好同一行），两个 44px 盒子就几乎
   * 完全重叠；DOM 里靠后渲染的终点手柄会抢走落点：点左边那颗圆点，拖动改的却是右边
   * （实测单行 2 字符选区：起点圆点在 cx 110，`elementFromPoint` 给的是 `--end`）。
   * 所以不信「事件落在哪个元素上」，按下时按圆心距离重选一次。
   * 两颗离得开（正常的多行选区）时这条与元素归属一致，不会改变行为。
   */
  function nearestHandle(which, event) {
    const current = handles.value
    const stageEl = stage.value
    if (!current?.start || !current?.end || !stageEl) return which
    const stageRect = stageEl.getBoundingClientRect()
    const scale = uiScale()
    /** 盒子左上角（stage 坐标）→ 圆点圆心的视口坐标 */
    const center = (handle) => ({
      x: stageRect.left + handle.left + (HANDLE_BOX * scale) / 2,
      y: stageRect.top + handle.top + (KNOB_GAP + KNOB_SIZE / 2) * scale,
    })
    const start = center(current.start)
    const end = center(current.end)
    const toStart = Math.hypot(event.clientX - start.x, event.clientY - start.y)
    const toEnd = Math.hypot(event.clientX - end.x, event.clientY - end.y)
    return toEnd < toStart ? 'end' : 'start'
  }

  function onHandleDown(pressed, event) {
    const instance = editor.value
    const selection = instance?.getSelection()
    if (!instance || !selection || selection.isEmpty()) return
    event.preventDefault()
    event.stopPropagation()
    // 上一发长按万一没等到 touchend（监听被摘、元素被换之类），锁不能带进新手势
    touchLock = false
    // 两颗盒子叠在一起时（见 `nearestHandle()`），按圆心距离认领这一按
    const which = nearestHandle(pressed, event)
    // 对面那一端全程钉住；自己这一端跟着手指走
    const fixed = which === 'start' ? selection.getEndPosition() : selection.getStartPosition()
    const moving =
      which === 'start' ? selection.getStartPosition() : selection.getEndPosition()
    /**
     * 盒子左上角此刻在视口里的位置，以及指尖离它多远（横纵各一份）。
     * 之后的整个拖动都按「左上角 = 指尖 − grip」跟手；`grip` 是按下那一刻的既成事实，
     * 所以按下去盒子留在原处、不会跳（见文件头那条 ⚠️）。
     */
    const origin = boxOriginOf(which)
    drag = {
      pointerId: event.pointerId,
      /** 手指抓起的是哪一颗 —— 只作记录：拖过对面那一端后角色会交换（见 `update()`） */
      which,
      fixed: new monaco.Position(fixed.lineNumber, fixed.column),
      /** 手指下那一端此刻落在哪儿；胶囊报的就是它（见 `syncProbe`） */
      at: new monaco.Position(moving.lineNumber, moving.column),
      /** 指尖比盒子左上角低 / 右多少；拖动中恒定，左上角就一直是「指尖 − grip」 */
      gripX: origin ? Math.max(event.clientX - origin.left, 0) : 0,
      gripY: origin ? Math.max(event.clientY - origin.top, 0) : 0,
      /** 左上角在视口里的坐标；每帧由 `applyDrag()` 重算 */
      handleLeft: origin ? origin.left : event.clientX,
      handleTop: origin ? origin.top : event.clientY,
      x: event.clientX,
      y: event.clientY,
    }
    // 先把两颗手柄对命中测试隐身，再收后续事件 —— 顺序反了第一帧就会撞上「落点在盒子里」。
    dragging.value = true
    // 放大镜**不在这里出**：它随第一发 `applyDrag()`（真拖动）出现。按住不动的那 450ms
    // 是「长按 = 第二拍弹菜单」的判定窗（见 fireHandleLongPress），判定期间画面应当
    // 保持干净 —— 上一版按下去放大镜当场弹出，长按弹菜单时它又跟着撤，看着像闪了一下。
    window.addEventListener('pointermove', onDragMove, { passive: false })
    window.addEventListener('pointerup', onDragEnd)
    window.addEventListener('pointercancel', onDragEnd)
    // 长按判定窗。⚠️ 不能指望 useEditorMenu 那条长按：它的计时器挂在 host 的
    // pointerdown 上，而手柄层住在 stage 里（host 的**兄弟**层），host 的监听够不着
    // —— 过去按住圆点 / 热区只会被当场抓成拖拽，菜单在最自然的落点上永远开不出来
    // （2026-11-18 用户报「无论如何长按都会唤出手柄，无法唤出菜单」）。
    handlePress = { x: event.clientX, y: event.clientY }
    handlePress.timer = window.setTimeout(fireHandleLongPress, HANDLE_LONG_PRESS_MS)
  }

  /**
   * 长按判定到点：按住圆点 / 热区不动满 450ms = **第二拍**（iOS 的口径：长按已选中的
   * 内容 = 弹菜单 —— 圆点与热区是选区最醒目的部分，用户「再长按一下选区」最自然的
   * 落点就是它俩）。做三件事：
   * 1. 整场退掉这次「抓取」（`abortDrag` 只清现场、选区一个字都不动）；
   * 2. 之后手指再怎么动都不再有拖拽效果 —— 监听已摘、`drag` 已清（`onDragMove`
   *    见 `!drag` 早退）；
   * 3. 在按压点开菜单（EditorPane 把它接到 useEditorMenu 的 `openMenu`）。
   */
  function fireHandleLongPress() {
    if (!handlePress || !drag) return
    const { x, y } = handlePress
    handlePress = null
    // 从这一刻到松手，内容不许滚动 / 翻动（见 touchLock 的注释）。
    // 能走到这里说明手指必然还按着：动了超过 slop 的那几发 pointermove
    // 早就把 handlePress 清了（见 onDragMove），计时器到点前被清就不会进这里。
    touchLock = true
    abortDrag()
    onLongPress?.(x, y)
  }

  // ------------------------------------------------- 长按菜单开着时的滚动锁

  /**
   * 手柄长按弹菜单后、手指未松时的锁（口径见 useEditorMenu.js 的同名组）：
   * touchmove 一律 `preventDefault + stopPropagation` —— 前者挡住祖先滚动容器的
   * 原生滚动，后者让任何监听更深处的手势层（包括 Monaco 自己的）都收不到。
   * 监听常驻、锁没开就早退，普通拖手柄 / 滑动零影响；注意拖手柄途中的
   * 边缘自动滚动（stepEdgeScroll）走的是 `setScrollTop`，不经 touch 事件，不受影响。
   */
  function onTouchMoveLock(event) {
    if (!touchLock) return
    event.preventDefault()
    event.stopPropagation()
  }

  /**
   * 长按这一手的收尾同样什么都不做：preventDefault 掐掉合成鼠标事件
   * （松手点不许落成一次「点击手柄」或抢焦点），stopPropagation 不给
   * 任何手势层派发收尾事件的机会。最后一根手指离开才解锁。
   */
  function onTouchEndLock(event) {
    if (!touchLock) return
    if (event.touches.length === 0) touchLock = false
    event.preventDefault()
    event.stopPropagation()
  }

  /** 系统把触摸收走：锁当场解除，别把下一次手势也锁住 */
  function onTouchCancelLock() {
    touchLock = false
  }

  function onDragMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return
    // 动过了（超过长按的位移窗）= 这一按是真拖拽，长按判定当场作废
    if (
      handlePress &&
      (Math.abs(event.clientX - handlePress.x) > HANDLE_LONG_PRESS_SLOP ||
        Math.abs(event.clientY - handlePress.y) > HANDLE_LONG_PRESS_SLOP)
    ) {
      window.clearTimeout(handlePress.timer)
      handlePress = null
    }
    event.preventDefault()
    drag.x = event.clientX
    drag.y = event.clientY
    applyDrag()
    // 手柄跟手是「每帧都在变」的，而 `schedule()` 只挂在选区变动上 —— 行没换时
    // Monaco 不发事件，手柄就会卡在原地（见 `update()` 里那段覆写）。挂在 window 上
    // 的 pointermove 每次都会走到这里，靠 rAF 合并成每帧一次。
    schedule()
    pumpEdgeScroll()
  }

  function applyDrag() {
    const instance = editor.value
    const hostEl = host.value
    if (!instance || !hostEl || !drag) return
    const rect = hostEl.getBoundingClientRect()
    const layout = instance.getLayoutInfo()
    // 夹进可视区，且横向避开门线与行号槽（`getTargetAtClientPoint` 只认编辑器的矩形，
    // 越界返回 null，落在行号上则 position 为 null，两种都得先夹住）。
    const x = clamp(drag.x, rect.left + layout.contentLeft + CONTENT_PAD, rect.right - 1)
    /**
     * 左上角跟手：手指怎么动，盒子就怎么动（`gripX / gripY` 固定，见 `onHandleDown()`）。
     * 顶边那条线既是手柄画在哪儿，也是换行的判据 —— 两者用同一个值才不会各说各话；
     * 左缘纯属显示（端点那一列由下面 `x` 的命中决定），但横向不跟手，圆点就和指尖错开一格。
     */
    drag.handleLeft = drag.x - drag.gripX
    drag.handleTop = drag.y - drag.gripY
    /**
     * **换行阈值：上下都是 0.8 行 —— 靠「拿什么 y 去命中」实现迟滞。**
     *
     * 盒顶静止时贴在「本行的下沿」B 上，那条线同时也是下一行的上沿，所以命中点得挪一挪：
     * - 往下：拿 `顶边 − 0.8 行` 命中。顶边走到 B + 0.8 行才够到 B（换成下一行）。
     * - 往上：拿 `顶边 − 0.2 行` 命中。顶边走到 B − 0.8 行才越过本行上沿（换成上一行）。
     * 两个方向各欠 0.8 行、都从 B 起算，迟滞带宽 1.6 行，边界上不会来回抖。
     *
     * 挑哪一支看**顶边相对 B 的位置**：在 B 之上＝正在往上拖，用后者；到了 B 及以下用前者。
     * 换过行之后 B 跟着挪一行，回拖约 0.6 行即退回（换行点落在新 B 内侧 0.2 行处），
     * 不会出现「过去容易、回来难」那种死区。
     *
     * ⚠️ 别用「候选行在上/下方 + 比较候选行下沿」那种写法：向下只有落在**行界那 1px 窗口**
     * 才会认，手指快滑跳过窗口就永久卡住（2026-11-14 试过，作废）。
     */
    const currentSpan = instance.getScrolledVisiblePosition(drag.at)
    const restY = currentSpan ? rect.top + currentSpan.top + currentSpan.height : null
    const lineH = currentSpan ? currentSpan.height : 0
    const draggingDown = restY !== null && drag.handleTop >= restY
    const probeY = draggingDown
      ? drag.handleTop - lineH * ROW_SWITCH_RATIO
      : drag.handleTop - lineH * (1 - ROW_SWITCH_RATIO)
    const y = clamp(probeY, rect.top + 1, rect.bottom - 1)
    const position = instance.getTargetAtClientPoint(x, y)?.position
    if (!position) return
    /**
     * 落点正压在**钉住的那一端**上 → 选区长度为 0。这一帧什么都不做，保留上一个非空端点。
     *
     * 空选区是拖动的死胡同：手柄与高亮一起消失（`update()` 见 `isEmpty()` 就返回 null），
     * 而拖动还在继续 —— 手指拖着一个看不见的东西，只能靠松手重来。
     * 两条路都会走到这里：
     * - 越过钉住的那一端时，两端必有一刻重合（拖右边手柄往上越过起点就是这么过的）；
     * - 落点被夹在文档开头（`y` 顶到 `rect.top`、换算出来就是 `1:1`），而钉住的那一端正好也在 `1:1`
     *   —— 一路往上拖的终点，空窗会一直持续到往回拖为止（2026-11-14 用户报）。
     * 原生控件在两端相遇时是把它们对调后继续选，不会塌成光标；这里的效果相同：这一帧不动，
     * 越过之后 `Range.fromPositions()` 自己会把两端对调，选区在另一侧接着长。
     */
    if (position.equals(drag.fixed)) {
      // 选区没变，但自动滚动那一档里滚动变了，镜片还得重新贴行
      syncProbe()
      return
    }
    if (position.equals(drag.at)) {
      // 下行缓冲里只挪了手柄、端点没动：不必重设选区，镜片照旧贴当前端点
      syncProbe()
      return
    }
    drag.at = position
    instance.setSelection(monaco.Range.fromPositions(drag.fixed, position))
    syncProbe()
  }

  /**
   * 把拖动现场换算成胶囊的几何，然后（等胶囊真的渲染出来）把主编辑器那三层 DOM 搬进去。
   * `applyDrag()` 与 `stepEdgeScroll()` 都会走到，后者是手指贴边不动、靠自动滚动在改光标那一档。
   *
   * **横纵都跟指针、内容认选中位置**：胶囊的 `left / top` 取选区端点（`drag.at`）经
   * `getScrolledVisiblePosition` 换出来的那一格 —— 横向是端点那一列，纵向是那一行的顶边，
   * 整条挂在它上方。端点会吸附到字符边界，镜片里显示的那一片也锚在同一个点，于是镜片正中
   * 恒是「真正在选哪一处」，不会出现「镜片跟手走了、内容却钉在别处」的错位。
   *
   * ⚠️ 那个位置**不能**按「拖的是哪一端」去 `getSelection()` 上取：手拖过对面那一端之后
   * Monaco 会把 start / end 交换（`Range.fromPositions` 内部有序），此刻按 which 取到的是
   * **被钉住的那一端**，胶囊就会显示手指根本不在的那一行。只有 `drag.at`
   * —— 每次 `applyDrag()` 现算出来的落点 —— 才是指针所在那一处。
   */
  function syncProbe() {
    const instance = editor.value
    const at = drag?.at
    const tip = instance && at ? instance.getScrolledVisiblePosition(at) : null
    if (!tip) {
      probe.value = null
      return
    }
    const scale = uiScale()
    const { lensW, lensH } = lensSize(instance, tip)
    const safe = PROBE_SAFE * scale
    /**
     * 选区端点（＝真正参与命中的那个点，也就是「指针」）在视口里的横坐标。
     * `getScrolledVisiblePosition().left` 相对 `.monaco-editor` 左缘（已含行号槽宽度与横向滚动），
     * 补上它在视口里的左缘即可 —— 与 `place()` 换算手柄时同一口径。
     */
    const editorRect = host.value?.querySelector('.monaco-editor')?.getBoundingClientRect()
    const anchorX = editorRect ? editorRect.left + tip.left : drag.x
    /**
     * 端点所在那一行在视口里的顶边 —— 镜片的纵向锚点。整条「光束 + 镜片」挂在它上方
     * （CSS 的 `translate(-50%, -100%)` 让整条**底边**贴住锚点），于是光束正好落在行与镜片之间。
     */
    const rowTop = editorRect ? editorRect.top + tip.top : drag.y
    /**
     * 光束长度：平时就是 `LENS_GAP`；只有贴近视口上沿时才收短，好让镜片整体留在屏内
     * （编辑区上方是页签栏，那一条允许被镜片盖住，所以这里不需要翻到行下方 —— 见文件头那条 ⚠️）。
     */
    const gap = clamp(rowTop - safe - lensH, 0, LENS_GAP * scale)
    const half = lensW / 2
    const min = half + safe
    const max = window.innerWidth - half - safe
    const geom = {
      /**
       * **跟着指针走**：横向锚在端点那一列、纵向锚在端点那一行。
       * 端点就是手柄顶边所在的那一行（见文件头那条 ⚠️），所以镜片正对着「真正在选哪一处」，
       * 而不是手指画到哪儿镜片就跟到哪儿 —— 手指在一行之内的上下位置本来也没有意义。
       * 横向仍夹进视口：端点可能在屏幕外（横向滚动 / 长行），夹住才不至于把人甩出画面。
       */
      left: Math.round(clamp(anchorX, min, Math.max(min, max))),
      top: Math.round(Math.max(rowTop, safe + lensH + gap)),
      lensW,
      lensH,
      gap,
      /**
       * 镜片里内容的横向锚点（视口坐标）：`paintProbe()` 会把这一点顶到镜片正中。
       * 与上面那个 `left` 取同一个点，所以镜片里的端点始终在镜片正中排。
       */
      anchorX,
      /** 那一行相对编辑器 DOM 顶边的 y 与行高（Monaco 自己给的，含滚动偏移） */
      lineTop: tip.top,
      lineHeight: tip.height,
    }
    probe.value = geom
    // 胶囊是 v-if 出来的 —— 第一帧它还不在 DOM 里，等 Vue 挂完再往里搬内容
    nextTick(() => paintProbe(geom))
  }

  /**
   * 把主编辑器 `.view-lines` / `.view-overlays` / `.cursors-layer` 三层与 `.selection-handles`
   * 里那两颗手柄的 `innerHTML` 搬进胶囊，并给内容套上反向位移，让选区端点落在镜片正中。
   *
   * 横向跟选区端点的 x、纵向按**行中心**对齐：手指在一行之内的上下位置本来就没有意义，
   * 按行居中才不会随手指的细微抖动一上一下地窜。
   *
   * 位移算式（`transform-origin: 0 0`）：内容坐标 p → `translate + zoom × p`，
   * 于是把内容点 p0 顶到镜片中心 c 就是 `t = c − zoom × p0`。
   */
  function paintProbe(geom) {
    const instance = editor.value
    const editorEl = host.value?.querySelector('.monaco-editor')
    const shell = magnifier.value
    const snapshot = shell?.querySelector('.magnifier__snapshot')
    const srcLines = editorEl?.querySelector('.view-lines')
    if (!instance || !editorEl || !snapshot || !srcLines) return

    const editorRect = editorEl.getBoundingClientRect()
    const linesRect = srcLines.getBoundingClientRect()
    const contentX = geom.anchorX - linesRect.left
    const contentY = editorRect.top + geom.lineTop + geom.lineHeight / 2 - linesRect.top
    const zoom = LENS_ZOOM
    const tx = geom.lensW / 2 - zoom * contentX
    const ty = geom.lensH / 2 - zoom * contentY
    snapshot.style.transform = `translate(${tx}px, ${ty}px) scale(${zoom})`

    const overlayEl = snapshot.querySelector('.magnifier__overlays')
    const linesEl = snapshot.querySelector('.magnifier__lines')
    const cursorsEl = snapshot.querySelector('.magnifier__cursors')
    if (linesEl) {
      linesEl.innerHTML = srcLines.innerHTML
      // 字体是写在 `.view-lines` 自己的内联样式上的，跟着 innerHTML 走不了（见 copyFontInfo）
      copyFontInfo(srcLines, linesEl)
    }
    if (overlayEl) {
      const source = editorEl.querySelector('.view-overlays')
      overlayEl.innerHTML = source ? source.innerHTML : ''
    }
    if (cursorsEl) {
      const source = editorEl.querySelector('.cursors-layer')
      cursorsEl.innerHTML = source ? source.innerHTML : ''
    }
    paintHandles()
  }

  /**
   * 把两颗手柄搬进镜片 —— 单列一个函数，是因为它的**时序**和上面三层不一样。
   *
   * 三层内容来自 Monaco，`setSelection()` 当场就重渲染，`syncProbe()` 里 `nextTick` 搬一次就同步了。
   * 手柄的位置却先要过一道 `onDidChangeCursorSelection` → `schedule()`（rAF）→ `update()` —— 
   * 它在**下一帧**才写到源手柄的内联 `left / top` 上。所以在 `paintProbe()` 里顺手搬，镜片里
   * 那颗圆点永远停在上一次的位置（拖动中每帧都有 `pointermove` 掩盖了这点，手指一停就露馅）。
   * 于是改由 `update()` 在算完 `handles.value` 之后补叫一次。
   *
   * 坐标换算：手柄的 `left / top` 相对 stage（`place()` 算的就是这个），而这一层得跟着 snapshot 走
   * **内容坐标**（相对 `.view-lines` 的左 / 上缘），所以整层减掉 `.view-lines` 在 stage 里的偏移。
   * 两个 rect 都是视口坐标，编辑器的横竖滚动已经含在里面（同文件头那条 ⚠️ 说的道理）。
   * 搬过来的是盒子本身（透明），圆点与杆是伪元素 —— scoped 样式靠 `innerHTML` 一起带过来的
   * `data-v-*` 属性照样命中（`EditorPane.vue` 那边另外把它们的 `pointer-events` 钉回 none）。
   *
   * 圆点与杆全是伪元素，跟着 `innerHTML` 一起过来，这里不用另外补样式。
   */
  function paintHandles() {
    const layer = magnifier.value?.querySelector('.magnifier__handles')
    if (!layer) return
    const stageEl = stage.value
    const source = stageEl?.querySelector('.selection-handles')
    layer.innerHTML = source ? source.innerHTML : ''
    const lines = host.value?.querySelector('.monaco-editor .view-lines')
    if (!source || !lines || !stageEl) return
    const linesRect = lines.getBoundingClientRect()
    const stageRect = stageEl.getBoundingClientRect()
    layer.style.transform = `translate(${-(linesRect.left - stageRect.left)}px, ${
      -(linesRect.top - stageRect.top)
    }px)`
  }

  function pumpEdgeScroll() {
    if (edgeFrame) return
    edgeFrame = window.requestAnimationFrame(stepEdgeScroll)
  }

  function stepEdgeScroll() {
    edgeFrame = 0
    const instance = editor.value
    const hostEl = host.value
    if (!drag || !instance || !hostEl) return
    const rect = hostEl.getBoundingClientRect()
    let dir = 0
    if (drag.y < rect.top + EDGE_ZONE) dir = -1
    else if (drag.y > rect.bottom - EDGE_ZONE) dir = 1
    if (dir === 0) return // 手指回到中间，循环就此停下（下一次 pointermove 会再拉起来）
    const max = instance.getScrollHeight() - instance.getLayoutInfo().height
    const current = instance.getScrollTop()
    const next = clamp(current + dir * EDGE_STEP * uiScale(), 0, Math.max(0, max))
    if (next === current) return // 已经到顶 / 到底
    instance.setScrollTop(next)
    applyDrag()
    edgeFrame = window.requestAnimationFrame(stepEdgeScroll)
  }

  /**
   * 整场退掉一次「抓取」：只清现场（监听、drag、放大镜、边缘滚动），**选区一个字都不动**。
   * 两个出口：长按到点弹菜单（`fireHandleLongPress`，用户要的是菜单不是拖拽），
   * 以及组件卸载时的兜底。松手（`onDragEnd`）不走这里 —— 那是拖拽的正常收尾。
   */
  function abortDrag() {
    onDragEnd(null)
  }

  function onDragEnd(event) {
    if (!drag || (event && event.pointerId !== drag.pointerId)) return
    if (handlePress) {
      window.clearTimeout(handlePress.timer)
      handlePress = null
    }
    drag = null
    dragging.value = false
    probe.value = null
    if (edgeFrame) {
      window.cancelAnimationFrame(edgeFrame)
      edgeFrame = 0
    }
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragEnd)
    window.removeEventListener('pointercancel', onDragEnd)
    schedule()
  }

  // --------------------------------------------------------------- 挂 / 摘

  /** 编辑区里落下一次指针就更新「是不是触摸」；值真的变了才写 ref，免得空转重算 */
  function onHostPointerDown(event) {
    const next = event.pointerType !== 'mouse'
    if (next !== touchActive.value) touchActive.value = next
  }

  watch([active, touchActive], () => update())

  watch(
    editor,
    (instance) => {
      disposables.forEach((dispose) => dispose.dispose())
      disposables = []
      if (instance) {
        disposables.push(instance.onDidChangeCursorSelection(schedule))
        disposables.push(instance.onDidScrollChange(schedule))
        disposables.push(instance.onDidLayoutChange(schedule))
        disposables.push(instance.onDidChangeModel(schedule))
      }
      update()
    },
    { immediate: true },
  )

  onMounted(() => {
    host.value?.addEventListener('pointerdown', onHostPointerDown, true)
    // 滚动锁挂 stage（手柄这条触摸链的必经祖先）：touchmove 必须是非被动的，
    // 与 useEditorMenu / useSwipeTrack 里那条结论同源 —— Chrome 在 touchstart
    // 那一刻就按祖先链上的非被动监听决定要不要等 JS，事后补挂拦不住第一帧。
    stage.value?.addEventListener('touchmove', onTouchMoveLock, { capture: true, passive: false })
    stage.value?.addEventListener('touchend', onTouchEndLock, { capture: true, passive: false })
    stage.value?.addEventListener('touchcancel', onTouchCancelLock, { capture: true })
  })

  onBeforeUnmount(() => {
    host.value?.removeEventListener('pointerdown', onHostPointerDown, true)
    stage.value?.removeEventListener('touchmove', onTouchMoveLock, true)
    stage.value?.removeEventListener('touchend', onTouchEndLock, true)
    stage.value?.removeEventListener('touchcancel', onTouchCancelLock, true)
    touchLock = false
    onDragEnd(null)
    if (handlePress) {
      window.clearTimeout(handlePress.timer)
      handlePress = null
    }
    if (updateFrame) {
      window.cancelAnimationFrame(updateFrame)
      updateFrame = 0
    }
    disposables.forEach((dispose) => dispose.dispose())
    disposables = []
  })

  return { handles, dragging, probe, onHandleDown }
}
