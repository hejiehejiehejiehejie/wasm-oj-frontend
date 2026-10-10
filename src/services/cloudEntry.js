/**
 * 云配置的入口 —— 地址栏的 www.998244353.best/<handle>，以及本机自己记住的那一位
 *
 * 云端配置本来就是公开可读的（GET /api/config/<handle> 不需要任何鉴权），所以「把用户名接在
 * 网址后面」天然就是一条分享链接：别人打开它就能拿到这套偏好。
 *
 * 两件事刻意不做：
 * - **不自动登录**：登录会往本机写 cp.cloudAccount / cp.cloudToken，等于把这台设备绑到
 *   别人的用户名上，还顺手多出「上传 / 解绑」两个入口。链接谁都能构造，它只该带来一次
 *   「要不要套用」的询问，而不是一个已经生效的状态。
 * - **不替「还没答的询问」留存档**：地址带来的 handle 只在内存里活一次会话，没有需要清理的
 *   待办键。（下文那份 `cp.cloudActive` 记的是「本机在跟谁」，不是「谁还在等答复」。）
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
 * 于是 confirmEntryHandle 直接 replaceState 回根路径，并在页面上弹一句「还没保存过配置」——
 * 判定与抹地址都发生在会话启动后的那一次探测里（App.vue 的 onMounted；为什么不是 mount 之前，见那里的注释）。
 *
 * 【反方向：本机改用某个 handle 的配置后，主动把 /<handle> 写进地址栏】
 * 上面说的是「别人给的链接打开后不要擅自抹掉」，这里说的是「本机自己认下了某个 handle」
 * （导入 / 上传 / 登录 / 下载到本机，见 writeCloudEntryPath）。写上去之后地址栏本身就是
 * 「我现在用的是谁的配置」，可以直接收藏或分享。两个方向不冲突：一个只管自己写、一个只管不抹。
 *
 * 【本机记住「在跟谁」：下次打开站点，把那套直接接着用上】
 * 地址栏那条「这个地址 = 这套配置」只活在当前页签里，关掉就没了。所以这里还落一份存档
 * （`cp.cloudActive = { handle, updatedAt }`，键名定义在 storageNames.js）：本机认下某个 handle
 * 的四处（与 writeCloudEntryPath 同四处）顺手记下来，启动时地址里没有 handle 就把那一套对齐一遍。
 * 这就是「下次打开网站直接用它那一套」，不再弹确认。
 *
 * 三个刻意的边界：
 * - **只对齐确实变过的那一份**。存档里记着已套用过的 `updatedAt`，与云端相同就什么都不做 ——
 *   否则每次打开站点都会覆盖本机一次（本机的临时改动全被冲掉），而且会「套用 → 刷新 → 又套用」
 *   转不出去（那次刷新是无条件的）。云端换了新版本才套用，等于「云端永远是对齐目标」。
 * - **地址栏跟着走到 `/<handle>`（2026-10-10 加）**：这一步只是把「本机在跟谁」补进地址 ——
 *   用户打开根路径后地址栏从此写着那位，可以直接收藏或分享，与四条入口共用同一个
 *   「地址 = 这套配置」的语义。两道闸门缺一不可：
 *   ① **只在网页版的站点根路径**写（`IS_WEB` + `isSiteRoot()`）。壳端的页面来自
 *      `tauri://localhost` / `http://tauri.localhost`，把它改成 `/<handle>` 等于让壳的资源协议
 *      去找一个不存在的文件（一刷新就白屏），而壳里本来没有地址栏 —— 写了只有坏处；
 *      guide.html / privacy.html 这类静态页同理（它们现在不加载这份 bundle，规矩先立在这儿）。
 *   ② **只在云端确实有这份配置**时写（`probe.success`）。探测失败 / 404 时地址一动不动，
 *      否则会写出一条一刷新就只剩「还没保存过配置」的地址。
 *   写在这里也**必须排在 applyCloudProfile 之前** —— 那一步会 reload，排在它后面根本执行不到。
 * - **地址里带了别人（不是本机在跟的那位）的 handle 时行为不变**：仍然只问一次、等用户点头，
 *   见 confirmCloudEntry。
 */
import { ref } from 'vue'
import { flush } from './autoSave.js'
import { applyProfile, fetchCloudProfile } from './cloudProfile.js'
import { IS_WEB } from './platform.js'
import { CLOUD_ACTIVE_KEY } from './storageNames.js'

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

/**
 * 存档里那个 handle 的合法形状：与后端 `normalizeHandle` 同一条（**多认点号**）——
 * 点号只是不能写进地址栏（会和静态资源撞车，见 HANDLE_NAME），它本身是个合法的 Codeforces 用户名。
 * 认不出来就当没记过，宁可回到「每次都要用户自己来一遍」。
 */
const HANDLE_STORED = /^[A-Za-z0-9_.-]{3,24}$/

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
 * 当前地址是不是站点根路径（`/`，或直接点开 `/index.html`）。
 *
 * 只有根路径才替用户把地址写成 `/<handle>`：guide.html / privacy.html 这些静态页虽然也由本站
 * 提供，但地址就是它们自己 —— replaceState 改掉不会跳转，可一旦刷新就跑到 IDE 去了，等于把
 * 用户正在看的那个页面地址吞掉。壳端不用这条判据（那边路径也是 `/`），挡它的是 `IS_WEB`。
 */
