/**
 * URL 形态的云配置入口 —— www.998244353.best/<handle>
 *
 * 云端配置本来就是公开可读的（GET /api/config/<handle> 不需要任何鉴权），所以「把用户名接在
 * 网址后面」天然就是一条分享链接：别人打开它就能拿到这套偏好。
 *
 * 两件事刻意不做：
 * - **不自动登录**：登录会往本机写 cp.cloudAccount / cp.cloudToken，等于把这台设备绑到
 *   别人的用户名上，还顺手多出「上传 / 解绑」两个入口。链接谁都能构造，它只该带来一次
 *   「要不要套用」的询问，而不是一个已经生效的状态。
 * - **不落任何待办键**：handle 只在内存里活一次会话，没有需要清理的存档。
 *
 * 【地址栏保留 /<handle>，刻意不 replaceState 回根路径】
 * 这条链接的含义就是「这个地址 = 这套配置」：抹掉之后想再打开一次、想复制给别人，
 * 都得重新去翻链接；保留着，地址栏也在告诉用户「现在用的是谁的配置」。
 * 代价是刷新（含套用成功后那次 reload）都会再看到同一段路径，所以必须有个
 * 「这个历史条目已经答过了」的记号 —— 否则套用 → reload → 又弹问 → 又套用，转不出去。
 * 记号写在 **history.state** 上：跟着历史条目走、刷新后仍在、不碰 localStorage /
 * sessionStorage，于是也不需要任何清理逻辑。换个新页签打开同一条链接，state 是空的，
 * 会照常再问一次 —— 这正是想要的。
 *
 * 【唯一的例外：云端没有这份配置时，把地址抹回根路径】
 * 那种情况下没有任何可套用的东西，留着 /<handle> 只会让人以为这里真有一套配置、刷新还要再判一次。
 * 于是 confirmCloudEntry 直接 replaceState 回根路径，并在页面上弹一句「还没保存过配置」——
 * 判定与抹地址都发生在会话启动后的那一次探测里（App.vue 的 onMounted；为什么不是 mount 之前，见那里的注释）。
 *
 * 【反方向：本机改用某个 handle 的配置后，主动把 /<handle> 写进地址栏】
 * 上面说的是「别人给的链接打开后不要擅自抹掉」，这里说的是「本机自己认下了某个 handle」
 * （导入 / 上传 / 登录 / 下载到本机，见 writeCloudEntryPath）。写上去之后地址栏本身就是
 * 「我现在用的是谁的配置」，可以直接收藏或分享。两个方向不冲突：一个只管自己写、一个只管不抹。
 */
import { ref } from 'vue'
import { fetchCloudProfile } from './cloudProfile.js'

/** 待答复的 handle：**已经确认云端存着这份配置**，只等用户在弹窗上点头或拒绝。空串 = 没有。只在内存里活一次会话 */
export const pendingCloudHandle = ref('')

/** 地址带来的、云端**没有**配置的 handle：页面上弹一句提示。空串 = 没有。只在内存里活一次会话 */
export const cloudEntryMissingHandle = ref('')

/** 地址里带来的 handle（还没确认云端有没有配置）。不进 ref：App 拿它去探测，探测完才决定上面两个谁亮 */
let entryHandle = ''

/**
 * Codeforces handle 只由字母、数字、下划线和连字符组成，所以「一个不带点号的单段路径」
 * 就足以和本站的静态资源区分开：guide.html / sw.js / robots.txt / manifest.webmanifest
 * 都带点号，/assets/… /wasm/… /md/… /extension/… 都是多段。
 * （vercel.json 里的 rewrite 用的也是同一条规则。）
 */
const HANDLE_PATH = /^\/([A-Za-z0-9_-]+)\/?$/

/** 单个 handle 的字符集（与 HANDLE_PATH 同一套；后端 normalizeHandle 还多认点号，见下） */
const HANDLE_NAME = /^[A-Za-z0-9_-]+$/

/** 历史条目上的「这次入口已经答过了」标记 */
const ENTRY_STATE_KEY = 'cpCloudEntry'

/**
 * 启动时调用一次：认出地址里的 handle。
 * 地址保持原样 —— 这里只登记，不做跳转、不改地址（理由见文件头）。
 */
