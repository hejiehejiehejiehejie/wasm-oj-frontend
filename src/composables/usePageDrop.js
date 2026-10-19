/**
 * usePageDrop —— 把**操作系统里的文件**拖进这个页面（不是站内拖拽）。
 *
 * 【为什么与 useTreeDrag 是两套】站内拖拽（资源管理器里挪文件）全程走 Pointer Events，
 * 系统拖进来的只有 HTML5 的 dragenter / dragover / drop 这一套，两者没有一处事件面重叠。
 * 这里只认**带文件的**拖放：`dataTransfer.types` 里没有 `Files` 的一律不碰 —— 编辑器里拖
 * 一段选中的文本、将来别处做的 HTML5 拖拽，都不会被误当成导入。
 *
 * 【落点判据（2026-10-12 用户拍板：整页都是落点）】
 * - 指针压在资源管理器的**某一行**上 → 那个目录（压着文件行就是它所在的父目录，与
 *   `useTreeDrag.resolveTarget` 同一口径），于是「拖到哪儿就落进哪个文件夹」，与站内挪文件
 *   的手感一致；
 * - 指针在别处（树的空白处、编辑区、页签栏、设置页…）→ **根目录**。宁可落到根，也不要
 *   「拖进来了却什么也没发生」。
 *
 * 【高亮怎么下发给资源管理器】目标目录放在模块级的 `pageDropTarget` 上（同 `useTreeDrag`
 * 里 `activeDropZone` 的体例，也是跨组件唯一的通路）：资源管理器读它点亮要落进去的那一行 /
 * 整棵树的底色。指针不在资源管理器里时 `inExplorer` 为 false、`rowId` 为 null —— 那时虽然
 * 照样落到根目录，但树不该亮（亮成一片会让人以为文件要进树里）。
 *
 * 【拖入期间侧栏会被撑开】那是 App.vue 的事（`previewDropTargetLayout`）：落点只有资源管理器
 * 里看得见，所以这里只负责把 `active` 报出去，布局怎么摆不归本文件管。
 *
 * 【悬停在折叠目录上会自动展开】与站内挪文件同一个效果、同一份实现（`springOpen.js`，600ms）
 * —— 拖进来之后要一层层往下落的时候，靠拖拽中途去点开目录是不现实的。两处细节：
 * - 计时只在**指针真的挪过**时重新挂（`settle` 里的 `moved`）。`dragover` 在指针不动时也会
 *   隔一会儿来一发，每发都重挂的话那个计时器永远走不到 600ms；
 * - 指针不动、目录却张开了的时候，底下那一行会换人 —— 计时到点后按同一位置补算一次落点
 *   （`reflowTarget`），高亮才不会停在**已经被顶走的那一行**上。补算这一发不算「挪过」，
 *   所以不会顺带把新长出来的子目录也捎上、一路连环张开。
 *
 * 【读文件是异步的，DataTransfer 却只在事件派发期间有效】条目必须在 drop 事件里**同步**
 * 取出来，之后才能慢慢递归读目录 —— 这条落在 `readDroppedItems` 的第一段，别把它的调用
 * 挪到任何 await 之后。
 */

import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { readDroppedItems } from '../services/fileTransfer.js'
import { getNodeById } from '../services/vfs/workspaceStore.js'
import { dirname } from '../services/vfs/paths.js'
import { contentElementAt } from './contentHit.js'
import { createSpringOpen } from './springOpen.js'

/**
 * 外部文件正拖在页面上时的落点：`{ path, rowId, inExplorer }`；null = 没在拖。
 * - `path`：要落进去的目录绝对路径（'/' 是根）
 * - `rowId`：该目录对应的行 id；根目录与「指针不在树里」都是 null
 * - `inExplorer`：指针是不是落在资源管理器面板里（决定树要不要亮）
 */
export const pageDropTarget = shallowRef(null)

/**
 * 这一发拖拽事件带的是文件吗。
 * 站内拖拽走 Pointer Events、根本不产生 drag 事件；编辑器里拖一段选中的文本给的是
 * text/plain —— 只认 `Files` 才不会被这两类带偏。
 * @param {DragEvent} event
 * @returns {boolean}
 */
function hasFiles(event) {
  const types = event.dataTransfer?.types
  if (!types) return false
  for (const type of types) {
    if (type === 'Files') return true
  }
  return false
}

