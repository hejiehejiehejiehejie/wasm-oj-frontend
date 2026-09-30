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
 */
import { ref } from 'vue'

/** 这次打开带来的 handle；空串 = 没有。只在内存里活一次会话 */
export const pendingCloudHandle = ref('')

/**
 * Codeforces handle 只由字母、数字、下划线和连字符组成，所以「一个不带点号的单段路径」
 * 就足以和本站的静态资源区分开：guide.html / sw.js / robots.txt / manifest.webmanifest
 * 都带点号，/assets/… /wasm/… /md/… /extension/… 都是多段。
 * （vercel.json 里的 rewrite 用的也是同一条规则。）
 */
const HANDLE_PATH = /^\/([A-Za-z0-9_-]+)\/?$/

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
  pendingCloudHandle.value = match[1]
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