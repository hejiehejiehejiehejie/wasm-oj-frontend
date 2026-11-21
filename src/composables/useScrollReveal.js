/**
 * useScrollReveal —— 通用「把目标滚进容器可见框」控制器（仅依赖 vue 3.3+）。
 *
 * 【为什么单独抽出来】评测样例的横向标签轨与工作台样例行列表是两条独立的滚动容器，
 * 切样例时要按当前布局挑一条、只补越界那一侧的距离（`nearest` 语义），平滑滚完还要
 * 复核一次四条边。把定时器 / 竞态 / 用户打断 / 生命周期清理都收在这里，组件层只描述
 * 「容器在哪、目标是谁」。
 *
 * 【状态隔离】每个容器的竞态序号与时间戳放在 WeakMap 里 —— 容器被 DOM 卸载后自动回收，
 * 不会因为一次平滑滚动没结束就拖着整棵元素树。需要统一取消的监听器 / 定时器放在 Map 里，
 * 由 `cancelAll`（组件或 effectScope 销毁时自动调用）批量清理，支持多容器并发。
 *
 * 【行为口径】
 *   · 已完整可见（含 inset 安全留白）→ 一个像素都不动；
 *   · 越界 → 只补溢出那一侧的距离，等价于 `block: 'nearest'` / `inline: 'nearest'`；
 *   · 平滑滚动结束后（scrollend，无此事件的内核用 scroll 停稳兜底）再量一次，
 *     布局漂移导致仍未进框时补一次瞬时落点；
 *   · 用户在滚动途中自己滚 / 触摸 / 按下时立刻放弃复核，不与用户抢滚动条；
 *   · 快速连切自动降级为瞬时落点，避免一串平滑动画排队。
 *
 * 【为什么不用 scrollIntoView】它会把它**所有**祖先的滚动都调整一遍 —— 包括
 * `overflow: hidden` 的评测岛与文档根。那些盒子只要有一丁点可滚动溢出（亚像素宽度、
 * 缩放不是 100%、系统保留滚动条槽位），整块面板就会被推 1px。这里只动指定容器自己。
 */
import { getCurrentScope, nextTick, onScopeDispose, toValue, unref } from 'vue'

function prefersReducedMotion() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function normalizeInset(inset) {
  if (typeof inset === 'number') {
    const value = Math.max(0, inset)
    return { x: value, y: value }
  }
  return {
    x: Math.max(0, inset?.x ?? 0),
    y: Math.max(0, inset?.y ?? 0),
  }
}

/** 目标既可以是元素 / ref，也可以是「从容器里解析」的函数（容器切换时尤其有用） */
function resolveTarget(source, container) {
  if (!source) return null
  const el = typeof source === 'function' ? source(container) : unref(source)
  return el ?? null
}

/**
 * 单次布局测量计算 nearest 目标位置；已处于安全可见区内时返回 null。
 *
 * 可独立使用（测试 / 自定义滚动逻辑），不产生任何副作用。
 *
 * @param {HTMLElement} container 滚动容器
 * @param {HTMLElement} el 目标元素
 * @param {{ inset?: number | { x?: number; y?: number }; axis?: 'both' | 'x' | 'y'; epsilon?: number }} [options]
 * @returns {{ left: number; top: number } | null}
 */
export function computeScrollTarget(container, el, options = {}) {
  if (!container.isConnected || !el.isConnected) return null
  if (container.clientWidth <= 0 || container.clientHeight <= 0) return null

  const box = container.getBoundingClientRect()
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null

  const epsilon = options.epsilon ?? 1
  const axis = options.axis ?? 'both'
  const { x: insetX, y: insetY } = normalizeInset(options.inset)

  // 扣除 border 与经典滚动条，取真实可视滚动视口
  const viewLeft = box.left + container.clientLeft
  const viewRight = viewLeft + container.clientWidth
  const viewTop = box.top + container.clientTop
  const viewBottom = viewTop + container.clientHeight

  let left = container.scrollLeft
  let top = container.scrollTop

  if (axis === 'both' || axis === 'x') {
    // 容器比目标还窄时安全留白互相打架，最多各让一半
    const padX = Math.min(insetX, Math.max(0, (container.clientWidth - rect.width) / 2))
    if (rect.width >= container.clientWidth) {
      // 目标比视口还宽：只对齐起始边，避免「左右都不满足」来回抖动
      if (Math.abs(rect.left - viewLeft) > epsilon) {
        left += rect.left - viewLeft
      }
    } else if (rect.left < viewLeft + padX - epsilon) {
      left += rect.left - (viewLeft + padX)
    } else if (rect.right > viewRight - padX + epsilon) {
      left += rect.right - (viewRight - padX)
    }

    const maxLeft = Math.max(0, container.scrollWidth - container.clientWidth)
    left = Math.min(Math.max(left, 0), maxLeft)
  }

  if (axis === 'both' || axis === 'y') {
    const padY = Math.min(insetY, Math.max(0, (container.clientHeight - rect.height) / 2))
    if (rect.height >= container.clientHeight) {
      if (Math.abs(rect.top - viewTop) > epsilon) {
        top += rect.top - viewTop
      }
    } else if (rect.top < viewTop + padY - epsilon) {
      top += rect.top - (viewTop + padY)
    } else if (rect.bottom > viewBottom - padY + epsilon) {
      top += rect.bottom - (viewBottom - padY)
    }

    const maxTop = Math.max(0, container.scrollHeight - container.clientHeight)
    top = Math.min(Math.max(top, 0), maxTop)
  }

  if (
    Math.abs(left - container.scrollLeft) < epsilon &&
    Math.abs(top - container.scrollTop) < epsilon
  ) {
    return null
  }
  return { left, top }
}