/**
 * 指针底下那一点算落进哪个目录（判据见文件头）。用命中测试现算，不看焦点 ——
 * 拖拽期间焦点在哪儿与指针在哪儿无关。
 *
 * 穿透走 `contentElementAt`：树右缘那一条被覆盖式滚动条滑块 / 分隔条热区盖着，
 * 用裸的 `elementFromPoint` 会拿不到行，落点会从「指针压着的那个目录」掉成根目录
 * （与 `useTreeDrag.resolveTarget` 同一处坑）。
 * @param {number} clientX
 * @param {number} clientY
 * @returns {{ path: string, rowId: string|null, inExplorer: boolean }}
 */
function resolveDropTarget(clientX, clientY) {
  const el = contentElementAt(clientX, clientY)
  const row = el instanceof Element ? el.closest('[data-tree-id]') : null
  if (row) {
    const node = getNodeById(row.dataset.treeId)
    if (node) {
      // 压着目录行 = 落进这个目录；压着文件行 = 落进它所在的目录
      const path = node.type === 'directory' ? node.path : dirname(node.path)
      // 顶层节点（path 为 '/'）不给 rowId：它的 parentId 是字面量 'root'，而索引里那份根是
      // stat('/') 的浅拷贝、没有 children —— 认它当高亮对象只会点亮一个不存在的行
      // （同一个坑见 HANDOFF 坑 41）。没有 rowId 时由 inExplorer 去点亮整棵树的底色。
      const dir = node.type === 'directory' ? node : getNodeById(node.parentId)
      return { path, rowId: path === '/' ? null : (dir?.id ?? null), inExplorer: true }
    }
  }
  const inExplorer = el instanceof Element && el.closest('[data-panel="explorer"]') !== null
  return { path: '/', rowId: null, inExplorer }
}

/**
 * 挂上窗口级的拖放监听。**全应用只调一次**（App.vue）。
 *
 * @param {object} options
 * @param {(path: string, items: import('../services/fileTransfer.js').ImportItem[]) => void|Promise<void>}
 *   [options.onFiles] 松手时的落地：`path` 是目标目录，`items` 已经摊平好（含目录里的文件）
 * @returns {{ active: import('vue').ComputedRef<boolean> }}
 *   `active` = 有没有外部文件正拖在页面上（App.vue 用它临时撑开侧栏，见 previewDropTargetLayout）
 *
 * ⚠️ 回调刻意**不叫** `onDrop`：那是浏览器 drop 事件处理函数的自然名字，同名会被本函数内的
 * 声明遮蔽掉，于是「松手」那一发落到自己身上（拿事件对象当 path 传进去），静默什么都不做
 * —— 这个坑当场踩过（探针里 drop 后树毫无变化、也没有任何提示）。
 */
