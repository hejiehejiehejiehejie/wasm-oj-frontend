/**
 * useTabDrag —— 编辑器页签的拖动排序（鼠标与触屏共用一套 Pointer Events）。
 *
 * 【一条混排的序列，两类页签都能拖】条带上有两类页签：真实文件页签（`workspace.openTabIds`）
 * 与合成视图页签（设置 / Codeforces，`editorViews.viewOrder`）。它们**混排在同一条序列里**，
 * 拖动可以跨类换位 —— 文件能插到设置左边，设置也能排到某个 .cpp 前面。
 * 这条统一顺序不在那两份状态里（它们各自装不了对方），而是第三份 UI 状态 `tabStrip.stripOrder`
 * —— 它只管顺序、由自己维持，页签元素统一用 `data-strip-id` 认（两类都带这个属性）。
 * 落点下标因此在整个条带里数：`[0, ...stripOrder]`。
 * 为什么可以放心这么做：视图 id **永远不进 openTabIds**（见 services/tabStrip.js 与
 * services/editorViews.js 的文件头），同步与写回都在 tabStrip 那一层收口。
 *
 * 【为什么不用 HTML5 拖放】同 useTreeDrag：`dragstart` / `drop` 在触屏上根本不触发，
 * 幽灵元素的外观与自动滚动也不可控。这里从 `pointerdown` 起手自己实现。
 *
 * 【两类设备两套起手判据（2026-10-20 十九改：触屏手势状态机）】
 *   - 鼠标 / 笔：按下即进候选，位移超过 5px 立刻起拖（原来的行为一点没变）。
 *   - 触屏：条带本身是**横向滚动容器**，「拖」与「滚」共用同一根手指，只能靠时间 + 位移
 *     分开。press 上的 armed / dragging / menuOpen 三个标志构成一台状态机：
 *
 *       pointerdown ──200ms 内位移 > 10px──▶ 取消：这是横向滚动，放行原生 pan-x
 *            │
 *            ├── 静止到 200ms（位移 < 10px）──▶ armed「可拖」：轻震 + 浮起
 *            │        ├── 位移 ≥ 5px ────▶ dragging：锁滚动、接管 pointermove 重排
 *            │        └── 继续静止到 500ms ─▶ 菜单：弹自定义上下文菜单（浮起态作废）
 *            │                                  └── 手指再动 ≥ 10px ─▶ dragging
 *            │                                      （收菜单，接着拖 —— 二十二改）
 *            └── 200ms 内抬手（位移 < 10px）──▶ tap：切页签 / 折叠分组
 *
 *     200 / 500 / 10 / 5 四个数加上「菜单态再动 10px」就是这张图的全部参数，改一个都要
 *     回来重画它。**菜单不是终点**：菜单弹出后手势仍归我们（滚动锁不解、touchmove 照拦），
 *     手指一动就收菜单、接着当拖拽走 —— 见 openLongPressMenu 与 onPointerMove 的注释。
 *   · 触屏按下**不切焦点**（鼠标按下即获焦，见 EditorTabs.onTabPointerDown）：手指落在
 *     页签上很可能只是想滚一下条带，按下就切走会让「滚着看一眼」变成「连着切了三个文件」。
 *     切焦点挪到两个出口 —— tap，以及 dragging（经 onDragStart 回调，拖谁就切谁）。
 *   · armed 之后用**非被动** `touchmove` + `preventDefault()` 把滚动按住；同时把条带的
 *     内联 `overflow-x` 锁成 hidden（`touch-action` 在手势开始时就读定了、中途改它无效，
 *     这条结论与 useTreeDrag / App.vue 分隔条出自同一次踩坑）。锁与解都走
 *     lockStripScroll / unlockStripScroll，**每个出口都必须解**（pointerup / pointercancel /
 *     窗口 blur / Esc / 组件卸载全汇到 cancelPress）。
 *
 * 【触屏要补的三件事，缺一件都只在真机上现形】`dispatchTouchEvent` 那类合成事件**不跑浏览器
 * 的手势识别器**，所以下面三条在无头探针里永远测不出来（2026-10-10 用户报「拖动页签没对触摸屏
 * 做适配」就是这三条）—— 它们只有两处能看到痕迹：**真机**，以及「直接派发一个 cancelable 的
 * 合成事件、看 defaultPrevented」。
 *   ① `touch-action: pan-x`（写在 EditorTabs.vue 的 `.editor-tabs__item` 上）：
 *      `auto` 允许双指缩放 / 双击缩放，手势里插进第二根手指就会立刻收到 pointercancel，
 *      正在拖的那一帧被打断。与文件树行 `.tree-item__row` 的 `pan-y` 同源、方向相反。
 *   ② `user-select: none` + `-webkit-touch-callout: none`（同上）：长按 200ms 起手时不许
 *      选中标签文字 —— iOS 一旦开始选词就会连带弹出 callout（放大镜 + 菜单），拖拽当场变成选词。
 *   ③ 系统长按菜单（`contextmenu`）**从按下那一刻就接管**（见 beginPress）：各家系统
 *      的阈值大多在 500ms 上下，与我们弹自定义菜单的 500ms 正好撞车 —— 等 armed 再拦已经
 *      晚了一步，系统菜单会先于我们的卡片弹出来，而且还要等下一次点击才关掉。页签本来
 *      没有原生右键菜单，拦掉不损失功能。触屏的长按菜单由 openLongPressMenu 自己弹。
 *      **这一发必须连冒泡一起截住**（2026-11-13，见 onContextMenuBlock）：只 preventDefault
 *      的话，它照样会走到页签 / 芯片上的 `@contextmenu`，把右键菜单或分组卡片**再弹一次**
 *      —— 而那一处锚的是芯片矩形，于是长按出来的卡片会先落在手指处、随即跳到芯片下方。
 *      这三条与 useTreeDrag 的对应处完全同源，改一处记得看另一处。
 *
 * 【③ 为什么挂在按下、而不是 armed】非被动 `touchmove` 也一并提前挂（拦截本身仍只在
 * armed / dragging 时 preventDefault，所以「短滑滚页签条」不受影响）。理由是浏览器在
 * **touchstart 那一刻**就决定了「这次手势要不要等 JS 说话」，中途补挂的监听器不保证还拦得住
 * 第一帧滚动。代价：按压期间每次 touchmove 都要等一次 JS（滚动会晚一帧），换来的是「浏览器
 * 不可能已经先把手势判成滚动」。
 *
 * 【折叠的分组怎么算】折叠组的成员页签仍然在 DOM 里，只是 display: none（见
 * services/tabGroups.js 的文件头：摘出序列会让这里的下标数学整体错位）。它们量不出矩形、
 * 不进让位序列，在虚拟序列里由所属组的**芯片**代表 —— 芯片就画在组的左缘，页签的前导
 * 边缘越过芯片的中线就算越过了整段组；提交时（commitIndex）芯片再展开成它藏着的成员，
 * 换算回全表下标。反过来，`onTabPointerDown` 的「只剩一张就别拖」只数**可见**的页签：
 * 全被折叠藏起来时拖无可拖。
 *
 * 【实时让位（2026-10-20 十一改，替代「竖线指示条 + 松手才换位」，Chrome 原生手感）】
 * 拖拽期间 DOM 顺序一律不动，条带的每个可见单元（页签 + 分组芯片）按一份**虚拟序列**
 * 算目标槽位，差值用 translate3d 写到元素上：被拖的那张**无过渡**逐帧跟手（锁 X 轴、
 * 钳在条带内容范围内，z-index 抬到 100），其余的交给 CSS 过渡（200ms
 * cubic-bezier(0.2, 0, 0, 1)，写在 EditorTabs 的 is-dragging 规则里）滑到新槽位。
 * 换位判据（2026-10-20 十六改）是「**移动方向上的前导边缘**越过相邻槽位的中线」：
 * 向右拖看右缘、向左拖看左缘，外加一道**方向门控**（这一帧指针真往哪边动才查哪一侧）。
 * 原来的中心判据要多推半个页签才触发，手感偏迟钝；前导边缘早半格。中线永远按**换位后的
 * 目标槽位**算 —— 用正在播过渡的实时 DOM 坐标会在动画半途自我反馈、来回横跳。
 * 松手才把虚拟序列换算成全表下标提交（不动 stripOrder / openTabIds / viewOrder），提交
 * 那一刻调用方把 TransitionGroup 切到 tab-instant（FLIP 不发），由 settle() 从**提交前
 * 记下的**各元素视觉位置用 150ms ease-out 补间到新车位 —— 已经就位的差为 0 自动跳过，
 * 还在半路的平滑接上。（残差为什么必须提交前记：见 finishDrag 里的注释。）
 *
 * 【拖入 / 拖出分组（2026-10-20 十三改，Chrome 原生手感）】被拖页签的**实时归属**记在
 * `drag.gid`（初始 = 真实归属），拖拽期间随几何阈值翻转，并经 `liveGroup` ref 喂给
 * EditorTabs 的包络线测量 —— DOM 上的真实归属（tabGroups.memberOf）**一概不动**，松手
 * 才随下标一起提交（onDrop 载荷的 liveGid 字段）。判定全部走扁平槽位模型（见下），组内拖 / 组外拖
 * 不是两套逻辑，只是「成员身份」会挡住两类普通换位、并给出一组额外的阈值判定。
 * **判据全部锚在被拖页签自己的边缘上，而不是中心**：页签比芯片宽得多，邻位停放时中心
 * 早就越过芯片的任何固定线，中心判据会在起拖瞬间误触发（且与拖动方向无关）——
 *   · 拖入（未分组 → 吸进组）：从左是**右缘压上组首成员左缘再深入 12px**（成为该组
 *     第 1 个成员，插到芯片右边；组被拖空时退化为右缘完全越过芯片）；从右是**左缘越过
 *     组末成员右缘往左 40% 页签宽**（并入组尾）。视图页签不参与分组；折叠组是一整段
 *     槽位，拖过它只换位、不吸入（Chrome 同款）。
 *   · 拖出（两阶段退出）：先脱离分组（物理顺序不动，包络线立刻收缩；左出例外 ——
 *     要排到芯片左侧），再与外部单元普通换位。右出 = 左缘越过「组剩余部分右缘」20px
 *     （脱离阈值，防误触）；左出 = 右缘收回到芯片中线以左（几乎完全拖出芯片才算）。
 *     唯一成员的组拖空后，芯片**拖拽期间保留**（反悔拖回去还能吸入），松手结算时才由
 *     tabGroups.removeEmptyGroups 摘除。
 *   · 跨组越界（二十四改）：未分组的单元撞上某组成员、而这一换会把它塞进**组的内部**时，
 *     不允许走普通换位 —— 页签就地入组（Chrome：拖到两名组员之间 = 加入该组），视图页签
 *     连芯片带组员整段跳过。缺这条时那组的成员会在 stripOrder 上被隔成两段，渲染出
 *     **两枚芯片 + 两条包络线**（2026-10-20 用户报「拖页签到组里出现两个胶囊」）。
 *     为什么以前多数时候不炸：拖入判据按**被拖页签自己的宽度**算，窄签对宽签时
 *     「前导边缘过中线」比「压过 40% 自身宽」先到，于是先换位、后入组。
 *
 * 【芯片拖动 = 整组搬移（2026-10-20 十八改）】分组芯片本身就是组的拖把柄（Chrome 同款：
 * 按住芯片拖 = 搬走整组；原样松手仍是折叠 / 展开切换）。被拖对象是「芯片 + 紧随其后的
 * 全体可见组员」的**整段块**（折叠组只有芯片 —— 组员由它代表，见 collectUnits），块内
 * 全体共用同一个 translate3d，视觉上钢性连体。两条专属规则：
 *   · **整段换位**：碰撞按「邻接 run」算 —— 无组单元就是它自己，某组则是「芯片 + 它的
 *     组员」整段。组对组必须整段换：只换芯片会把对方的组员与它的芯片拆开，破坏「同组
 *     成员在 stripOrder 里连续」的不变式（tabGroups 文件头），松手后那组的包络线会
 *     永久断成两截。阈值（二十改）锚在**紧挨着被拖块那个单元**的中线上 —— 与页签拖动
 *     的前导边缘判据逐字相同；十八改取的是整段 run 的中点，拖过一串散签 / 一个大组
 *     都要多走半格，用户报「要完全拖到对应位置才换」。
 *   · **无成员结算**：搬组不改成员关系（drag.gid 恒等于组 id，无出入组判定），松手只把
 *     整段成员在 stripOrder 里挪到落点（tabStrip.moveStripRun）。onDrop 的载荷用
 *     `{ kind: 'group' }` 与页签拖动的 `{ kind: 'tab' }` 区分，调用方各走各的结算。
 *
 * 【本模块不碰 store】落盘由调用方的 `onDrop(payload, insertIndex)` 交给 tabStrip 的
 * moveStripItem / moveStripRun —— 由它们分部写回 openTabIds（含持久化）与 viewOrder；
 * 页签拖动的 payload.liveGid 是被拖页签的实时归属，调用方据它结算成员关系（拖出组 =
 * 退组、拖进组 = 入组、拖空的组就地摘除）。
 */