function isSiteRoot() {
  return /^\/(index\.html)?$/.test(window.location.pathname)
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
 * 本机记着的那一位（见文件头【本机记住「在跟谁」】）。读盘一律**校验形状**：
 * 存档是用户能手改的地方，认不出来就当没记过 —— 拿一串垃圾去拼 `/api/config/<它>` 只会白跑一趟。
 * 这里刻意不走 `usePersistentRef`：它要在 App 装好之后的启动那一步被读到，且没人需要它的响应式。
 */
export function readActiveProfile() {
  try {
    const raw = window.localStorage.getItem(CLOUD_ACTIVE_KEY)
    if (!raw) return { handle: '', updatedAt: '' }
    const parsed = JSON.parse(raw)
    const handle = typeof parsed?.handle === 'string' ? parsed.handle : ''
    if (!HANDLE_STORED.test(handle)) return { handle: '', updatedAt: '' }
    return { handle, updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '' }
  } catch {
    return { handle: '', updatedAt: '' }
  }
}

/** 记下「本机现在跟着谁」+ 已套用的那一版（`updatedAt` 空串 = 不知道，于是下次一定会对齐一次） */
export function writeActiveProfile(handle, updatedAt = '') {
  if (!HANDLE_STORED.test(handle)) return
  try {
    window.localStorage.setItem(CLOUD_ACTIVE_KEY, JSON.stringify({ handle, updatedAt }))
  } catch {
    /* 配额满 / 隐私模式：记不住就退回「每次自己来一遍」，不影响别的功能 */
  }
}

/** 不再跟着谁（解绑时调）：删掉存档，下次打开站点不再自动对齐 */
export function forgetActiveProfile() {
  try {
    window.localStorage.removeItem(CLOUD_ACTIVE_KEY)
  } catch {
    /* 同上 */
  }
}

/**
 * 把一份云端配置落到本机、然后刷新页面。设置页里那次「下载到本机」（`adoptCloudProfile`）
 * 是同一个动作，两处都是**只下不传** —— 这里不碰云端一个字节。
 *
 * 只在云端那一份确实变过时才动手（`updatedAt` 与本机记着的一致就说明「现在用的就是它」），
 * 理由见文件头；`applyProfile` 写进去 0 条（云端存了个空配置）也当没有可套用的东西，
 * 不记也不刷新 —— 下次打开再探一次，成本只是一次公开的 GET。
 */
async function applyCloudProfile(data, handle, updatedAt) {
  const active = readActiveProfile()
  if (active.handle.toLowerCase() === handle.toLowerCase() && active.updatedAt === updatedAt) return
  if (!applyProfile(data)) return
  // 先把「已套用哪一版」落下：下面那次 reload 之后就是靠它判断「不用再套一遍」
  writeActiveProfile(handle, updatedAt)
  // 刷新前把编辑器里还没落盘的正文写回 VFS（与 adoptCloudProfile 同一条理由）
  await flush()
  window.location.reload()
}

/** 地址里没有 handle 时的那条路：本机记着谁，就把谁对齐一遍 */
async function resumeActiveProfile() {
  const active = readActiveProfile()
  if (!active.handle) return
  const probe = await fetchCloudProfile(active.handle)
  // 404（云端那份已经没了）/ 离线 / 说不准：什么都不做，记录留着 ——
  // 这一刻没有不代表以后没有，删掉记录反而会让「另一台设备再传一次」永远同步不过来
  if (!probe.success) return
  // 云端确实有这一份：地址栏跟着走到 /<handle>，此后它就是这条可收藏、可分享的链接。
  // 必须在下面这次 applyCloudProfile 之前 —— 那一步一旦真的套用就会 reload，排在后面执行不到。
  // 两道闸门（网页版 + 站点根路径）的理由见 isSiteRoot 与文件头；带点号的 handle 由
  // writeCloudEntryPath 自己放弃（会和 guide.html 这类静态资源撞车）。
  if (IS_WEB && isSiteRoot()) writeCloudEntryPath(active.handle)
  await applyCloudProfile(probe.data, active.handle, probe.updatedAt ?? '')
}

/** 地址里带来的 handle：本机正在跟的那一位就直接对齐，别人的仍然交给设置页去问 */
async function confirmEntryHandle(handle) {
  entryHandle = ''
  const probe = await fetchCloudProfile(handle)
  if (probe.notFound) {
    resetCloudEntryPath()
    cloudEntryMissingHandle.value = handle
    return false
  }
  // 这条链接指的就是本机在跟的那位：不再多问一句（`updatedAt` 没变的话连刷新都不会发生）
  if (probe.success && readActiveProfile().handle.toLowerCase() === handle.toLowerCase()) {
    // 标记要落在那次 reload 之前，否则刷新后地址还在，会被再判一次
    markCloudEntryHandled()
    await applyCloudProfile(probe.data, handle, probe.updatedAt ?? '')
    return false
  }
  // 别人的配置 / 探测失败说不准：照旧只登记状态，打开设置页与弹窗由 App.vue 与面板接手
  pendingCloudHandle.value = handle
  return true
}

/**
 * 会话开始后调用一次：约定「这次要不要套用云端配置」，回答「要不要打开设置页去问」。
 *
 * - 地址里带了 handle → 交 confirmEntryHandle：本机在跟的那位直接对齐（不打开设置页），
 *   别人的配置 / 云端没有这份配置 / 说不准，三种情形与 2026-10-06 之前完全一致。
 * - 地址里没有 handle → 本机记着谁就用谁，**静默对齐**（见 resumeActiveProfile），
 *   不需要设置页，也不需要用户点头 —— 这就是「下次打开网站直接用其配置」。
 */
export async function confirmCloudEntry() {
  if (entryHandle) return confirmEntryHandle(entryHandle)
  await resumeActiveProfile()
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