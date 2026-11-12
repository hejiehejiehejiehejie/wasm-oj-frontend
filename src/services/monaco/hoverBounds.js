/**
 * 把悬停气泡关在编辑区里（2026-11-12 加；取代同日早些时候那版「把整栏 z-index 抬高一层」的权宜做法
 * —— 那一版只是让越界的那半截不被邻栏涂掉，气泡照样压到侧栏上，用户要的是**根本不越界**）。
 *
 * 【问题】Monaco 的悬停气泡是溢出型 content widget（`allowEditorOverflow`）。站里开着
 * `fixedOverflowWidgets: true`（见 EditorPane.vue），于是它 `position: fixed` 挂在窗口坐标系里，
 * 定位算法（contentWidgets.js 的 `_layoutHorizontalSegmentInPage`）只保证不越出**窗口**，
 * 不保证不越出**编辑区**；宽度上限更松 —— `_updateMaxDimensions` 取
 * `max(编辑区宽 × 0.66, 750, 上一次的宽度)`，编辑区窄于 750px 时气泡照样按 750 排，
 * 于是必然有一截伸到侧栏上（表现为文字停在栏位边界上，像被截断）。
 *
 * 【做法】不去动 contentWidgets 的公共定位逻辑（改了会波及补全、查找、参数提示等所有溢出浮层），
 * 只在悬停这一个 widget 上收两道口子：
 *   1. 尺寸上限：`_updateMaxDimensions` / `_findMaximumRenderingWidth` 的结果夹进编辑区。
 *      宽度只是**上限**，内容按这个宽度换行（悬停本来就是 `white-space: normal`），不是裁字。
 *   2. 落点：`afterRender` 里把气泡的视口矩形夹进编辑区矩形，差出来的位移用 `transform` 补上。
 *      Monaco 每次定位都是「先写 left/top，再回调 afterRender」，所以这里改完不会被同一次渲染盖掉。
 *
 * 【为什么挂在原型上】这一版 Monaco 已经删掉了 `hover.maxWidth` 配置项，尺寸只能从内部方法上收；
 * 而全站只建一个编辑器实例，挂原型和挂实例是一回事，原型还顺带覆盖后续新建的编辑器。
 * ⚠️ 升级 Monaco 后要复核 `contentHoverWidget.js` 里这两个方法还在不在（升级复核的通用要求在
 * editorBundle.js 文件头）；它们改名 / 移除时本模块会**静默失效** —— 症状正是「气泡又开始伸出去」。
 * `afterRender` 是 content widget 的公开钩子（`Widget` 里按「有没有这个函数」决定调不调），
 * 所以那条不走私有 API，只是拿它当「定位完成」的信号。
 */
import { Dimension } from 'monaco-esm/base/browser/dom.js'
import { ContentHoverWidget } from 'monaco-esm/editor/contrib/hover/browser/contentHoverWidget.js'

/** 气泡与编辑区边缘之间留的余量（px）。贴边太紧，圆角处看着像被裁掉 */
const GAP = 6

/** 宽度下限：Monaco 自己的 minWidth 是 150，比它再窄就没法读签名了 */
const MIN_WIDTH = 150

const proto = ContentHoverWidget.prototype

/** 编辑区的视口矩形。拿不到（实例已销毁 / 还没挂 DOM）时返回 null */
function editorBox(widget) {
  const node = widget._editor?.getDomNode?.()
  return node instanceof Element ? node.getBoundingClientRect() : null
}

/** 气泡允许的最大宽度：编辑区宽减去两侧余量 */
function maxWidth(widget) {
  const box = editorBox(widget)
  if (box === null || box.width === 0) return Infinity
  return Math.max(MIN_WIDTH, Math.floor(box.width - GAP * 2))
}

/** 气泡允许的最大高度：编辑区高减去上下余量（太矮的话允许它顶满） */
function maxHeight(widget) {
  const box = editorBox(widget)
  if (box === null || box.height === 0) return Infinity
  return Math.max(80, Math.floor(box.height - GAP * 2))
}

const originalUpdateMaxDimensions = proto._updateMaxDimensions
const originalFindMaximumRenderingWidth = proto._findMaximumRenderingWidth

if (typeof originalUpdateMaxDimensions === 'function') {
  proto._updateMaxDimensions = function () {
    originalUpdateMaxDimensions.call(this)
    const width = maxWidth(this)
    const height = maxHeight(this)
    const maxSize = this._resizableNode?.maxSize
    if (maxSize === undefined || maxSize === null) return
    if (maxSize.width <= width && maxSize.height <= height) return
    const next = new Dimension(Math.min(maxSize.width, width), Math.min(maxSize.height, height))
    this._resizableNode.maxSize = next
    // 只改 maxSize 不够：容器的 max-width 是同一处算出来的（内容按它换行），得一起重设
    this._setHoverWidgetMaxDimensions(next.width, next.height)
  }
}

if (typeof originalFindMaximumRenderingWidth === 'function') {
  proto._findMaximumRenderingWidth = function () {
    const width = originalFindMaximumRenderingWidth.call(this)
    if (typeof width !== 'number') return width
    // 原文在「文字溢出」时返回**窗口**宽，拖动气泡右下角那个把手能一路拉到屏幕边；夹进编辑区
    return Math.min(width, maxWidth(this))
  }
}

const originalAfterRender = proto.afterRender

/**
 * 定位完成后把气泡推回编辑区。
 *
 * 【为什么用 transform 而不是改 left/top】`left`/`top` 是 Monaco 用 FastDomNode 写的：
 * 它在内部缓存了上一次的值，值没变就**跳过写入**。我们若直接改 style.left，缓存就和 DOM 对不上，
 * 之后「同一个锚点坐标」的渲染会被它判成「没变」而不写 —— 气泡会停在上一处的夹取位置上。
 * transform 不参与它的缓存，量矩形（getBoundingClientRect 含 transform）时也不会影响布局。
 *
 * 每次渲染先清空 transform 再量：量到的永远是 Monaco 自己算的那个落点，位移不累积，
 * 换一处悬停时也不会带着上一次的偏移。
 */
proto.afterRender = function (...args) {
  originalAfterRender?.apply(this, args)
  const node = this._resizableNode?.domNode
  if (!this._renderedHover || node === undefined || node === null) return
  const box = editorBox(this)
  if (box === null) return
  node.style.transform = ''
  const rect = node.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return

  let dx = 0
  let dy = 0
  if (rect.left < box.left + GAP) dx = box.left + GAP - rect.left
  else if (rect.right > box.right - GAP) dx = box.right - GAP - rect.right
  if (rect.top < box.top + GAP) dy = box.top + GAP - rect.top
  else if (rect.bottom > box.bottom - GAP) dy = box.bottom - GAP - rect.bottom
  if (dx === 0 && dy === 0) return

  node.style.transform = `translate(${Math.round(dx)}px, ${Math.round(dy)}px)`
}