import { nextTick, onBeforeUnmount, shallowRef } from 'vue'

/** 触屏从按下到「可以拖了」的长按门槛（十九改：450 → 200ms，用户口径）。
 *  ⚠️ 这个数牵着一处样式：`EditorTabs.vue` 里按压进度那条 `transition: background-color 200ms linear`
 *  ——底色要在到点那一刻刚好走完，改一边就得改另一边（见那两个类上的注释）。 */
const LONG_PRESS_MS = 200
/** 触屏长按之后仍一动不动多久 → 这不是拖拽，是「呼出上下文菜单」（用户口径 500ms）。
 *  必须大于 LONG_PRESS_MS：先给「可拖」的反馈，再决定是拖还是弹菜单。 */
const TOUCH_MENU_MS = 500
/** 鼠标判定成拖拽的位移（像素）。比 useTreeDrag 的 4px 大一点：页签窄，抖动误触的代价是「位置被改」 */
const MOUSE_MOVE_PX = 5
/** 触屏按下后的「滚动判据」：位移超过它 = 想横向滚动，撤销长按、放行原生滚动。
 *  它同时是轻点的位移上限（< 10px），两处共用一个数。 */
const TOUCH_SLOP_PX = 10
/** 触屏 armed 之后再动这么多就真的起拖。比滚动阈值小：此时「这次手势归我」已经确定，
 *  再要求 10px 只会让拖拽起步发木。 */
const TOUCH_DRAG_PX = 5
/** 菜单已经弹出之后，手指再动这么多 = 「其实是要拖」（二十二改）。**故意比 TOUCH_DRAG_PX
 *  大**：菜单开着的时候手势先被判成了「弹菜单」，重新改口要一点明确意图 —— 手指的细微
 *  抖动（5px 级）不该把菜单晃没。值取 TOUCH_SLOP_PX 那一档（10px），与「滚动 / 轻点」的
 *  防抖边界同一个量级，但没有共用那个常量：那边管的是「别把滚动误判成长按」，语义不同。 */
const TOUCH_MENU_DRAG_PX = 10
/** 触屏轻点的时间上限：抬手时按下还没满这么久 + 位移 < TOUCH_SLOP_PX = 一次 tap */
const TOUCH_TAP_MS = 200
/** 指针距条带左右边缘多近开始自动滚动（用户口径 40px） */
const EDGE_PX = 40
/** 拖拽中指针可以纵向偏出条带多远还不掐断自动滚动（px）。条带本身只有 35px 高，触屏手指
 *  按在上面横向拖动时上下抖动远超 20px，20px 的容差会让「拖着拖着突然不滚了」；块本来就
 *  锁 X 轴（纵向只在条带里跟手），放宽纵向容差没有副作用。 */
const DRAG_Y_TOLERANCE = 90
/**
 * 自动滚动速度，**单位是 px/s 不是 px/帧**（2026-11-13 改）。按帧写等于把速度绑在
 * rAF 频率上：60Hz 是 840px/s，120Hz ProMotion 直接翻倍到 1680px/s，240Hz 三倍 ——
 * 同一份手感在两台机器上是两回事，「一碰边缘就飞到底」正是高刷屏上的表现。
 * 数值按原 60Hz 手感折算：贴边 14px/帧 → 840，退到 40px 线 3px/帧 → 180（取 140 更柔一档）。
 */
const SPEED_MAX = 840
const SPEED_MIN = 140
/** 刚进边缘区的前 RAMP_UP_MS 里速度从 RAMP_START 爬到满，避免手指扫过边缘时视口惊跳 */
const RAMP_UP_MS = 120
const RAMP_START = 0.45
/** 拖拽结束后用来吃掉紧随其后那次 click 的时间上限 */
const CLICK_SUPPRESS_MS = 300
/** 松手后「归位补间」的时长：从松手那一拍的视觉位置补间到自然车位（见 settle）。
 *  归位期间被拖的组还要一直抬层（见 settlingGid），抬层的收尾时长挂的就是它。 */
const SETTLE_MS = 150
/** 拖出分组的脱离阈值（px）：组末成员的左缘越过「组剩余部分右缘」这么多才算真出组。
 *  太小会误触（在组边抖两下就退组），太大的话退组手感迟钝 —— 取需求给的 15~25px 中值。 */
const GROUP_EXIT_PX = 20
/** 从右拖入分组的吸入深度（占被拖页签宽度的比例）：左缘越过组末成员右缘往左这么多
 *  才吸入（需求给的 30%~50% 区间取中）。与 20px 的脱离阈值合起来，在组右缘留出一段
 *  「既不吸入也不退出」的防抖死区。 */
const GROUP_JOIN_FRAC = 0.4
/** 从左拖入分组的吸入深度（px）：右缘压上组首成员左缘再深入这么多才吸入。
 *  与芯片相关的全部判据都锚在**被拖页签自己的边缘**上（见 tryJoinGroup 的注释）——
 *  页签比芯片宽得多，邻位停放时中心早就越过芯片的任何固定线，中心判据会在起拖
 *  瞬间误触发（且与拖动方向无关）。 */
const GROUP_JOIN_OVERLAP = 12

/**
 * @param {object} options
 * @param {import('vue').Ref<HTMLElement|null>} options.rootEl `.editor-tabs` 根元素
 *   （指示条相对它定位，所以要拿它算 rect，而不能只看条带）
 * @param {(payload: {kind: 'tab', id: string, liveGid: string|null} | {kind: 'group', gid: string}, insertIndex: number) => void} options.onDrop
 *   松手时的落盘回调
 * @param {(target: {id: string|null, gid: string|null}) => void} [options.onTap]
 *   触屏轻点（<200ms、<10px）：切页签 / 折叠分组。鼠标不走这条 —— 它在 pointerdown
 *   就已经获焦、click 也照常触发。
 * @param {(info: {id: string|null, gid: string|null, x: number, y: number}) => void} [options.onLongPress]
 *   触屏长按满 500ms 仍不动：在手指位置弹自定义菜单
 * @param {(target: {id: string|null, gid: string|null}) => void} [options.onDragStart]
 *   拖拽真正开始的那一帧（两种设备都会调；触屏靠它补「拖谁就切谁」）
 * @param {() => void} [options.onMenuDismiss]
 *   长按菜单弹出后又动起来要拖：调用方就此收起菜单（二十二改）。不收的话那张菜单会盖在
 *   被拖页签上跟着走完整个拖拽。
 */