/**
 * @param {{
 *   container?: any
 *   target?: any
 *   inset?: any
 *   axis?: any
 *   epsilon?: number
 *   rapidSwitchMs?: number
 *   scrollIdleMs?: number
 *   scrollendFallbackMs?: number
 * }} [defaults]
 */
export function useScrollReveal(defaults = {}) {
  const epsilon = defaults.epsilon ?? 1
  const rapidSwitchMs = defaults.rapidSwitchMs ?? 120
  const scrollIdleMs = defaults.scrollIdleMs ?? 140
  const scrollendFallbackMs = defaults.scrollendFallbackMs ?? 1500

  // 每容器竞态：DOM 卸载后自动回收，不泄漏内存
  const latestSeq = new WeakMap()
  const latestToken = new WeakMap()
  const lastRevealAt = new WeakMap()

  // 仅保存当前存在待执行 rAF 或事件监听器的容器，方便 cancelAll 批量清理
  const activeTasks = new Map()

  let seqCounter = 0
  let tokenCounter = 0
  let generation = 0

  function getOrCreateTask(container) {
    let task = activeTasks.get(container)
    if (!task) {
      task = { rafId: 0, cleanupSettle: null }
      activeTasks.set(container, task)
    }
    return task
  }

  function pruneTask(container) {
    const task = activeTasks.get(container)
    if (task && task.rafId === 0 && task.cleanupSettle === null) {
      activeTasks.delete(container)
    }
  }

  function clearRaf(container) {
    const task = activeTasks.get(container)
    if (!task || task.rafId === 0) return
    window.cancelAnimationFrame(task.rafId)
    task.rafId = 0
    pruneTask(container)
  }

  function clearSettle(container) {
    const task = activeTasks.get(container)
    if (!task || !task.cleanupSettle) return
    const fn = task.cleanupSettle
    task.cleanupSettle = null
    fn()
    pruneTask(container)
  }

  /** 取消单个容器上待执行的调度和滚动后复核 */
  function cancel(container) {
    if (!container) return
    latestSeq.set(container, ++seqCounter)
    latestToken.set(container, ++tokenCounter)
    clearRaf(container)
    clearSettle(container)
  }

  /** 取消所有容器上的调度与监听器（组件卸载时自动调用） */
  function cancelAll() {
    generation += 1
    for (const container of Array.from(activeTasks.keys())) {
      clearRaf(container)
      clearSettle(container)
    }
    activeTasks.clear()
  }

  function performReveal(container, el, opts) {
    const target = computeScrollTarget(container, el, {
      inset: opts.inset,
      axis: opts.axis,
      epsilon,
    })
    if (!target) return

    clearSettle(container)
    const gen = generation
    const token = ++tokenCounter
    latestToken.set(container, token)

    const now = performance.now()
    const prevAt = lastRevealAt.get(container)
    // 首次调用时 prevAt 是 undefined —— 不能拿 0 兜底，否则性能计时刚启动
    // （now 很小）会被误判成「快速连切」而丢掉平滑动画
    const isRapid = prevAt !== undefined && now - prevAt < rapidSwitchMs
    const useInstant = opts.instant || prefersReducedMotion() || isRapid
    lastRevealAt.set(container, now)

    container.scrollTo({
      ...target,
      behavior: useInstant ? 'instant' : 'smooth',
    })

    if (useInstant) return

    let timer = 0
    const task = getOrCreateTask(container)

    const teardown = () => {
      container.removeEventListener('scrollend', onScrollEnd)
      container.removeEventListener('scroll', onFallbackScroll)
      container.removeEventListener('wheel', onUserInteract)
      container.removeEventListener('touchstart', onUserInteract)
      container.removeEventListener('pointerdown', onUserInteract)
      window.clearTimeout(timer)
      timer = 0
    }

    // 用户自己滚 / 触摸 / 按下：立刻放弃这次复核，绝不把滚动条抢回来
    const onUserInteract = () => {
      latestToken.set(container, ++tokenCounter)
      clearSettle(container)
    }

    const onScrollEnd = () => {
      if (gen !== generation || latestToken.get(container) !== token) return
      clearSettle(container)
      // 动画期间可能插入了新标签 / 布局漂移：再量一次，仍未进框就瞬时补位
      const drift = computeScrollTarget(container, el, {
        inset: opts.inset,
        axis: opts.axis,
        epsilon,
      })
      if (drift) container.scrollTo({ ...drift, behavior: 'instant' })
    }

    const onFallbackScroll = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(onScrollEnd, scrollIdleMs)
    }

    container.addEventListener('wheel', onUserInteract, { passive: true, once: true })
    container.addEventListener('touchstart', onUserInteract, { passive: true, once: true })
    container.addEventListener('pointerdown', onUserInteract, { passive: true, once: true })

    if ('onscrollend' in container) {
      container.addEventListener('scrollend', onScrollEnd, { once: true })
      timer = window.setTimeout(onScrollEnd, scrollendFallbackMs)
    } else {
      // 老内核没有 scrollend：监听 scroll，停稳 scrollIdleMs 后再复核
      container.addEventListener('scroll', onFallbackScroll, { passive: true })
      timer = window.setTimeout(onScrollEnd, scrollIdleMs + 60)
    }

    task.cleanupSettle = teardown
  }

  /**
   * 立即执行一次定位（不等待 nextTick / rAF），适合已经在 rAF 或布局稳定后调用。
   */
  function revealNow(callOptions = {}) {
    if (typeof window === 'undefined') return
    const container = toValue(callOptions.container ?? defaults.container)
    if (!container) return

    // 覆盖该容器此前尚未执行的 schedule
    latestSeq.set(container, ++seqCounter)
    clearRaf(container)

    const el = resolveTarget(callOptions.target ?? defaults.target, container)
    if (!el) return

    performReveal(container, el, {
      instant: callOptions.instant ?? false,
      inset: toValue(callOptions.inset ?? defaults.inset) ?? 0,
      axis: toValue(callOptions.axis ?? defaults.axis) ?? 'both',
    })
  }

  /**
   * 在 nextTick + rAF 后定位，自动适配 v-if 切换挂载和同帧高频状态变更。
   */
  function schedule(callOptions = {}) {
    if (typeof window === 'undefined') return
    const containerSource = callOptions.container ?? defaults.container
    const targetSource = callOptions.target ?? defaults.target
    const insetSource = callOptions.inset ?? defaults.inset
    const axisSource = callOptions.axis ?? defaults.axis
    const instant = callOptions.instant ?? false

    const gen = generation
    const callSeq = ++seqCounter
    const syncContainer = toValue(containerSource)

    if (syncContainer) {
      latestSeq.set(syncContainer, callSeq)
      clearRaf(syncContainer)
    }

    nextTick(() => {
      if (gen !== generation) return
      const container = toValue(containerSource)
      if (!container) return

      // 既兼容同容器高频覆盖，也兼容 v-if 刚挂载的新容器
      if (syncContainer === container) {
        if (latestSeq.get(container) !== callSeq) return
      } else {
        if ((latestSeq.get(container) ?? 0) > callSeq) return
        latestSeq.set(container, callSeq)
      }

      clearRaf(container)
      const task = getOrCreateTask(container)
      task.rafId = window.requestAnimationFrame(() => {
        task.rafId = 0
        pruneTask(container)

        if (gen !== generation || latestSeq.get(container) !== callSeq) return
        const el = resolveTarget(targetSource, container)
        if (!el) return

        performReveal(container, el, {
          instant,
          inset: toValue(insetSource) ?? 0,
          axis: toValue(axisSource) ?? 'both',
        })
      })
    })
  }

  // 自动绑定当前组件或 effectScope 的生命周期清理
  if (getCurrentScope()) {
    onScopeDispose(cancelAll)
  }

  return { schedule, revealNow, cancel, cancelAll }
}
