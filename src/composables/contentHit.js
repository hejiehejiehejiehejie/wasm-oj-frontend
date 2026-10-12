/**
 * 命中测试：取指针底下**真正属于内容**的那个元素。
 *
 * 【为什么要它】`document.elementFromPoint` 只回答「谁画在最上面」，而站点里有两件
 * 浮在内容之上的界面件 —— 它们不是任何面板的内容，却会替内容回话：
 *
 * - **`.oscroll-thumb`**（`composables/useOverlayScrollbar.js`）：覆盖式滚动条的滑块。
 *   它 fixed 在滚动容器右缘之内，可见时 `pointer-events: auto`（得能按住拖），
 *   于是指针压在树右缘那 6px 上时，命中测试拿到的是一条滑块、而不是底下的那一行。
 * - **`.splitter`**（`App.vue`）：两栏之间那条分隔条。它的热区是 12px，靠
 *   `margin: 0 -4px` 左右各压进两侧卡片 4px（线的视觉位置不动，纯为好抓），
 *   于是树的右缘那 4px 也被它盖住 —— 这一条与滚动条无关，本来就在。
 *
 * 两者叠在树的最右边一条（滑块 6px、热区压进来 4px）上，「指针下是哪一行」会整个失效。
 * 后果不是观感问题：`useTreeDrag.resolveTarget` 与 `usePageDrop.resolveDropTarget`
 * 都靠这一步认落点，拿不到行就退回「树空白处 = 根目录」——
 * 拖到某个文件夹上的文件会落到根目录，源文件本来就在根目录上时整条落点还会直接消失
 * （2026-10-13 实测：`folderDrop` 为 null / `rootDrop` 变 true）。App.vue 里
 * `regionUnderPointer`（⌘A 的区域判据）走的是同一步，指针停在树右缘时也会判成「不在资源管理器里」。
 *
 * 【怎么穿透】先问一次 `elementFromPoint`；只有命中的**确实是浮层**时才退回
 * `elementsFromPoint`（它给的是从最上层往下的一叠）逐个找下去。多花的那一次调用只发生在
 * 指针压着浮层的那一小片区域上。
 *
 * 【判据为什么用选择器而不是实例引用】这两件浮层一个由 JS 建出来挂到 `body` 上、一个是
 * 别的组件的兄弟节点，调用方都拿不到它们的引用；类名是唯一的共同语言。
 */

/** 压在内容之上、但不算内容的界面件 —— 命中测试一律穿透 */
const NON_CONTENT = '.oscroll-thumb, .splitter'

/**
 * 指针底下那个「内容元素」。被浮层盖住时返回浮层底下的第一个元素；底下什么都没有时返回 null。
 *
 * @param {number} x
 * @param {number} y
 * @returns {Element|null}
 */
export function contentElementAt(x, y) {
  const hit = document.elementFromPoint(x, y)
  if (!(hit instanceof Element) || !hit.closest(NON_CONTENT)) return hit
  const stack = document.elementsFromPoint?.(x, y)
  if (!stack) return null
  return stack.find((el) => !el.closest(NON_CONTENT)) ?? null
}
