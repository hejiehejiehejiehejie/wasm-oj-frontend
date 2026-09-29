/**
 * autoSave —— 「什么时候把 model 正文写回 VFS」。
 *
 * 保存本身是 modelManager.save / saveAll 的事（写 VFS 后清 dirty），这里只管时机：
 * - 编辑停顿：每敲一个字就重置计时器，停下来 DELAY 毫秒后落盘（debounce）；
 * - 离开时点：切页签、关页签（这条在 workspaceStore.closeTab 里）、窗口失焦、页面切后台，
 *   由各自的调用方喊 flush()。
 *
 * 不做定时轮询：没有新内容时写盘纯属浪费（saveAll 在没有 dirty 时自己就返回了）。
 * 不用 beforeunload：卸载时异步写 IndexedDB 大概率来不及，visibilitychange → hidden 才可靠。
 */
import { ref } from 'vue'
import { modelManager } from './monaco/modelManager.js'

/** 编辑停顿多久算「停下来了」。VS Code 的 afterDelay 默认 1s，这里取 800ms。 */
const DELAY = 800

/**
 * 自动保存是否开启。**做成响应式**：开启后 dirty 只存在几百毫秒，界面上的 dirty 圆点
 * 基本只是闪一下，所以 FileTreeItem / EditorTabs 据此把圆点藏掉（见它们各自的 v-if）。
 */
export const autoSaveEnabled = ref(false)

let timer = 0
let disposeEdit = null

/** 开关来自编辑器偏好 autoSave（App.vue 的 watch 负责同步过来） */
export function setAutoSaveEnabled(value) {
  autoSaveEnabled.value = !!value
  // 关闭时只丢掉挂起的计时器、**不写盘**：关掉就该回到「只认 Ctrl+S」的老行为
  if (!autoSaveEnabled.value) cancel()
}

/** @returns {boolean} */
export function isAutoSaveEnabled() {
  return autoSaveEnabled.value
}

function cancel() {
  if (!timer) return
  window.clearTimeout(timer)
  timer = 0
}

function schedule() {
  if (!autoSaveEnabled.value) return
  cancel()
  timer = window.setTimeout(() => {
    timer = 0
    void flush()
  }, DELAY)
}

/** 立刻把所有 dirty 文件写回 VFS（debounce 到点与各离开时点都走这里） */
export async function flush() {
  cancel()
  if (!autoSaveEnabled.value) return
  try {
    await modelManager.saveAll()
  } catch {
    /* 写盘失败（配额满 / IDB 不可用）不该把编辑流程带崩：正文还在 model 里，dirty 也还留着 */
  }
}

/**
 * 订阅「正文被改动」，返回退订函数。
 * 显式 init，不靠 import 副作用（与 useTreeDrag 的登记处同一套风格）。
 * @returns {() => void}
 */
export function initAutoSave() {
  disposeEdit?.()
  disposeEdit = modelManager.onDidEdit(schedule)
  return () => {
    cancel()
    disposeEdit?.()
    disposeEdit = null
  }
}