export function useTabDrag({ rootEl, onDrop, onTap, onLongPress, onDragStart, onMenuDismiss }) {
  /** 正在被拖的页签 id；null = 没在拖（页签上的拖拽态类看它）。
   *  芯片拖动时放的是哨兵 `group:<gid>`（芯片没有 strip id；truthy 即可驱动 is-dragging
   *  与包络线的逐帧跟随，且不会与任何页签 id 撞上 —— 组 id 是 `g` 前缀，节点 id 不是）。 */
  const draggingId = shallowRef(null)

  /** 这一轮拖拽是不是触屏发起的（模板据它挂 is-touch-drag：放大 1.04 + 加深投影）。
   *  鼠标拖拽不放大 —— 页签必须严丝合缝地跟着指针走。 */
  const touchDrag = shallowRef(false)

  /**
   * 被拖**块**里带 strip id 的单元（页签拖动 = [它自己]；芯片拖动 = 全体可见组员）。
   * 模板据此给块内每一张挂 --dragging 类（关过渡 + 抬层）—— 只有芯片自己关过渡的话，
   * 组员会被 200ms 让位过渡拖着走，整组在拖拽中肉眼可见地脱节。
   */
  const draggingIds = shallowRef([])

  /**
   * 松手后仍在**归位补间**里的组（gid）；null = 没有组在归位。
   *
   * 为什么单独记一个状态：芯片的抬层（`z-index: 100`）原本只写在 `--dragging` 与
   * `.is-dragging` 下面，而这两个类在**松手那一拍**就被 cancelPress 摘掉了 —— 可 settle 的
   * 归位补间还要再跑 SETTLE_MS，这段时间里芯片正横穿其它页签，没有抬层就被盖住。
   * 实测症状（2026-11-16 用户报）：拖一个**折叠的组**、松手时芯片停在右边某张页签上方，
   * 归位路上它会从那张页签**底下**钻过去；落在左边则是从**上面**过 —— 因为页签是
   * `isolation: isolate` 的独立层叠上下文，谁在上面全看源码顺序，与「视觉上还在拖」无关。
   * 组是整段搬走的，归位路最长（可能横穿十几张），所以只有组要补这一刀；单张页签归位
   * 只横穿自己那一两个槽位，用户没报，也就不动。
   */
  const settlingGid = shallowRef(null)

  /** `settlingGid` 的收尾定时器（0 = 没有在跑的） */
  let settlingTimer = 0

  /**
   * 被拖页签的**实时归属**（组 id 或 null），只在拖拽期间有值；null 同时表示
   * 「没在拖」与「实时无组」—— 区分靠 draggingId。EditorTabs 的包络线测量读它：
   * DOM 上的 data-group-id 还是旧值，包络线要按这份实时归属画（拖进哪组、线就
   * 包到哪；拖出组，线立刻收缩）。
   */
  const liveGroup = shallowRef(null)

  /**
   * 被拖块此刻**视觉上**贴着条带哪一端（'first' 左端 | 'last' 右端 | null 都不贴），
   * 每帧随 updateDrag 重算。strip-first / strip-last 的「关朝外那只脚」吃的是这份标记
   *（见 EditorTabs 的 stripItems 尾部覆盖）：脚的显隐判据是「贴着端缘、脚没地方落」，
   * 这只跟**视觉位置**有关，与 DOM 顺序（stripOrder，松手才提交）无关 —— 不按视觉算的话，
   * 「把最左的激活页签拖到中间」整路上它都顶着 is-strip-first、左脚被压着，一松手
   * DOM 序更新才突然长出来（2026-10-20 用户报「放下时突然出现一个圆角」）。
   */
  const dragEdge = shallowRef(null)

  /** 实时让位的整轮拖拽状态（结构见 beginLiveReorder）；null = 没在拖 */
  let drag = null

  /**
   * 触屏按压中的页签 id —— 页签上的「按住进度」底色靠它（见 EditorTabs 的 --pressing）。
   * 只对触屏置位：鼠标按下就该立刻拖，中间那段「等待」不存在，给进度反而像卡了。
   * 与 useTreeDrag 的 pressingId 同款 —— 触屏借不到 hover，这 200ms 不给反馈就是「按了没反应」。
   * 芯片没有 strip id，这里放哨兵 `group:<gid>`（模板给芯片单独挂类）。
   */
  const pressingId = shallowRef(null)
  /**
   * 长按已成、但还没松手也没开始拖的页签 id —— 页签上的「弹一下」靠它（见 --armed）。
   * 与 pressingId 的分工：pressing 是「还在等」，armed 是「已经就绪，现在拖动即可换位」。
   */
  const armedId = shallowRef(null)

  /** 当前这一轮按压的全部临时状态；null = 没有按压在途 */
  let press = null
  let scrollFrame = 0
  /** 目标滚动速度（px/s，带正负号）。0 = 不滚。原先是个每帧像素数，见 SPEED_MAX 那段 */
  let scrollVelocity = 0
  /** 上一帧时间戳（ms），算 dt 用；0 = 还没起过步 */
  let scrollLastTs = 0
  /** 这次进入边缘区的时间戳（ms），算渐入用 */
  let scrollEnterTs = 0
  /** 亚像素累加余数（px）：高刷屏单帧位移可能不足 1px，取整丢掉的部分存在这里等下一帧凑 */
  let scrollRemainder = 0
  let suppressClick = false
  let suppressClickTimer = 0
  /** 条带的滚动锁是否已上（见 lockStripScroll）。按位记，解除时只清自己写的那两条内联 */
  let scrollLocked = false

  const stripEl = () => rootEl.value?.querySelector('.editor-tabs__strip') ?? null

  /** 芯片在 pressingId / armedId / draggingId 里的哨兵值（芯片没有 strip id） */
  const sentinel = (gid) => (gid ? `group:${gid}` : null)

  /**
   * 拖拽期间锁住条带的横向滚动（十九改）。两个手段叠着：
   *   · 内联 `overflow-x: hidden` —— 立刻生效，挡住滚轮 / 第二个指针；
   *   · 内联 `touch-action: none` —— 给**下一次**手势读（本次手势的 touch-action 在
   *     touchstart 时就定死了，中途改它无效，本次靠非被动的 touchmove preventDefault）。
   * 只写内联、不挂类：解的时候原样清空，不会把样式表里的 pan-x 永久改掉。
   */
  function lockStripScroll() {
    const strip = stripEl()
    if (!strip || scrollLocked) return
    strip.style.overflowX = 'hidden'
    strip.style.touchAction = 'none'
    scrollLocked = true
  }

  /** 解除滚动锁（每个出口都要走：松手 / cancel / Esc / 菜单弹出 / 组件卸载） */
  function unlockStripScroll() {
    if (!scrollLocked) return
    const strip = stripEl()
    if (strip) {
      strip.style.overflowX = ''
      strip.style.touchAction = ''
    }
    scrollLocked = false
  }

  /** 真的占着位置的页签（折叠组的成员也在条带里，但 display: none 量不出矩形） */
  function isRendered(el) {
    return el.getClientRects().length > 0
  }

  /**
   * 条带内容坐标系：条带是横向滚动容器，元素的 offsetLeft / 拖拽位移都活在「内容坐标」里，
   * 指针的 clientX 与元素的 getBoundingClientRect 都活在「视口坐标」里 —— 下面这个原点
   * 把两边接起来（含 scrollLeft，自动滚动改 scrollLeft 后同一套换算仍然成立）。
   */
  function stripOriginX(strip) {
    return strip.getBoundingClientRect().left - strip.scrollLeft
  }

  /**
   * 起手时盘点条带：抓出所有**可见**的让位单元（页签 + 分组芯片 —— 芯片也要跟着滑，
   * 否则页签滑过组边界时芯片留在原地、组包络线断开），量下它们的自然位置 / 宽度 /
   * 左右外边距；display:none 的折叠成员按组归档（提交换算下标时由芯片展开）。
   * DOM 顺序 == tabStrip.stripOrder 的当前顺序（芯片插在组首前，也在这个顺序里）。
   */
  function collectUnits(strip) {
    const hiddenByGroup = new Map()
    const units = []
    for (const el of strip.querySelectorAll('.editor-tabs__chip, .editor-tabs__item[data-strip-id]')) {
      const gid = el.dataset.groupId || null
      if (!isRendered(el)) {
        // 折叠藏起来的组员：记到组名下，虚拟序列里由芯片代表它们
        if (gid && el.dataset.stripId) {
          if (!hiddenByGroup.has(gid)) hiddenByGroup.set(gid, [])
          hiddenByGroup.get(gid).push(el.dataset.stripId)
        }
        continue
      }
      const cs = getComputedStyle(el)
      units.push({
        el,
        id: el.dataset.stripId || null,
        gid,
        kind: el.classList.contains('editor-tabs__chip') ? 'chip' : 'item',
        // 芯片是否折叠态（折叠组是整段槽位：不吸入、拖过只换位）；
        // 页签是否合成视图（视图不参与分组，拖入判定直接跳过）
        collapsed: el.classList.contains('editor-tabs__chip--collapsed'),
        view: !!el.dataset.viewId,
        left: el.offsetLeft,
        width: el.offsetWidth,
        ml: Number.parseFloat(cs.marginLeft) || 0,
        mr: Number.parseFloat(cs.marginRight) || 0,
        tx: 0,
      })
    }
    return { units, hiddenByGroup }
  }

  // ------------------------------------------------------------ 按压

  /**
   * 页签 / 芯片 pointerdown 共用的按压建档。页签传 id、芯片传 gid（二者互斥）。
   * 触屏在这里挂两条计时：200ms 进入可拖态、500ms 弹菜单（任一先到先得，见文件头的状态机）。
   * @param {PointerEvent} event
   * @param {{id?: string|null, gid?: string|null}} target
   */
  function beginPress(event, { id = null, gid = null }) {
    // 上一轮组的归位补间可能还没跑完就又按下了：抬层立刻收（否则新一轮里这枚芯片会一直压着
    // 别人，且新拖拽的让位逻辑还要跟它抢层）
    markSettlingGroup(null)
    const pointerType = event.pointerType || 'mouse'
    press = {
      id,
      gid,
      pointerId: event.pointerId,
      // 老浏览器可能不给 pointerType，按鼠标处理（退化成「直接拖」而不是「拖不动」）
      pointerType,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      // 按下时刻：轻点判据（<200ms）认它，不认「armed 有没有置上」—— 主线程忙的时候
      // setTimeout 会晚几十毫秒，拿 armed 当时间判据会把慢一点的点按判丢
      startTime: performance.now(),
      armed: false,
      dragging: false,
      /** 500ms 到点、菜单已弹出（菜单态不是终点：手指再动 ≥ 10px 就改口成拖拽，见 onPointerMove） */
      menuOpen: false,
      /** 菜单弹出那一刻的指针位置（二十二改：判「菜单后手指又动了」按相对它的增量） */
      menuX: 0,
      menuY: 0,
      captureEl: event.currentTarget instanceof Element ? event.currentTarget : null,
      armTimer: 0,
      menuTimer: 0,
    }
    if (pointerType !== 'mouse') {
      // 按压进度：页签底色从当前底色线性走到 --bg-hover（200ms 那条过渡写在 EditorTabs 的
      // --pressing 上，与这张表同步）；到点由 arm() 换成「就绪态」。
      pressingId.value = id ?? sentinel(gid)
      press.armTimer = window.setTimeout(arm, LONG_PRESS_MS)
      press.menuTimer = window.setTimeout(openLongPressMenu, TOUCH_MENU_MS)
      // 触屏专用的两条都挂在**按下这一刻**，不能等 armed 再挂（理由见文件头「触屏要补的三件事」）：
      //   · touchmove 非被动 —— 浏览器在 touchstart 时就决定了「这次手势要不要等 JS 说话」，
      //     中途补挂的监听器不保证还拦得住第一帧滚动；
      //   · contextmenu —— 系统长按菜单也在 500ms 上下，等 armed 再拦晚一步。
      // 按下就挂**不影响「短滑滚页签条」**：onTouchMoveBlock 只在 armed / dragging 时才
      // preventDefault，那 200ms 里手指滑动照旧是原生横滚。
      window.addEventListener('touchmove', onTouchMoveBlock, { passive: false, capture: true })
      window.addEventListener('contextmenu', onContextMenuBlock, true)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    // 窗口失焦（Cmd+Tab / 切应用 / 来电）也要走完整清理链（审计发现的缺口）：pointerup
    // 发生在别的应用里、永远回不来，不拦 blur 的话 armed 的滚动锁与浮起态会永久挂在
    // DOM 上 —— 那是这套手势里最不能接受的死锁（见 cancelPress 的注释）。与 pointercancel
    // 同一条出口。
    window.addEventListener('blur', onWindowBlur)
  }

  /** 窗口失焦 = 与 pointercancel 同一条出口：拖拽中取消回弹（不提交），按压中直接清 */
  function onWindowBlur() {
    if (!press) return
    if (press.dragging) {
      finishDrag(false)
      markClickSuppressed()
      return
    }
    cancelPress()
  }

  /**
   * 页签上的 pointerdown，由模板转交（`@pointerdown`）。
   * @param {PointerEvent} event
   * @param {string} id
   */
  function onTabPointerDown(event, id) {
    if (event.button !== 0) return
    if (press || draggingId.value) return
    // 关闭按钮（×）上起手不拖 —— 那是要关页签
    if (event.target instanceof Element && event.target.closest('.editor-tabs__close')) return
    // 看得见的只剩一张时照旧建档：拖是拖不动的（beginLiveReorder 发现单元不足会当没拖起来），
    // 但长按 500ms 的菜单还得能弹 —— 只剩一张时「添加到分组 / 关闭」反而最常用。
    beginPress(event, { id })
  }

  /**
   * 芯片上的 pointerdown（十八改）：按住芯片拖动 = 搬走整组（Chrome 同款 —— 芯片就是
   * 组的把柄）。与页签共用同一套手势状态机，press.id 为 null、press.gid 记组 id，
   * beginLiveReorder 据此把被拖对象换成「芯片 + 全体可见组员」的整段块。
   * 原样松手（没动过）不走这里 —— click 照常触发 toggleGroup 的折叠 / 展开。
   * @param {PointerEvent} event
   * @param {string} gid
   */
  function onChipPointerDown(event, gid) {
    if (event.button !== 0) return
    if (press || draggingId.value) return
    beginPress(event, { gid })
  }

  /**
   * 触屏按住不动满 200ms：进入「可拖态」（这一下只翻标志位 —— 拦滚动的那条 touchmove
   * 按下时已挂好）。三件事：反馈、轻震、锁滚动。
   */
  function arm() {
    if (!press || press.dragging || press.menuOpen) return
    press.armTimer = 0
    press.armed = true
    // 到点了：页签换成「就绪态」——弹一下 + 轻轻放大，底色停在 --bg-hover 上（不是页签
    // 自己的 --bg-tab-hover：那一档太淡，实拍量过只比栏底差 6 阶，当进度条等于没有；
    // 理由写在 EditorTabs 那段注释里），直到松手或开始拖。
    // 这一刻是整条手势里唯一「告诉用户长按成功了」的信号，别把它省掉。
    // pressing 必须同时退场：两态互斥（等 → 已就绪），而且 --pressing 自带那条 200ms linear
    // 的过渡会跟着留下，松手时整块底色要用 200ms 才淡回去、比别的页签慢一拍。
    pressingId.value = null
    armedId.value = press.id ?? sentinel(press.gid)
    // 「抓起来了」：设备支持就轻震一下（iOS Safari 没有 vibrate，可选调用兜住）
    try {
      navigator.vibrate?.(15)
    } catch {
      /* 某些浏览器会因「非用户手势」抛错，震动只是锦上添花，吞掉 */
    }
    // 从这一刻起手势归我们：先把条带的横向滚动锁上（真正拦本次手势的还是下面那条
    // 非被动 touchmove，这里锁的是容器本身）
    lockStripScroll()
  }

  /**
   * 长按满 500ms 仍然一动不动：这不是拖拽，是「长按呼出菜单」（十九改）。
   * 位置取手指最后停的地方；菜单由调用方弹（本模块不碰 UI）。
   * 浮起反馈当场收起（菜单一出现再顶着「就绪」态很脏），但**手势不结束**：
   *   · 滚动锁不解、touchmove 照拦（onTouchMoveBlock）—— 二十二改。解了的话菜单打开后
   *     手指一动浏览器就把它判成横向滚动，等我们读到 >10px 时已经收到 pointercancel，
   *     「菜单后接着拖」永远起不来（这是本条需求的真正难点，不是判断阈值）。
   *   · 手指再动 ≥ TOUCH_MENU_DRAG_PX：收菜单、当场并入拖拽（见 onPointerMove）。
   *   · 原地抬手：仍按「这不是点击」处理（onPointerUp），菜单留着等用户点。
   * 松手 / 取消走的还是 cancelPress —— 滚动锁在那里统一解，出口没有新增。
   */
  function openLongPressMenu() {
    if (!press || press.dragging || press.menuOpen) return
    press.menuTimer = 0
    press.menuOpen = true
    press.armed = false
    // 菜单弹出这一刻的指针位置：之后判「手指又动了」按**相对它**的增量算，不按相对按下的总位移
    // —— 按下到 500ms 之间允许有 <5px 的抖动（再多就已经起拖了），拿总位移当基准会让
    // 「抖了 4px 的手」再动 6px 就起拖，手感像菜单被碰了一下就没了。
    press.menuX = press.lastX
    press.menuY = press.lastY
    pressingId.value = null
    armedId.value = null
    onLongPress?.({ id: press.id, gid: press.gid, x: press.lastX, y: press.lastY })
  }

  /**
   * 不让浏览器把这次手势当滚动。
   * **armed 之前必须什么都不做**：那 200ms 里手指横向滑动就是「滚页签条」，
   * 一拦（条带是横向滚动容器，页签不溢出时也滚不动）就再也滚不动了。
   * 菜单态（menuOpen）一并拦：那时手势已经归我们，放行就等于把「菜单后接着拖」交给
   * 浏览器的滚动识别器（见 openLongPressMenu）。
   */
  function onTouchMoveBlock(event) {
    if (press && (press.armed || press.dragging || press.menuOpen) && event.cancelable) {
      event.preventDefault()
    }
  }

  /**
   * 按住期间不让系统长按菜单插进来（页签没有自己的右键菜单，拦掉不损失功能）。
   *
   * `preventDefault()` 只压掉**浏览器的原生弹窗**，事件本身照样冒泡到页签 / 芯片上的
   * `@contextmenu` —— 那两处是按「右键」写的：芯片那颗会**再开一次分组卡片**，锚点取
   * 芯片矩形。于是真机上长按的分组卡片先按手指位置弹出来、又被这一发拽回芯片下方，
   * 看着就是「先出现在手指处、再跳到预设位置」（2026-11-13 用户报）。
   * 所以在 window 的**捕获阶段**把这一发整个截住（`stopPropagation`）：按压期间这次
   * contextmenu 归我们，页签菜单 / 分组卡片一律只由 openLongPressMenu 弹一次。
   * 这条只在 `press` 存在时生效，编辑区、文件树那些右键完全不受影响。
   */
  function onContextMenuBlock(event) {
    if (!press) return
    event.preventDefault()
    event.stopPropagation()
  }

  function onPointerMove(event) {
    if (!press || event.pointerId !== press.pointerId) return
    press.lastX = event.clientX
    press.lastY = event.clientY

    // 菜单已经弹出来了（二十二改）：菜单不是手势的终点 —— 手指继续动就是「其实我要拖」，
    // 收起菜单、当场并进拖拽（用户口径：弹出菜单之后也应该能拖这张页签）。
    // 阈值比 armed 之后那个 5px 大（见 TOUCH_MENU_DRAG_PX）：先被判成「菜单」的手势，
    // 改口需要一点明确意图。起拖位置用 press.lastX（= 当前指针），与任何起手路径一样不跳帧。
    if (press.menuOpen) {
      const moved = Math.hypot(event.clientX - press.menuX, event.clientY - press.menuY)
      if (moved < TOUCH_MENU_DRAG_PX) return
      press.menuOpen = false
      // 先收菜单再起拖：菜单是 Teleport 到 body 的浮层，留着会跟着拖拽一路盖在页签上
      onMenuDismiss?.()
      startDrag(event)
      return
    }

    if (press.dragging) {
      updateDrag(event.clientX, event.clientY)
      return
    }

    const distance = Math.hypot(event.clientX - press.startX, event.clientY - press.startY)
    if (press.pointerType === 'mouse') {
      if (distance > MOUSE_MOVE_PX) startDrag(event)
      return
    }

    if (press.armed) {
      // 长按已成、手指终于动了 = 拖拽（菜单定时器在 startDrag 里销毁）；
      // 没动就松手 = 什么都不做（在 onPointerUp 里处理）
      if (distance > TOUCH_DRAG_PX) startDrag(event)
      return
    }
    // 还没到 200ms 就滑出 10px：这是一次「横向滚动页签条」。撤销长按 / 菜单两条计时、
    // 松开一切，把这次手势原样还给浏览器（touch-action: pan-x 从没改过，能立刻滚）。
    if (distance > TOUCH_SLOP_PX) cancelPress()
  }

  function onPointerUp(event) {
    if (!press || event.pointerId !== press.pointerId) return
    const state = press

    if (state.dragging) {
      // 松手与 click 是两次事件，不挡一下会顺带触发页签的 activate（切过去）
      finishDrag(true)
      markClickSuppressed()
      return
    }

    // 轻点判据（触屏）：按下到抬手不足 200ms、位移 < 10px。
    // 时间是现算的 —— 不能拿 armed 当「还没到 200ms」的证明（定时器可能还没轮到跑）。
    const elapsed = performance.now() - state.startTime
    const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY)
    const tap =
      state.pointerType !== 'mouse' &&
      !state.menuOpen &&
      elapsed < TOUCH_TAP_MS &&
      distance < TOUCH_SLOP_PX

    cancelPress()

    if (tap) {
      // 触屏的切页签 / 折叠分组只在这里发生（按下时故意不抢焦，见文件头）。
      // 先压住紧随其后的 click，再由 onTap 自己走一次 —— 两条路只许走一条。
      markClickSuppressed()
      onTap?.({ id: state.id, gid: state.gid })
      return
    }
    // 长按后原地松手（armed 但没拖）、或菜单刚弹过：都不算点击，
    // 吃掉紧随其后的 click，免得顺带把页签切走 / 把分组折叠掉
    if (state.armed || state.menuOpen) markClickSuppressed()
  }

  function onPointerCancel(event) {
    if (!press || event.pointerId !== press.pointerId) return
    // 触屏最容易被系统手势（边缘返回、多指、来电）从中间掐断。两条出口都要做完整清理：
    // 定时器、滚动锁、浮起态全在 cancelPress 里收，拖拽中的另外走一次回弹（不提交排序）。
    if (press.dragging) {
      finishDrag(false)
      markClickSuppressed()
      return
    }
    cancelPress()
  }

  function onKeyDown(event) {
    if (event.key !== 'Escape') return
    // 拖动中按 Esc：取消回弹，并且别让 Esc 再触发别的东西
    event.preventDefault()
    event.stopPropagation()
    if (press?.dragging) finishDrag(false)
    else cancelPress()
    markClickSuppressed()
  }

  // ------------------------------------------------------------ 拖拽

  function startDrag(event) {
    press.dragging = true
    if (press.armTimer) {
      window.clearTimeout(press.armTimer)
      press.armTimer = 0
    }
    // 手指一动就销毁菜单定时器（用户口径）：拖拽与「长按弹菜单」是互斥的两条路
    if (press.menuTimer) {
      window.clearTimeout(press.menuTimer)
      press.menuTimer = 0
    }
    draggingId.value = press.id ?? sentinel(press.gid)
    // 真的拖起来了：按压 / 就绪那一套退场，改由 draggingId 表达（浮起跟手 + 让位滑动）。
    // 留着的话，被拖的那一张会同时挂着就绪底色与拖拽态，叠起来很脏。
    pressingId.value = null
    armedId.value = null
    // 触屏：抓起来要放大 + 加深投影（模板据此挂 is-touch-drag）。鼠标不放大 —— 页签
    // 必须严丝合缝地跟着指针走。滚动锁在 armed 那 200ms 就上了，这里再兜一次。
    touchDrag.value = press.pointerType !== 'mouse'
    if (touchDrag.value) {
      lockStripScroll()
      // 触屏按下时故意没抢焦（见文件头），真正开拖的这一帧补上 —— 拖谁就切谁
      onDragStart?.({ id: press.id, gid: press.gid })
    }

    // 指针捕获：横向拖出条带之后事件仍然回得来。只在该开始拖时才捕获 —— 提前捕获会把
    // 普通点击与横向滚动一起搅进来（指针可能已失效，照 App.vue 分隔条的写法兜住）。
    const el = press.captureEl
    if (el?.setPointerCapture) {
      try {
        el.setPointerCapture(press.pointerId)
      } catch {
        /* 指针已经失效，忽略即可 */
      }
    }

    // 触屏的 touchmove 拦截在 pointerdown 那一刻就挂好了，这里再挂一次是给**退化的那条路**
    // 兜底：浏览器不给 pointerType 时上面按 'mouse' 处理（那时不会挂 touchmove），
    // 而它仍然可能发真触摸事件。同一函数 + 同一 capture 重复挂是幂等的，没有副作用。
    window.addEventListener('touchmove', onTouchMoveBlock, { passive: false, capture: true })
    window.addEventListener('keydown', onKeyDown, true)

    // 起手盘点让位序列（量几何 + 算抓取锚点），失败（条带没了 / 单元找不到）就当没拖起来
    if (!beginLiveReorder()) {
      cancelPress()
    }
  }

  // ------------------------------------------------------------ 实时让位

  /**
   * 起手盘点：抓几何、建虚拟序列（初始 = DOM 顺序）、算抓取锚点，然后立刻按当前指针
   * 位置摆一次。返回 false = 盘不出来（条带没了 / 找不到被拖单元），调用方当没拖起来。
   */
  function beginLiveReorder() {
    const strip = stripEl()
    if (!strip) return false
    const { units, hiddenByGroup } = collectUnits(strip)
    // 页签拖动按 strip id 认；芯片拖动按组 id 认（芯片没有 strip id）
    const dragged = press.gid
      ? units.find((u) => u.kind === 'chip' && u.gid === press.gid)
      : units.find((u) => u.id === press.id)
    if (!dragged || units.length < 2) return false
    // 被拖块：页签拖动 = [它自己]；芯片拖动 = [芯片, ...紧随其后的全体可见组员]
    //（组员在 DOM 序里紧跟芯片 —— 「同组成员连续」的不变式；折叠组的组员不在 units 里，
    // 由芯片代表，commit 时经 hiddenByGroup 展开）。块内单元的相对间距 == 槽位模型的
    // 间距（mr(prev) + ml(next)），整段挪动不改变它 ⇒ 全程共用同一个 translate3d。
    const block = [dragged]
    if (press.gid) {
      for (let k = units.indexOf(dragged) + 1; k < units.length; k += 1) {
        const u = units[k]
        if (u.kind === 'item' && u.gid === press.gid) block.push(u)
        else break
      }
    }
    const first = block[0]
    const last = block[block.length - 1]
    drag = {
      id: press.id,
      // 条带元素本身。拖拽期间每帧都要用它量几何 / 写 scrollLeft，缓存住省掉每帧几次
      // querySelector（单元元素在 units 里也是这么缓存的，生命周期相同：同一个祖先被换掉
      // 的话 units[].el 也一样失效）
      strip,
      // 实时归属：页签拖动 = 真实归属（随出入组判定翻转）；芯片拖动 = 组自己的 id
      //（恒定 —— 搬组不改成员关系，无出入组判定）
      gid: press.gid ?? dragged.gid ?? null,
      // 'tab' = 单张页签（有出入组判定与逐张换位）；'group' = 芯片带整组（邻接 run 整段换位）
      kind: press.gid ? 'group' : 'tab',
      // 被拖块（页签拖动长度 1；锚点 grabDX 按块首 —— 用户抓住的就是它）
      unit: dragged,
      block,
      blockSet: new Set(block),
      // 块的视觉宽（前导边缘判据用）与占位宽（内容右缘夹紧用），都从自然位置算、拖拽中不变
      blockEdge: last.left + last.width - first.left,
      blockSpan: last.left + last.width + last.mr - (first.left - first.ml),
      // 抓取格的占位宽（可视区右界夹紧用）：页签拖动 = 那张页签，芯片拖动 = 那枚芯片。
      // 与 blockSpan 只在「展开的组」上不同 —— 整块几百像素，抓芯片时块尾本来就挂在条带
      // 右缘外面（是拖之前的样子），见 updateDrag 里 maxLeft 那段。
      anchorSpan: first.width + first.ml + first.mr,
      units,
      hiddenByGroup,
      // 内容总宽的右缘（内容坐标）：所有可见单元按边距盒首尾相接加起来即是。跟手钳制的
      // 上界要用它 —— 见 updateDrag「右界取两者较小」那段。
      contentRight: units.reduce(
        (acc, u) => acc + u.ml + u.width + u.mr,
        units[0].left - units[0].ml,
      ),
      // 虚拟序列：拖拽期间的「逻辑顺序」。初始与 DOM 一致；换位只改它，DOM 不动
      order: units.slice(),
      // 虚拟序列里每个单元的目标左缘（内容坐标），layoutTargets 现算
      pos: new Map(),
      // 布局起点：DOM 首元左缘减它自己的左外边距（= 内容盒起点）。所有槽位以此为基准
      start: units[0].left - units[0].ml,
      // 抓取锚点：指针相对被拖块首元左缘的偏移。全程按「指针 - 锚点」定位，起手那一帧不会跳
      grabDX: 0,
      // 块是否被某一侧钳住（updateDrag 每帧写）、本帧朝向哪边推（粘性，仅边缘滚动用）
      pinnedLeft: false,
      pinnedRight: false,
      pushDir: 0,
      // 被拖块首元当前的视觉左缘（内容坐标）；起手 = 它的自然左缘（第一帧的 dir 因此为 0）
      visual: dragged.left,
      // 上一帧指针 clientX（方向门控用，见 updateDrag）。null = 还没收到过移动
      lastPointerX: null,
    }
    liveGroup.value = drag.gid
    // 拖拽态类覆盖整块：块内组员也要关掉 200ms 让位过渡并抬层，
    // 否则芯片逐帧跟手、组员被过渡拖着走，整组肉眼可见地拉开
    draggingIds.value = block.filter((u) => u.id).map((u) => u.id)
    drag.grabDX = press.lastX - stripOriginX(strip) - dragged.left
    layoutTargets()
    updateDrag(press.lastX, press.lastY)
    return true
  }

  /** 按虚拟序列摆一遍槽位：单元的边距盒首尾相接（自然布局的间距模型，见 collectUnits） */
  function layoutTargets() {
    let cursor = drag.start
    for (const u of drag.order) {
      drag.pos.set(u, cursor + u.ml)
      cursor = drag.pos.get(u) + u.width + u.mr
    }
  }

  /** 这个芯片代表的组此刻能不能被拖入：折叠组是整段槽位（拖过只换位、不吸入 ——
   *  Chrome 同款：往折叠组里塞页签等于当场消失），视图页签不参与分组 */
  function joinableChip(u) {
    return !!u && u.kind === 'chip' && !u.collapsed && !drag.unit.view
  }

  /**
   * 芯片拖动时紧贴被拖块的邻接 run（dir=1 看右侧、-1 看左侧）：`{ at, list }` 或 null。
   * run = 无组单元自己；某组则是「芯片 + 它紧随的全部同组组员」整段 —— 组对组必须整段
   * 换位，只换芯片会把对方组员与芯片拆开（连续性不变式，见文件头）。折叠组没有可见
   * 组员，run 就只有芯片。
   * @param {number} i 被拖块首元在虚拟序列里的下标
   * @param {number} dir 本帧移动方向
   */
  function neighborRun(i, dir) {
    const at = dir > 0 ? i + drag.block.length : i - 1
    const head = drag.order[at]
    if (!head || head.gid === drag.gid) return null
    // **无组单元在这里就返回**（二十改）：下面的「同组成员连续」判据写的是
    // `v.gid === head.gid`，而普通页签的 gid 是 null —— 它跟**后面每一张普通页签**都
    // 相等，于是向右一拖就把一串互不相干的散签当成一个 run，阈值变成整串的中点。
    // 表现正是「必须完全拖到对应位置才换位」（2026-10-20 用户报）。
    if (!head.gid) return { at, list: [head] }
    // head 是某组的成员（芯片不邻着我们时只可能撞见组尾）：往左走到组首、再把芯片圈进来
    let start = at
    if (head.kind === 'item') {
      while (start > 0) {
        const v = drag.order[start - 1]
        if (v.kind === 'item' && v.gid === head.gid) start -= 1
        else break
      }
      if (start > 0) {
        const c = drag.order[start - 1]
        if (c.kind === 'chip' && c.gid === head.gid) start -= 1
      }
    }
    const list = [drag.order[start]]
    for (let m = start + 1; m < drag.order.length; m += 1) {
      const v = drag.order[m]
      if (v.kind === 'item' && v.gid === head.gid) list.push(v)
      else break
    }
    return { at: start, list }
  }

  /**
   * 拖出判定（两阶段退出的第一阶段，见文件头）：先把实时归属摘成 null —— 物理顺序
   * （虚拟序列位置）不动（左出例外：要排到芯片左侧），包络线立刻收缩；之后与外部
   * 单元的换位走下面的普通中线碰撞（第二阶段）。返回 true 表示翻了一次归属。
   */
  function tryExitGroup(slot, prev, next) {
    const chip = drag.order.find((u) => u.kind === 'chip' && u.gid === drag.gid)
    if (!chip) return false
    // 左出（prev 是自家芯片 = 被拖页签是组内第一名成员）：右缘收回到芯片中线以左，
    // 页签几乎完全拖出芯片才算真出组。判据用**右缘**不用中心 —— 邻位停放时中心本来
    // 就在芯片中线右边（页签比芯片宽得多），中心判据会在起拖瞬间误退组。
    if (prev === chip && drag.visual + drag.unit.width < drag.pos.get(chip) + chip.width / 2) {
      drag.order.splice(slot, 1)
      drag.order.splice(drag.order.indexOf(chip), 0, drag.unit)
      drag.gid = null
      return true
    }
    // 右出：右邻还是同组成员时谈不上右出（那是组内换位）。判据是**左缘**越过「组剩余
    // 部分的右缘」（除它之外的最后一名成员的右缘；它是唯一成员时就是芯片右缘）20px
    // —— 与「从右拖入」的 40% 深度判据之间留出死区，在组右缘来回拖不会反复翻转。
    if (next && next.gid === drag.gid) return false
    const members = drag.order.filter((u) => u !== drag.unit && u.kind === 'item' && u.gid === drag.gid)
    const last = members[members.length - 1]
    const boundary = last ? drag.pos.get(last) + last.width : drag.pos.get(chip) + chip.width
    if (drag.visual > boundary + GROUP_EXIT_PX) {
      drag.gid = null
      return true
    }
    return false
  }

  /**
   * 拖入判定（未分组页签 → 吸进组，见文件头）。判据全部锚在**被拖页签自己的边缘**上
   * 而不是中心：页签比芯片宽得多，邻位停放时中心早就越过芯片的任何固定线，中心判据
   * 会在起拖瞬间误吸入（且与拖动方向无关）。返回 true 表示翻了一次归属。
   */
  function tryJoinGroup(slot, prev, next) {
    // 从左吸入：右缘压上「组首成员左缘」再深入 12px → 成为该组第 1 个成员（插到芯片
    // 右边）。邻位停放时右缘恰好贴着组首左缘，必须再向右压 12px 才吸入 —— 方向安全、
    // 宽度无关。组被拖空（芯片暂留）时没有「组首成员」，退而求其次：右缘完全越过芯片。
    if (next && joinableChip(next)) {
      const after = drag.order[drag.order.indexOf(next) + 1]
      const firstMember = after && after.kind === 'item' && after.gid === next.gid ? after : null
      const at = firstMember
        ? drag.pos.get(firstMember) + GROUP_JOIN_OVERLAP
        : drag.pos.get(next) + next.width
      if (drag.visual + drag.unit.width > at) {
        drag.order.splice(slot, 1)
        drag.order.splice(drag.order.indexOf(next) + 1, 0, drag.unit)
        drag.gid = next.gid
        return true
      }
    }
    // 从右吸入：左缘越过「组末成员右缘往左 40% 页签宽」。prev 必须是它所在组的
    // **最后一名成员**（身后不再有同组单元 —— 被拖页签自己不算）才构成组的右边界；
    // 唯一的例外是「成员被拖空的组」（芯片拖拽期间暂留）：芯片此刻就是组的全部。
    let gid = null
    let boundary = 0
    if (prev?.kind === 'item' && prev.gid) {
      const pAt = drag.order.indexOf(prev)
      if (!drag.order.some((u, i) => i > pAt && u !== drag.unit && u.gid === prev.gid)) {
        gid = prev.gid
        boundary = drag.pos.get(prev) + prev.width
      }
    } else if (prev?.kind === 'chip' && !prev.collapsed) {
      gid = prev.gid
      boundary = drag.pos.get(prev) + prev.width
    }
    if (gid && drag.visual < boundary - drag.unit.width * GROUP_JOIN_FRAC) {
      drag.gid = gid
      return true
    }
    return false
  }

  /** 拖拽中的每次移动：被拖块跟手 + 出入组判定（仅页签拖动）+ 前导边缘碰撞换位 + 必要时自动滚动 */
  function updateDrag(clientX, clientY) {
    const strip = drag?.strip ?? stripEl()
    if (!strip || !drag) return
    // 一帧只量一次几何：rect（原点换算 + 自动滚动的判定区）与 clientWidth（钳制界）都在这里
    // 取，往下传给 updateAutoScroll。
    // ⚠️ 别在写完 transform 之后再量第二次 —— 原先是 stripOriginX 与 updateAutoScroll 各量
    // 一份，后一次正好落在写 transform 之后。2026-11-13 实测（CDP Performance 指标，17 / 32
    // 个页签、左右扫 6 个来回）：
    //   · LayoutCount 全程 0：transform 与 scrollLeft 都不脏布局，所以它**不是**「强制同步布局」，
    //     后来人别拿这个理由去别处也拆读写；
    //   · 但 RecalcStyleCount 被那次多余的读翻了倍（331 → 168、337 → 168），脚本耗时
    //     0.20 → 0.13、0.24 → 0.08 ms/帧 —— 写完 transform 再读布局属性会强制刷一遍样式。
    // 几何以这一份为准，别再在帧内补读。
    const rect = strip.getBoundingClientRect()
    const clientWidth = strip.clientWidth
    const px = clientX - (rect.left - strip.scrollLeft)
    const prevVisual = drag.visual

    // 被拖块实时跟手：锁 X 轴、横向钳在**可视条带**内（内容坐标 = scrollLeft ~
    // scrollLeft + clientWidth）。这就是条带级的移动边界钳制：左界 = 容器左内边（滚动了
    // 就是 scrollLeft），右界 = 容器右内边 − 块占位宽 —— 不会拖出条带两端。本项目条带里
    // 没有固定页签区、也没有「+」按钮，两端即全部可拖区；将来若加了，这两界各往内收
    // 一段即可。钳的是**可视条带**而不是内容总宽（十六改后与换位判据无关，纯是把跟手
    // 范围锁在看得见的地方）：内容总宽的右缘 = 最后一个槽位的右缘，按内容钳的话块能被
    // 推到条带外面去，而指针没贴到条带边、边缘自动滚动又不触发 —— 只能看见半个单元在
    // 跟手。Chrome 的做法是允许拖进条带右侧的空白区，溢出时靠边缘自动滚动扩行程。
    // 元素自身的 transition 已被 --dragging 关掉，这里写多少走多少，跟手无延迟。
    // 块内全体共用同一个 tx：它们的相对间距 == 槽位模型的间距（见 beginLiveReorder），
    // 钢性连体，一个 transform 值全员够用。
    //
    // ⚠️ 右界必须取「可视条带右缘」与「内容右缘」两者的**较小值**（2026-11-12 第二处
    // 自增长，与 stepAutoScroll 那条是同一个报障的另一半）：只按可视条带钳的话，滚到底
    // 之后 `scrollLeft + clientWidth` 就跑到内容右缘外面去了，被拖块被翻译到那儿 ——
    // transform 会把元素的可滚动溢出算进 scrollWidth，于是 scrollWidth 跟着长、maxScroll
    // 跟着长、下一帧又能多滚一点，一圈圈自喂。探针实测：只按可视条带钳时 scrollLeft 从
    // 真实上限 1296 一路涨到 2718（3 秒，且不停），条带上只剩被拖的那一张吊在右缘、
    // 其余全被滚到视口左边看不见 —— 用户看到的就是「不知道拖到哪去了」。补上内容右缘
    // 这一道，滚到底就真的停住（scrollLeft 停在 maxScroll，边缘自动滚动自己退出）。
    //
    // ⚠️ 第一道的宽度用**抓取格**的 anchorSpan，不是整块的 blockSpan（2026-11-16 用户报
    // 「拖动展开的标签页组的时候，会直接触发动画，让那个标签页组一直靠左」）。展开的组整块
    // 能有几百像素，抓它的芯片时块的右半截本来就挂在条带右缘外面（滚出可视区是**拖之前**
    // 的样子）。按整块夹的话，起手那一拍就把块往回拽大半个组宽（实测 900px 窗口 / 末尾三张
    // 成组 / scrollLeft 120：芯片 tx 从 0 直接跳到 -168），随后往右推又被这道上界挡住 ——
    // 整组钉在左边不动，只能靠边缘自动滚动把条带一路滚到底来「解钳」。改成只要求「被抓住的
    // 那一格留在可视区内」，块尾照旧可以露出右缘，跟拖动前一模一样。页签 / 折叠芯片的块只有
    // 一格，anchorSpan === blockSpan，逐字未变。
    const minLeft = strip.scrollLeft
    const maxLeft = Math.min(
      strip.scrollLeft + clientWidth - drag.anchorSpan,
      drag.contentRight - drag.blockSpan,
    )
    const rawVisual = px - drag.grabDX
    drag.visual = Math.max(minLeft, Math.min(maxLeft, rawVisual))
    // 块被哪一侧钳住了 —— 边缘自动滚动要用（见 updateAutoScroll 那段）。0.5px 容差吃亚像素：
    // 撞墙那一帧的浮点误差会让严格不等号时真时假。注意这里记的是**未钳制**位置越界，
    // 不是「理论最远端」：块本就贴在条带两端（第一张往左、最后一张往右）时同样算钳住，
    // 那正是「已经推不动了」的情形，没有区别。
    drag.pinnedLeft = rawVisual < minLeft - 0.5
    drag.pinnedRight = rawVisual > maxLeft + 0.5
    const tx = drag.visual - drag.unit.left
    for (const u of drag.block) {
      u.tx = tx
      u.el.style.transform = `translate3d(${tx}px, 0, 0)`
    }

    // 方向门控：这一帧指针**真的**往哪边动了（+1 右 / -1 左 / 0 没动）。
    // 拿视觉位移兜底 —— 自动滚动时指针一动不动、但内容在指针底下走，被拖块在内容坐标里
    // 照样在移动；只认 clientX 的话滚到边缘就再也换不了位。起手第一帧 lastPointerX 还是
    // null（prevVisual == visual），dir = 0，不会在抓起来那一瞬间就换位。
    const moveX = drag.lastPointerX === null ? 0 : clientX - drag.lastPointerX
    drag.lastPointerX = clientX
    const dir = moveX !== 0 ? Math.sign(moveX) : Math.sign(drag.visual - prevVisual)
    // 边缘滚动专用的「正在往哪边推」。与 dir 分开：dir 还供换位判据用，不能加死区。
    // 1px 级的手抖不算换向 —— 否则贴着边滚的时候抖一下就会断一帧、渐入重来，看着发顿。
    if (Math.abs(moveX) >= 2) drag.pushDir = Math.sign(moveX)

    // 前导边缘（十六改）：左缘 / 右缘。块拖动时右缘 = 首元视觉左缘 + 块视觉宽
    //（blockEdge 从自然位置算，拖拽中不变 —— 块内相对间距恒定）。
    const leftEdge = drag.visual
    const rightEdge = drag.visual + drag.blockEdge

    // 碰撞循环：可能一帧跨过好几格，循环换到位为止。每轮先重摆槽位，再过各道判定 ——
    // 阈值与中线的先后关系见各分支注释。
    for (;;) {
      layoutTargets()
      const i = drag.order.indexOf(drag.unit)
      const prev = drag.order[i - 1] ?? null

      if (drag.kind === 'group') {
        // 整组搬移（十八改）：与邻接 run 整段换位。触发判据（二十改）锚在**紧挨着被拖块
        // 的那个单元**的中线上 —— 向右取 run 首元、向左取 run 末元，也就是邻位那枚芯片
        // 或那张页签自己的中线，与页签拖动的「前导边缘过邻位中线」逐字相同。
        // 十八改当时取的是 run **整段的中点**：拖过一串 3 张的组，得走过半段组宽才换位，
        // 比页签拖动迟钝一大截（用户口径「应该和拖动页签相同」）。整段照样整段换
        //（组员的连续性不变式不变），只是门槛挪到贴脸的那一侧。方向门控与「中线按槽位
        // 算」两条防抖一并沿用，见下面普通换位那段注释。
        const run = dir !== 0 ? neighborRun(i, dir) : null
        if (run) {
          const edgeUnit = dir > 0 ? run.list[0] : run.list[run.list.length - 1]
          const center = drag.pos.get(edgeUnit) + edgeUnit.width / 2
          if (dir > 0 ? rightEdge > center : leftEdge < center) {
            drag.order.splice(run.at, run.list.length)
            drag.order.splice(dir > 0 ? i : run.at + drag.block.length, 0, ...run.list)
            continue
          }
        }
        break
      }

      const next = drag.order[i + 1] ?? null

      // 出入组：成员身份走拖出判定，无身份走拖入判定（视图页签两侧都跳过）
      if (drag.gid ? tryExitGroup(i, prev, next) : !drag.unit.view && tryJoinGroup(i, prev, next)) {
        continue
      }

      // 普通换位（2026-10-20 十六改：**前导边缘**判据，替代原来的中心判据）：
      //   向右 → 被拖页签的**右缘**越过右邻槽位的中线；向左 → **左缘**越过左邻的。
      // 比中心判据早半个邻签宽度（等宽相邻时行程 0.5w，原来要 1.0w），这就是「手感偏迟钝」
      // 的根 —— 手指其实只想挪半格，却得把整张页签推过去。
      // 两条防抖（缺一条就会来回鬼畜）：
      //   · 中线一律按**槽位**算（layoutTargets 现摆的目标位置），不读相邻页签的
      //     getBoundingClientRect —— 它正在播 200ms 让位过渡，半途中读到的中线是移动的，
      //     会在动画没走完时反复触发反向碰撞；
      //   · **方向门控** dir（见上）：前导边缘判据在换位刚完成时，另一侧边缘必然已经
      //     跨过新邻居的中线（只差 ε），只要指针没有反向回拉就绝不查那一侧，也就不会
      //     瞬间换回来（Ping-Pong）。等宽 / 不等宽都一样。
      // 两类例外不动：
      //   · 成员身份挡住与外部单元的换位（要先过脱离阈值退组）和与自家芯片的换位
      //     （左出判据管）—— 组内成员之间照常换位（组内排序）；
      //   · 可吸入的芯片不做「换位」—— 吸入（tryJoinGroup）取代它；没到吸入深度就
      //     谁也不动，页签单纯跟手。
      // 与芯片换位同样用前导边缘：邻位停放时页签右缘 ≈ 芯片左缘、左缘 ≈ 芯片右缘，
      // 两侧都离芯片中线有 chipWidth/2 的余量，起拖瞬间不会误触发（那是旧实现的真实 bug）。
      // 跨组越界（二十四改）：未分组的单元撞上**已有组**的成员、这一换又正好把它塞进
      // 那个组的两个成员之间时，普通换位会把组**劈成两段** —— stripOrder 上该组的成员
      // 不再连续，而 stripItems 按「组首」插芯片，条带上于是出现**两枚胶囊 + 两条包络线**
      //（2026-10-20 用户报「拖动一个标签页到标签页组中，出现了两个胶囊」截图里就是
      // new.cpp 被塞进两个长题名页签之间）。
      // 为什么以前大多数时候不炸：页签拖到组的边缘，tryJoinGroup 会先把它吸进组
      //（右入要越过组末成员右缘 40% 页签宽、左入要压过组首 12px）。但那两条判据都
      // **按被拖页签自己的宽度**算，窄页签（new.cpp）对上宽页签（长题名）时，35px 的
      // 行程里「前导边缘过中线」比「压过 40% 自身宽」先到 —— 于是先换位、后入组，
      // 那一帧之后它已经在组中间了，两块判据都不再命中。
      // 分两种收场：
      //   · 页签（能入组）→ **就地入组**，下一帧起在内侧换位，与 Chrome「拖进组中间
      //     就是加入该组」一致；
      //   · 视图页签（不能入组）→ 连芯片带组员**整段**跳过去，绝不劈开组。
      // 门槛与普通换位逐字相同（前导边缘过邻位中线）；单成员的组劈不开，交给普通换位。
      if (!drag.gid && dir !== 0) {
        const nu = dir > 0 ? next : prev
        if (
          nu &&
          nu.kind === 'item' &&
          nu.gid &&
          (dir > 0
            ? rightEdge > drag.pos.get(nu) + nu.width / 2
            : leftEdge < drag.pos.get(nu) + nu.width / 2)
        ) {
          const run = neighborRun(i, dir)
          if (run && run.list.filter((u) => u.kind === 'item').length >= 2) {
            if (!drag.unit.view) {
              drag.gid = nu.gid
              continue
            }
            drag.order.splice(run.at, run.list.length)
            if (dir > 0) drag.order.splice(i, 0, ...run.list)
            else drag.order.splice(drag.order.indexOf(drag.unit) + 1, 0, ...run.list)
            continue
          }
        }
      }

      const nextIsJoinableChip = !!next && next.kind === 'chip' && !drag.gid && joinableChip(next)
      if (
        dir > 0 &&
        next &&
        !nextIsJoinableChip &&
        (!drag.gid || next.gid === drag.gid) &&
        rightEdge > drag.pos.get(next) + next.width / 2
      ) {
        drag.order.splice(i, 1)
        drag.order.splice(i + 1, 0, drag.unit)
        continue
      }
      if (
        dir < 0 &&
        prev &&
        (!drag.gid || (prev.kind !== 'chip' && prev.gid === drag.gid)) &&
        leftEdge < drag.pos.get(prev) + prev.width / 2
      ) {
        drag.order.splice(i, 1)
        drag.order.splice(i - 1, 0, drag.unit)
        continue
      }
      break
    }
    // 归属翻过的话同步给包络线（EditorTabs 的测量读这份 ref）
    if (liveGroup.value !== drag.gid) liveGroup.value = drag.gid

    // 端缘标记（二十一改）：按**视觉**位置算，判据与脚的几何对齐 ——
    //   · 左：块视觉左缘 ≤ 0.5（内容坐标；左脚伸到 x=-8，x<0 就被条带裁平，等于没地方落）；
    //   · 右：块视觉右缘 ≥ 内容总宽 − 0.5（右脚伸到末槽右缘之外 8px，越过内容总宽就会
    //     把条带撑出几像素假滚动行程 —— 十八改关 strip-last 右脚的那条理由，同样成立）。
    // 内容总宽从槽位模型取（末单元的 pos+width+mr），换位不改变它。0.5px 容差吃掉亚像素。
    const lastU = drag.order[drag.order.length - 1]
    const contentRight = drag.pos.get(lastU) + lastU.width + lastU.mr
    let edge = null
    if (drag.visual <= 0.5) edge = 'first'
    else if (drag.visual + drag.blockEdge >= contentRight - 0.5) edge = 'last'
    if (dragEdge.value !== edge) dragEdge.value = edge
    applyOthers()
    updateAutoScroll(clientX, clientY, rect)
  }

  /** 让位：其余单元滑向自己在虚拟序列里的槽位（过渡由 EditorTabs 的 is-dragging 规则给）。
   *  被拖块全体跳过 —— 它们的 transform 由 updateDrag 每帧直写（跟手优先）。 */
  function applyOthers() {
    for (const u of drag.units) {
      if (drag.blockSet.has(u)) continue
      const tx = drag.pos.get(u) - u.left
      if (u.tx === tx) continue
      u.tx = tx
      u.el.style.transform = `translate3d(${tx}px, 0, 0)`
    }
  }

  /**
   * 把虚拟序列换算成 moveStripItem 的落点下标（全表下标，含折叠藏起来的成员）：
   * 数一遍「排在被拖页签前面的条目」，芯片处展开成它藏着的成员 —— 折叠组在视觉上就是
   * 一枚芯片，提交后成员回到芯片右邻的槽位上，两边对得整整齐齐。
   */
  function commitIndex(d) {
    let index = 0
    for (const u of d.order) {
      // 块锚在块首（页签拖动 = 它自己；芯片拖动 = 芯片 —— 块内的组员全排在芯片后面，
      // 不该被数进去，落点下标按「去掉整段成员」的列表算，与 moveStripRun 的契约对齐）
      if (u === d.block[0]) break
      if (u.kind === 'chip') index += d.hiddenByGroup.get(u.gid)?.length ?? 0
      else index += 1
    }
    return index
  }

  /**
   * 记下「这个组还在归位补间里」（gid）或清掉（null）。SETTLE_MS 过完自动清，不必等补间
   * 的 finished —— 归位是 fire-and-forget 的 WAAPI，元素被重渲染掉时它的 promise 不一定
   * 会跑，而抬层多挂一帧只是无害，永久挂着才会让芯片一直压在别人上面。
   * @param {string|null} gid
   */
  function markSettlingGroup(gid) {
    if (settlingTimer) {
      window.clearTimeout(settlingTimer)
      settlingTimer = 0
    }
    settlingGid.value = gid
    if (!gid) return
    settlingTimer = window.setTimeout(() => {
      settlingTimer = 0
      settlingGid.value = null
    }, SETTLE_MS + 40)
  }

  /**
   * 收尾：松手（commit=true）提交排序；取消 / Esc / pointercancel（commit=false）不提交。
   * 两种出口的视觉收尾相同 —— settle() 从各元素的**当前视觉位置**补间到（提交后的）
   * 自然车位。
   */
  function finishDrag(commit) {
    const d = drag
    const index = commit && d ? commitIndex(d) : null
    // 落盘载荷：页签拖动带实时归属（调用方结算成员关系）；芯片拖动只报组 —— 成员关系
    // 不动，调用方整段挪 stripOrder。取消（commit=false）不发货 —— 调用方什么都不做。
    const payload =
      commit && d
        ? d.kind === 'group'
          ? { kind: 'group', gid: d.gid }
          : { kind: 'tab', id: d.id, liveGid: d.gid }
        : null
    // 元素清单先抓下来（cancelPress 会把 drag 置空）
    const els = d ? d.units.map((u) => u.el) : []
    // 视觉位置必须在**提交之前**记（内容坐标）：提交重排后 offsetLeft 变成新车位，
    // 再量 rect - offsetLeft 得到的只是「旧内联位移」—— 那会让页签先跳「新车位 + 旧位移」
    // 再滑回来，肉眼就是松手那一下先蹦一下（2026-10-20 用户报「松手动画不自然」）。
    // 正确的残差 = 提交前看到的视觉位置 - 提交后的自然车位，两边都得现量。
    const strip = stripEl()
    const visuals = new Map()
    if (d && strip) {
      const originX = stripOriginX(strip)
      for (const el of els) visuals.set(el, el.getBoundingClientRect().left - originX)
    }
    // 抬层要**排在 cancelPress 之前**：`--dragging` 与 `.is-dragging` 是在 cancelPress 里摘的，
    // 两者落在同一批渲染里，芯片才不会先掉回页签底下再被抬起来（那一帧就是用户报的「钻到
    // 底下」）。组以外的拖拽不动这条（理由见 settlingGid 的注释）。
    markSettlingGroup(d?.kind === 'group' ? d.gid : null)
    cancelPress()
    if (payload) onDrop?.(payload, index)
    if (d) nextTick(() => settle(els, visuals))
  }

  /**
   * 提交后的回弹归位：条带的 DOM 顺序刚被重排，每个元素的自然车位变了。从**提交前**
   * 记下的视觉位置（finishDrag 里的 visuals，含拖拽 / 让位残留）算出与新车位的差，
   * 一段 150ms ease-out 的 WAAPI 补间归零 —— 已就位的差为 0 自动跳过，还在半路的平滑
   * 接上。提交那一拍调用方把 TransitionGroup 切到 tab-instant（FLIP 不发），不会跟这段
   * 补间打架。内联 transform 在读数之前清掉。
   */
  function settle(els, visuals) {
    // 内联 transform 无条件先清（审计改）：哪怕条带此刻不在了（极端时序），残留的内联
    // 位移也不能留在元素上 —— 清理链的完备性优先于补间。
    const strip = stripEl()
    const originX = strip ? stripOriginX(strip) : 0
    for (const el of els) {
      const from = visuals.get(el)
      el.style.transform = ''
      if (!strip || from == null) continue
      const residual = from - (el.getBoundingClientRect().left - originX)
      if (Math.abs(residual) < 0.5) continue
      el.animate(
        [
          { transform: `translate3d(${residual}px, 0, 0)` },
          { transform: 'translate3d(0, 0, 0)' },
        ],
        { duration: SETTLE_MS, easing: 'ease-out' },
      )
    }
  }

  /** 指针贴近条带左右边缘时持续横向滚动（页签多到溢出时，拖到边缘能继续挪）。
   *  只负责「这一帧该以多快滚」（写 scrollVelocity）与**点火**；续帧归 stepAutoScroll。
   *  @param {DOMRect} [measured] 调用方（updateDrag）本帧已量好的条带矩形，直接复用 */
  function updateAutoScroll(clientX, clientY, measured) {
    const strip = drag?.strip ?? stripEl()
    const rect = measured ?? strip?.getBoundingClientRect()
    if (!strip || !rect) return
    // 指针已不在条带的纵向范围内（比如拖到编辑区里去）：别滚。容差见 DRAG_Y_TOLERANCE
    if (clientY < rect.top - DRAG_Y_TOLERANCE || clientY > rect.bottom + DRAG_Y_TOLERANCE) {
      stopAutoScroll()
      return
    }
    // 贴边 EDGE_PX 内开始滚，速度随距离按二次曲线加快（SPEED_MIN → SPEED_MAX）：
    // 越靠边越急，靠近这 EDGE_PX 边界时几乎不动，不会「一进边缘就窜出去」
    const pointerLeftGap = clientX - rect.left
    const pointerRightGap = rect.right - clientX
    let leftGap = pointerLeftGap
    let rightGap = pointerRightGap

    // 宽块死区（2026-11-13）：钳制按**抓取格**算（anchorSpan），触发却只按指针 —— 页签最宽
    // ~160px。块撞墙停住时指针离墙还有大半个格宽（抓左端时约 140px），于是有上百像素的
    // 「抓手凭空拖动、块一动不动、也不滚」的死区；抓右端又几乎没有死区，所以症状是
    // 「有时候顺、有时候卡」，很难归因。
    // 修法：块被该侧钳住、且还在往那一侧推时，把**抓取格的未钳制边缘**也纳入判定，gap 加半个
    // 感应区（20px）留冲程 —— 撞墙那一刻取 20px（t=0.5 → 约 1/4 速度）柔和起步，继续往外
    // 顶 20px 才拉满；直接用未钳制边缘的话撞墙瞬间 gap=0，速度一步到顶。
    // ⚠️ 宽度必须与钳制同源（anchorSpan，不是 blockSpan）：展开的组整块几百像素，若按整块
    // 算，只要组尾还挂在右缘外面，指针离墙还有两三百像素就已经「gap 深负 → 满速」—— 起手
    // 推一下就把整条滚到底（2026-11-16 用户报「拖动展开的标签页组会直接触发动画」的第二个
    // 成因，探针实测 scrollLeft 120 → 289 一气滚到 max、芯片 tx 从 -168 滑回 -6）。
    // ⚠️ 三条边界，缺一条都会退化成别的问题：
    //   · 块**没被钳住**时不能用边缘：指针必在块内，边缘恒比指针更靠边，min() 会退化成
    //     「只看边缘」，滚动提前一个格宽就开始；
    //   · 钳住但**方向相反**时不能用：宽块贴左墙、用户往右拖，块照样是 pinnedLeft，光看 gap
    //     会一路向左滚；
    //   · 钳住且方向相反时，那一侧的**指针** gap 也要屏蔽：从撞墙点往回收要收大半个格宽才
    //     解钳，这期间指针可能还在 40px 区内，不屏蔽照样反向滚。
    // 反过来，解钳之后（块开始跟手）就自动回落到只认指针，与改动前逐字相同。
    const pushDir = drag?.pushDir ?? 0
    if (drag && drag.pinnedRight && pushDir > 0) {
      const grabRightGap = pointerRightGap - (drag.anchorSpan - drag.grabDX)
      rightGap = Math.min(pointerRightGap, grabRightGap + EDGE_PX * 0.5)
      leftGap = Number.POSITIVE_INFINITY
    } else if (drag && drag.pinnedLeft && pushDir < 0) {
      leftGap = Math.min(pointerLeftGap, pointerLeftGap - drag.grabDX + EDGE_PX * 0.5)
      rightGap = Number.POSITIVE_INFINITY
    } else if (drag && drag.pinnedLeft) {
      leftGap = Number.POSITIVE_INFINITY
    } else if (drag && drag.pinnedRight) {
      rightGap = Number.POSITIVE_INFINITY
    }

    let velocity = 0
    if (leftGap < EDGE_PX) velocity = -scrollVelocityFor(leftGap)
    else if (rightGap < EDGE_PX) velocity = scrollVelocityFor(rightGap)

    if (!velocity) {
      stopAutoScroll()
      return
    }
    const now = performance.now()
    // **起滚 / 换向**才重置时间基准与余数。⚠️ 判据不能用 scrollFrame：帧循环里
    // stepAutoScroll 一进来就把 scrollFrame 清 0，接力调到这里时同样是 0，「首次」判不出来。
    if (!scrollVelocity || Math.sign(scrollVelocity) !== Math.sign(velocity)) {
      scrollLastTs = now
      scrollEnterTs = now
      scrollRemainder = 0
    }
    scrollVelocity = velocity
    if (!scrollFrame) scrollFrame = window.requestAnimationFrame(stepAutoScroll)
  }

  /** 离边缘还有多远 → 目标速度（px/s；贴边最大，退到 EDGE_PX 处最小；越界按 0 算）。
   *  二次曲线而不是线性：前半段极缓，好让用户精准停在紧贴边缘的那张页签上；
   *  最后十几像素才拉满。线性插值一进区就给 1/8 速度，会有「视口自己逃逸」的感觉。 */
  function scrollVelocityFor(gap) {
    const t = 1 - Math.max(0, Math.min(gap, EDGE_PX)) / EDGE_PX
    return SPEED_MIN + (SPEED_MAX - SPEED_MIN) * t * t
  }

  function stepAutoScroll(now = performance.now()) {
    scrollFrame = 0
    const strip = drag?.strip ?? stripEl()
    if (!strip || !scrollVelocity || !press?.dragging) return

    // 帧间隔：切后台回来会给出巨大间隔，钳到 50ms；时间戳倒挂（个别实现的 rAF 时间戳可能
    // 早于调度时记下的 performance.now()）按 0 算，别让 dt 变负把余数搅乱
    const elapsed = Math.min(50, Math.max(0, now - scrollLastTs))
    scrollLastTs = now
    const dt = (elapsed > 0 ? elapsed : 16.67) / 1000

    // 边缘驻留渐入：刚进区的前 RAMP_UP_MS 从 RAMP_START 爬到满
    const ramp =
      Math.min(1, RAMP_START + ((1 - RAMP_START) * Math.max(0, now - scrollEnterTs)) / RAMP_UP_MS)

    // 亚像素累加：120Hz 下最低速一帧只有 0.5px，直接取整会永远不动，小数存起来等下一帧凑
    const exact = scrollVelocity * ramp * dt + scrollRemainder
    const intDelta = exact > 0 ? Math.floor(exact) : Math.ceil(exact)
    scrollRemainder = exact - intDelta

    // ⚠️ intDelta === 0 是「还在攒余数」，不是「滚到头了」，不能拿 scrollLeft === before
    // 当终止判据 —— 那会在 120Hz 的第一帧就把循环掐死（高速下看不出来，慢速必现）。
    if (intDelta !== 0) {
      const before = strip.scrollLeft
      strip.scrollLeft = before + intDelta
      // 已经到顶 / 到底：停下，别空转
      if (strip.scrollLeft === before) {
        stopAutoScroll()
        return
      }

      // 滚动把页签挪了位置，跟手与让位要按同一个指针位置重算。
      // **下一帧由这一句接力**：updateDrag 尾巴上的 updateAutoScroll 会按「刷新后的条带几何」
      // 重算速度，并在 scrollFrame 还是 0 时排上新的一帧（见它的最后一行）。
      // ⚠️ 这里**不能**再无条件排一次。两处各排一帧的话，第 n 帧就有 2^n 条循环在跑，而每条
      // 都会把 scrollLeft 往前推一格 —— 帧数翻倍、scrollLeft 跟着指数暴涨。2026-11-12 用户报
      // 「页签多到出现横向滚动条时，把页签往右拖就不知道拖到哪去了」的真因就是这一行：探针
      // 实测 scrollLeft 260 → 575 → 33017 → 262393 → 2097401 → 1.7e7。被拖页签的 translate3d
      // 又是按 scrollLeft 算出来的（visual - unit.left），两边同涨同落，于是它死死钉在条带
      // 右缘、其余页签被滚到几百万像素之外，看起来就是「拖丢了」。
      // 只在**溢出**时才滚得动（下面那句 `scrollLeft === before` 就 return），所以这个坑必须
      // 等到「页签多到出现横向滚动条」才现形；鼠标与触屏共用这一条路径。
      updateDrag(press.lastX, press.lastY)
    }

    // 兜底续帧：攒余数那一帧、updateDrag 半路早退（条带没了 / 让位状态已收）时没人接力，
    // 不补一帧就会滚到一半停住。正常路径下 scrollFrame 已被 updateAutoScroll 排上，这里不会进。
    if (!scrollFrame && scrollVelocity && press?.dragging) {
      scrollFrame = window.requestAnimationFrame(stepAutoScroll)
    }
  }

  function stopAutoScroll() {
    scrollVelocity = 0
    scrollRemainder = 0
    scrollLastTs = 0
    scrollEnterTs = 0
    if (scrollFrame) {
      window.cancelAnimationFrame(scrollFrame)
      scrollFrame = 0
    }
  }

  // ------------------------------------------------------------ 收尾

  /**
   * 清掉这一轮按压的全部临时状态（不动 click 抑制，那个要活到 click 之后）。
   * **这是所有出口的唯一收口**：松手、轻点、Esc、指针被系统掐断（pointercancel）、
   * 窗口失焦（blur）、菜单弹出、组件卸载 —— 谁漏走这里，页签就会卡在「半空中」（浮起 + 滚动锁 + 拖拽态
   * 一起挂在 DOM 上），那是这套手势里最不能接受的一种死锁。
   */
  function cancelPress() {
    if (press?.armTimer) window.clearTimeout(press.armTimer)
    if (press?.menuTimer) window.clearTimeout(press.menuTimer)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerCancel)
    window.removeEventListener('blur', onWindowBlur)
    window.removeEventListener('touchmove', onTouchMoveBlock, true)
    window.removeEventListener('contextmenu', onContextMenuBlock, true)
    window.removeEventListener('keydown', onKeyDown, true)
    stopAutoScroll()
    // 滚动锁必须在任何出口都解开（touch-action 也要还原成样式表里的 pan-x）
    unlockStripScroll()
    press = null
    // 触屏那两个提示态统一在这里收：松手、Esc、pointercancel、组件卸载都汇到这条路上，
    // 漏掉任何一个出口，页签上「弹过了 / 正按着」的样子就会一直挂在那儿
    pressingId.value = null
    armedId.value = null
    draggingId.value = null
    touchDrag.value = false
    // 实时归属一并收（没提交的翻转就地丢弃 —— 取消 / Esc 不该留任何副作用）
    liveGroup.value = null
    // 端缘标记一并收（strip-first / strip-last 回归 DOM 顺序的静态判定）
    dragEdge.value = null
    draggingIds.value = []
    // 让位状态一并收（内联 transform 不在这里清 —— finishDrag 的 settle 还要拿它算残差）
    drag = null
  }

  function markClickSuppressed() {
    suppressClick = true
    if (suppressClickTimer) window.clearTimeout(suppressClickTimer)
    // 兜底：万一这次没有 click 跟上来，别让标记永远吞掉下一次正常点击
    suppressClickTimer = window.setTimeout(() => {
      suppressClickTimer = 0
      suppressClick = false
    }, CLICK_SUPPRESS_MS)
  }

  /** 页签的 activate / 双击钉住开头调用；返回 true 表示这次点击是拖拽的尾巴，应当忽略 */
  function consumeClickSuppression() {
    if (!suppressClick) return false
    suppressClick = false
    if (suppressClickTimer) {
      window.clearTimeout(suppressClickTimer)
      suppressClickTimer = 0
    }
    return true
  }

  onBeforeUnmount(cancelPress)

  return {
    /** 正在被拖的页签 id（芯片拖动时是 `group:<gid>` 哨兵）；页签上的拖拽态类用 */
    draggingId,
    /** 这一轮拖拽是不是触屏发起的（模板挂 is-touch-drag：放大 + 投影） */
    touchDrag,
    /** 被拖块里带 strip id 的单元（模板给整块挂 --dragging 类用） */
    draggingIds,
    /** 松手后仍在归位补间里的组 id（芯片上的「继续保持抬层」用；SETTLE_MS 后自动清） */
    settlingGid,
    /** 被拖页签的实时归属（组 id | null）；只在拖拽期间有值 —— 包络线测量读它 */
    liveGroup,
    /** 被拖块视觉上贴着条带哪端（'first' | 'last' | null）；拖拽期间按视觉位置每帧重算
     *  —— strip-first / strip-last 的拖拽期覆盖用（EditorTabs 的 stripItems 尾部） */
    dragEdge,
    /** 触屏按压中的页签 id（芯片为 `group:<gid>` 哨兵；「按住进度」底色用） */
    pressingId,
    /** 长按已成、尚未松手的页签 id（同上哨兵；「弹一下」动画用） */
    armedId,
    onTabPointerDown,
    onChipPointerDown,
    consumeClickSuppression,
  }
}
