/**
 * workspaceNotices —— 工作区启动期的「一次性提示」信箱。
 *
 * 【为什么要有它】provider 的 `init()` 跑在 App.vue 的 onMounted 里，与侧栏组件（FileExplorer）
 * 的挂载时序对不齐；而横幅是那个组件内部的局部状态，provider 够不到。这里用一个极小的信箱把
 * 两边解耦：provider 只管投递 i18n key，界面订阅后自己翻译并弹出。
 *
 * 【为什么另起一个模块】provider 不能反向 import workspaceStore（那会绕成
 * workspaceStore → vfsFactory → LocalFolderVFSProvider → workspaceStore 的环）。本模块零依赖，
 * 也不引 Vue，VFS 层 import 它是安全的。
 *
 * 【时序】投递先于订阅不会丢：没有订阅者时消息留在队列里，第一个订阅者接入时补发一次。
 */
/** 尚无订阅者时攒下的 key（同一 key 只攒一条） */
const pending = []
/** 当前订阅者 */
const handlers = new Set()

/**
 * 投递一条启动期提示。
 * @param {string} key i18n key
 */
export function pushStartupNotice(key) {
  if (!key) return
  if (!handlers.size) {
    if (!pending.includes(key)) pending.push(key)
    return
  }
  for (const handler of handlers) handler(key)
}

/**
 * 订阅启动期提示。
 * @param {(key: string) => void} handler
 * @returns {() => void} 退订函数
 */
export function onStartupNotice(handler) {
  handlers.add(handler)
  // 补发订阅之前投递的（provider 的 init 可能早于组件挂载）
  if (pending.length) {
    const keys = pending.splice(0, pending.length)
    for (const key of keys) handler(key)
  }
  return () => handlers.delete(handler)
}