export function captureCloudHandleFromPath() {
  const match = window.location.pathname.match(HANDLE_PATH)
  if (!match) return
  // 这个历史条目已经答过一次（收下或拒绝）：不再追问
  if (window.history.state?.[ENTRY_STATE_KEY] === match[1]) return
  entryHandle = match[1]
}

/**
 * 把地址抹回站点根路径（www.998244353.best）。
 * 只在「这条链接指向的 handle 云端没有配置」时用：既然没有可套用的东西，地址就不该留在
 * /<handle> —— 那会让人以为这里真有一套配置，刷新也会再走一遍同样的判定。
 */
function resetCloudEntryPath() {
  if (!HANDLE_PATH.test(window.location.pathname)) return
  window.history.replaceState(window.history.state, '', '/')
}

/**
 * 把 /<handle> 写进地址栏 —— 「这个地址 = 这套配置」。
 *
 * 本机自己认下了某个 handle 之后调用（导入 / 上传 / 登录 / 下载到本机）：地址栏从此就是
 * 「我现在用的是谁的配置」，用户可以直接收藏或分享这条链接。与文件头那条「打开别人的链接
 * 不擅自抹地址」是两个方向，互不冲突。
 *
 * 用 replaceState 而不是 pushState：这不是一次跳转，只是把「我现在是谁」补进地址。
 * push 会多出一条历史记录，按返回键会把地址退回根路径，和眼前这份已经生效的配置对不上。
 *
 * 顺手把「这次入口已经答过了」的标记一并写上：地址是自己写上去的，刷新不该再弹一次
 * 「要不要套用」—— 否则上传完一刷新，界面会问「要把你自己的配置套到你自己身上吗」。
 *
 * 不认的 handle（带点号等）直接放弃：这类名字写进路径会和 guide.html / sw.js 这些静态资源
 * 撞车（见 HANDLE_PATH 的注释，vercel.json 的 rewrite 同样不认）。宁可地址留在根路径，
 * 也不能写出一条刷新就 404 的链接。
 */
export function writeCloudEntryPath(handle) {
  if (!handle || !HANDLE_NAME.test(handle)) return
  // 标记先算好：地址已经是同一个 handle 时只补标记（还可能是另一种大小写，不去改它）
  const state = { ...window.history.state, [ENTRY_STATE_KEY]: handle }
  const current = window.location.pathname.match(HANDLE_PATH)?.[1]
  if (current && current.toLowerCase() === handle.toLowerCase()) {
    window.history.replaceState(state, '')
    return
  }
  window.history.replaceState(state, '', `/${handle}`)
}

/**
 * 会话开始后调用一次：确认这次地址带来的 handle 云端到底有没有配置，回答「要不要打开设置页去问」。
 *
 * - 有配置（含探测失败、说不准的情况）→ 交出 pendingCloudHandle、返回 true：
 *   照旧把设置页打开，由那里弹「要不要套用」。
 * - 明确 404 → 地址抹回根路径、亮出 cloudEntryMissingHandle、返回 false：
 *   没有可套用的东西，就不该把人引到一个空设置页上 —— 只弹一句提示。
 */
export async function confirmCloudEntry() {
  if (!entryHandle) return false
  const handle = entryHandle
  const probe = await fetchCloudProfile(handle)
  if (!probe.notFound) {
    pendingCloudHandle.value = handle
    return true
  }
  entryHandle = ''
  resetCloudEntryPath()
  cloudEntryMissingHandle.value = handle
  return false
}

/**
 * 用户对这条链接给了答复：套用了，或者在弹窗上点了取消 / 关掉了设置页签。
 * 套用成功会立刻 reload，所以这个标记必须在 reload 之前落下，否则一刷新又弹一次。
 * 写在 history.state 上而不是 storage：随历史条目走，换新页签打开就自然重来。
 */
export function markCloudEntryHandled() {
  const match = window.location.pathname.match(HANDLE_PATH)
  if (!match) return
  window.history.replaceState({ ...window.history.state, [ENTRY_STATE_KEY]: match[1] }, '')
}

/** 用户点了「取消」，或者关掉了这次询问所在的设置页签 */
export function clearPendingCloudHandle() {
  pendingCloudHandle.value = ''
}