export function usePageDrop({ onFiles } = {}) {
  /**
   * 进出窗口的层数。dragenter / dragleave 对**每个子元素**都会各发一次，只看「有没有
   * dragleave」是不准的：从行挪到空白处也会发一发。数层数才是「还在不在窗口里」。
   */
  let depth = 0

  /** 拖拽期间最后一次指针位置。给「布局变了要重算一次落点」用，见 `reflowTarget`。 */
  let lastPos = null

  /**
   * 悬停在折叠目录上自动展开的时钟（与站内挪文件共用一份实现，见 springOpen.js）。
   * 到点张开之后补算一次落点：新长出来的行可能已经顶到指针底下了。
   */
  const springOpen = createSpringOpen({ onOpen: () => requestAnimationFrame(reflowTarget) })

  function reset() {
    depth = 0
    lastPos = null
    springOpen.cancel()
    pageDropTarget.value = null
    window.removeEventListener('keydown', onKeyDown, true)
  }

  /**
   * 按一个位置定落点。`dragover` 与 `reflowTarget` 共用这一条。
   *
   * `moved` 是给自动展开用的：`dragover` 在指针**没动**的时候也会隔一会儿来一发，若每发都
   * 重新挂计时器，那个 600ms 永远走不完（实测拖进来之后停在折叠目录上，怎么等都不张开）。
   * @param {number} clientX
   * @param {number} clientY
   */
  function settle(clientX, clientY) {
    const moved = !lastPos || lastPos.x !== clientX || lastPos.y !== clientY
    lastPos = { x: clientX, y: clientY }
    const next = resolveDropTarget(clientX, clientY)
    pageDropTarget.value = next
    if (moved) springOpen.hover(next.rowId)
  }

  function update(event) {
    settle(event.clientX, event.clientY)
  }

  /**
   * 按**最后一次指针位置**重算一次落点。
   *
   * 为什么需要：拖进来的头一发 `dragenter` 算落点时，App.vue 那边「撑开侧栏、切到资源管理器」
   * 还没落到 DOM 上（那是响应式更新，晚一个微任务），于是元素命中测试量到的是撑开前的布局
   * —— 指针底下还没有树，落点会算成根目录、高亮也不亮。等布局落定后补这一发就对了。
   * 后续的 `dragover` 本来就会持续重算，这里只为把**第一帧**补齐（以及指针停着不动时的那一段，
   * 比如目录刚自动展开、行换了人）。
   */
  function reflowTarget() {
    if (!lastPos || depth <= 0) return
    settle(lastPos.x, lastPos.y)
  }

  /** @param {DragEvent} event */
  function onDragEnter(event) {
    if (!hasFiles(event)) return
    event.preventDefault()
    depth += 1
    update(event)
    window.addEventListener('keydown', onKeyDown, true)
    // 布局要等这一帧之后才变（见 reflowTarget）—— 下一帧按同一位置重算一次
    requestAnimationFrame(reflowTarget)
  }

  /** @param {DragEvent} event */
  function onDragOver(event) {
    if (!hasFiles(event)) return
    // 这句必须拦：dragover 不 preventDefault，浏览器就不认这里是落点，drop 永远不来
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    // 自愈：各家浏览器对子元素发不发 dragenter 并不一致，漏一发层数就永远是负的 ——
    // dragover 是拖拽期间持续在发的，用它把层数补回来
    if (depth <= 0) depth = 1
    update(event)
  }

  function onDragLeave() {
    // 这一发**不判** hasFiles：极少数浏览器在 dragleave 上给不出 types，判了就会漏掉减法、
    // 让层数一直为正、提示层卡在屏幕上。非文件拖拽的 dragleave 把层数减到 0 也只是空收一次
    // （状态本来就没被它们置起来过）
    depth -= 1
    if (depth > 0) return
    reset()
  }

  /**
   * 松手。
   *
   * ⚠️ 这个函数**不能**叫 `onDrop`（浏览器 drop 处理函数的自然名字）—— 调用方给的落地回调
   * 就叫过这个名字，同一作用域内的函数声明会把它遮蔽掉，「松手」那一发就落到自己身上了。
   * @param {DragEvent} event
   */
  function handleDrop(event) {
    if (!hasFiles(event)) return
    // 两个都拦：不 preventDefault 的话浏览器会把文件当成导航目标、整页跳去打开那个文件；
    // 不 stopPropagation 的话底下的 Monaco 之类还会再按自己的规矩处理一遍
    event.preventDefault()
    event.stopPropagation()
    // 落点取最近一次 dragover 算好的那份（drop 自带的位置与它只差最后一帧）
    const target = pageDropTarget.value ?? { path: '/', rowId: null, inExplorer: false }
    // ⚠️ 这一句必须在这个派发里同步发出：DataTransfer 出了事件就失效，见文件头
    const pending = readDroppedItems(event.dataTransfer)
    reset()
    void (async () => {
      const items = await pending
      // 空表也照样交给调用方：它才知道该弹哪一句「没有可导入的文件」
      await onFiles?.(target.path, items)
    })()
  }

  /** 拖拽中途按 Esc = 取消。浏览器多半也会补一发 dragleave，但别指望它 */
  function onKeyDown(event) {
    if (event.key === 'Escape') reset()
  }

  /** 窗口失焦（切标签页、系统弹窗…）时拖着的东西早就不在了，把提示层收掉 */
  function onBlur() {
    reset()
  }

  /** 拖拽结束（内部 HTML5 拖拽也会发）：兜底收一次，避免提示层卡在屏幕上 */
  function onDragEnd() {
    if (pageDropTarget.value) reset()
  }

  onMounted(() => {
    // 捕获阶段：dragover / drop 要抢在页面里任何元素之前拿到（见 onDrop 的注释）
    window.addEventListener('dragenter', onDragEnter, true)
    window.addEventListener('dragover', onDragOver, true)
    window.addEventListener('dragleave', onDragLeave, true)
    window.addEventListener('drop', handleDrop, true)
    window.addEventListener('dragend', onDragEnd, true)
    window.addEventListener('blur', onBlur)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('dragenter', onDragEnter, true)
    window.removeEventListener('dragover', onDragOver, true)
    window.removeEventListener('dragleave', onDragLeave, true)
    window.removeEventListener('drop', handleDrop, true)
    window.removeEventListener('dragend', onDragEnd, true)
    window.removeEventListener('blur', onBlur)
    reset()
  })

  return { active: computed(() => pageDropTarget.value !== null) }
}
