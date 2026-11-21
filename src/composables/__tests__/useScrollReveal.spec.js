// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { computeScrollTarget, useScrollReveal } from '../useScrollReveal.js'

/**
 * 创建可联动更新几何位置的滚动容器夹具：
 * 调用 container.scrollTo 会真实更新 scrollLeft/scrollTop，
 * 从而让子元素 getBoundingClientRect() 随之变化。
 */
function createScrollFixture(spec) {
  const container = document.createElement('div')
  document.body.appendChild(container)

  const state = {
    boxLeft: spec.boxLeft ?? 0,
    boxTop: spec.boxTop ?? 0,
    clientLeft: spec.clientLeft ?? 0,
    clientTop: spec.clientTop ?? 0,
    clientWidth: spec.clientWidth,
    clientHeight: spec.clientHeight,
    scrollWidth: spec.scrollWidth,
    scrollHeight: spec.scrollHeight,
    scrollLeft: spec.scrollLeft ?? 0,
    scrollTop: spec.scrollTop ?? 0,
    scrollbarWidth: spec.scrollbarWidth ?? 0,
    scrollbarHeight: spec.scrollbarHeight ?? 0,
  }

  Object.defineProperties(container, {
    clientLeft: { get: () => state.clientLeft, configurable: true },
    clientTop: { get: () => state.clientTop, configurable: true },
    clientWidth: { get: () => state.clientWidth, configurable: true },
    clientHeight: { get: () => state.clientHeight, configurable: true },
    scrollWidth: { get: () => state.scrollWidth, configurable: true },
    scrollHeight: { get: () => state.scrollHeight, configurable: true },
    scrollLeft: {
      get: () => state.scrollLeft,
      set: (v) => {
        const max = Math.max(0, state.scrollWidth - state.clientWidth)
        state.scrollLeft = Math.min(Math.max(v, 0), max)
      },
      configurable: true,
    },
    scrollTop: {
      get: () => state.scrollTop,
      set: (v) => {
        const max = Math.max(0, state.scrollHeight - state.clientHeight)
        state.scrollTop = Math.min(Math.max(v, 0), max)
      },
      configurable: true,
    },
  })

  if (spec.supportsScrollEnd) {
    Object.defineProperty(container, 'onscrollend', {
      value: null,
      writable: true,
      configurable: true,
    })
  }

  container.getBoundingClientRect = () => {
    const width = state.clientWidth + state.clientLeft * 2 + state.scrollbarWidth
    const height = state.clientHeight + state.clientTop * 2 + state.scrollbarHeight
    return DOMRect.fromRect({ x: state.boxLeft, y: state.boxTop, width, height })
  }

  const scrollToSpy = vi.fn((arg1, arg2) => {
    const opts = typeof arg1 === 'number' ? { left: arg1, top: arg2 } : (arg1 ?? {})
    if (typeof opts.left === 'number') container.scrollLeft = opts.left
    if (typeof opts.top === 'number') container.scrollTop = opts.top
  })
  container.scrollTo = scrollToSpy

  function addItem(itemSpec) {
    const el = document.createElement('button')
    const itemState = { ...itemSpec }
    container.appendChild(el)

    el.getBoundingClientRect = () => {
      const left = state.boxLeft + state.clientLeft + itemState.contentLeft - state.scrollLeft
      const top = state.boxTop + state.clientTop + itemState.contentTop - state.scrollTop
      return DOMRect.fromRect({ x: left, y: top, width: itemState.width, height: itemState.height })
    }

    return { el, itemState }
  }

  return { container, state, scrollToSpy, addItem }
}

function mockReducedMotion(matches) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

async function flushSchedule() {
  await nextTick()
  await vi.advanceTimersByTimeAsync(20)
}

describe('computeScrollTarget', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('元素已完全在可视区内时返回 null', () => {
    const { container, addItem } = createScrollFixture({
      clientWidth: 300,
      clientHeight: 40,
      scrollWidth: 1000,
      scrollHeight: 40,
    })
    const { el } = addItem({ contentLeft: 50, contentTop: 0, width: 80, height: 32 })

    expect(computeScrollTarget(container, el)).toBeNull()
  })

  it('扣除 border 与经典滚动条宽度，并按 inset 留白做最小位移', () => {
    const { container, addItem } = createScrollFixture({
      boxLeft: 10,
      clientLeft: 2,
      clientWidth: 200,
      clientHeight: 40,
      scrollbarWidth: 15,
      scrollWidth: 800,
      scrollHeight: 40,
    })
    // 右边缘在 contentX = 250，超出了 200px 的可视宽；加 20px inset 应滚到 250 - (200 - 20) = 70
    const { el } = addItem({ contentLeft: 190, contentTop: 0, width: 60, height: 32 })

    expect(computeScrollTarget(container, el, { inset: 20, axis: 'x' })).toEqual({
      left: 70,
      top: 0,
    })
  })

  it('容器较窄时自动钳制 inset，避免左右安全区互相打架', () => {
    const { container, addItem } = createScrollFixture({
      clientWidth: 100,
      clientHeight: 40,
      scrollWidth: 500,
      scrollHeight: 40,
    })
    // 元素宽 80，剩余空间 20，单侧最大安全留白应被钳制在 10，而不是 40
    const { el } = addItem({ contentLeft: 90, contentTop: 0, width: 80, height: 32 })

    expect(computeScrollTarget(container, el, { inset: 40, axis: 'x' })).toEqual({
      left: 80,
      top: 0,
    })
  })

  it('超宽元素只对齐起始边，落位后再次复核返回 null 不会来回抖动', () => {
    const { container, addItem } = createScrollFixture({
      clientWidth: 150,
      clientHeight: 40,
      scrollWidth: 800,
      scrollHeight: 40,
    })
    const { el } = addItem({ contentLeft: 100, contentTop: 0, width: 260, height: 32 })

    const firstTarget = computeScrollTarget(container, el, { inset: 16, axis: 'x' })
    expect(firstTarget).toEqual({ left: 100, top: 0 })

    container.scrollTo(firstTarget)
    // 虽然右边缘仍溢出视口，但左边缘已对齐，二次复核必须返回 null
    expect(computeScrollTarget(container, el, { inset: 16, axis: 'x' })).toBeNull()
  })

  it('axis 限制为 x 时忽略纵向溢出', () => {
    const { container, addItem } = createScrollFixture({
      clientWidth: 200,
      clientHeight: 40,
      scrollWidth: 600,
      scrollHeight: 400,
    })
    const { el } = addItem({ contentLeft: 20, contentTop: 200, width: 60, height: 32 })

    expect(computeScrollTarget(container, el, { axis: 'x' })).toBeNull()
    expect(computeScrollTarget(container, el, { axis: 'y' })).toEqual({ left: 0, top: 192 })
  })

  it('元素脱离文档或容器宽高为 0 时返回 null', () => {
    const { container, state, addItem } = createScrollFixture({
      clientWidth: 0,
      clientHeight: 40,
      scrollWidth: 400,
      scrollHeight: 40,
    })
    const { el } = addItem({ contentLeft: 200, contentTop: 0, width: 60, height: 32 })

    expect(computeScrollTarget(container, el)).toBeNull()

    state.clientWidth = 200
    el.remove()
    expect(computeScrollTarget(container, el)).toBeNull()
  })
})

describe('useScrollReveal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockReducedMotion(false)
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('超宽元素在平滑滚动结束触发 scrollend 后不会反向跳动', async () => {
    const { container, scrollToSpy, addItem } = createScrollFixture({
      clientWidth: 160,
      clientHeight: 40,
      scrollWidth: 900,
      scrollHeight: 40,
      supportsScrollEnd: true,
    })
    const { el } = addItem({ contentLeft: 120, contentTop: 0, width: 300, height: 32 })

    const scope = effectScope()
    const api = scope.run(() =>
      useScrollReveal({ container: () => container, target: () => el, axis: 'x' }),
    )

    api.schedule()
    await flushSchedule()

    expect(scrollToSpy).toHaveBeenCalledTimes(1)
    expect(scrollToSpy).toHaveBeenLastCalledWith({ left: 120, top: 0, behavior: 'smooth' })

    container.dispatchEvent(new Event('scrollend'))
    expect(scrollToSpy).toHaveBeenCalledTimes(1)

    scope.stop()
  })

  it('scrollend 触发时若发生布局漂移，自动以 instant 补一次落点', async () => {
    const { container, scrollToSpy, addItem } = createScrollFixture({
      clientWidth: 200,
      clientHeight: 40,
      scrollWidth: 900,
      scrollHeight: 40,
      supportsScrollEnd: true,
    })
    const { el, itemState } = addItem({ contentLeft: 300, contentTop: 0, width: 80, height: 32 })

    const scope = effectScope()
    const api = scope.run(() =>
      useScrollReveal({ container: () => container, target: () => el, axis: 'x' }),
    )

    api.schedule()
    await flushSchedule()
    expect(scrollToSpy).toHaveBeenLastCalledWith({ left: 180, top: 0, behavior: 'smooth' })

    // 模拟平滑滚动期间前面插入新标签，目标右移了 40px
    itemState.contentLeft = 340
    container.dispatchEvent(new Event('scrollend'))

    expect(scrollToSpy).toHaveBeenCalledTimes(2)
    expect(scrollToSpy).toHaveBeenLastCalledWith({ left: 220, top: 0, behavior: 'instant' })

    scope.stop()
  })

  it('用户滚轮介入时立刻取消复核，不与用户抢滚动条', async () => {
    const { container, scrollToSpy, addItem } = createScrollFixture({
      clientWidth: 200,
      clientHeight: 40,
      scrollWidth: 900,
      scrollHeight: 40,
      supportsScrollEnd: true,
    })
    const { el } = addItem({ contentLeft: 300, contentTop: 0, width: 80, height: 32 })

    const scope = effectScope()
    const api = scope.run(() =>
      useScrollReveal({ container: () => container, target: () => el, axis: 'x' }),
    )

    api.schedule()
    await flushSchedule()
    expect(scrollToSpy).toHaveBeenCalledTimes(1)

    // 滚动途中用户自己往回滚
    container.dispatchEvent(new Event('wheel'))
    container.scrollLeft = 0
    container.dispatchEvent(new Event('scrollend'))
    await vi.advanceTimersByTimeAsync(2000)

    // 不应该把滚动条拉回 180
    expect(scrollToSpy).toHaveBeenCalledTimes(1)
    expect(container.scrollLeft).toBe(0)

    scope.stop()
  })

  it('不支持 scrollend 的浏览器通过 scroll 防抖停稳后复核', async () => {
    // jsdom 26 已经在 HTMLElement.prototype 上挂了 onscrollend，这里临时摘掉，
    // 才能走到「老内核」的 scroll 停稳兜底分支
    const proto = window.HTMLElement.prototype
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'onscrollend')
    delete proto.onscrollend

    try {
      const { container, scrollToSpy, addItem } = createScrollFixture({
        clientWidth: 200,
        clientHeight: 40,
        scrollWidth: 900,
        scrollHeight: 40,
        supportsScrollEnd: false,
      })
      const { el, itemState } = addItem({ contentLeft: 300, contentTop: 0, width: 80, height: 32 })

      const scope = effectScope()
      const api = scope.run(() =>
        useScrollReveal({
          container: () => container,
          target: () => el,
          axis: 'x',
          scrollIdleMs: 140,
        }),
      )

      api.schedule()
      await flushSchedule()
      expect(scrollToSpy).toHaveBeenCalledTimes(1)

      // 模拟目标在滚动过程中漂移，并且持续有 scroll 事件进来延长停稳判定
      itemState.contentLeft = 360
      await vi.advanceTimersByTimeAsync(100)
      container.dispatchEvent(new Event('scroll'))
      await vi.advanceTimersByTimeAsync(100)
      expect(scrollToSpy).toHaveBeenCalledTimes(1)

      // 再过 50ms 超过 scrollIdleMs (140ms)，触发停稳复核
      await vi.advanceTimersByTimeAsync(50)
      expect(scrollToSpy).toHaveBeenCalledTimes(2)
      expect(scrollToSpy).toHaveBeenLastCalledWith({ left: 240, top: 0, behavior: 'instant' })

      scope.stop()
    } finally {
      if (descriptor) Object.defineProperty(proto, 'onscrollend', descriptor)
    }
  })

  it('短时间内连续高频切换自动降级为 instant；prefers-reduced-motion 也走 instant', async () => {
    const { container, scrollToSpy, addItem } = createScrollFixture({
      clientWidth: 200,
      clientHeight: 40,
      scrollWidth: 1200,
      scrollHeight: 40,
    })
    const itemA = addItem({ contentLeft: 300, contentTop: 0, width: 60, height: 32 })
    const itemB = addItem({ contentLeft: 600, contentTop: 0, width: 60, height: 32 })

    const scope = effectScope()
    const api = scope.run(() => useScrollReveal({ container: () => container, rapidSwitchMs: 120 }))

    api.revealNow({ target: itemA.el })
    expect(scrollToSpy).toHaveBeenLastCalledWith({ left: 160, top: 0, behavior: 'smooth' })

    // 50ms 内再次切换，命中 rapidSwitchMs -> instant
    await vi.advanceTimersByTimeAsync(50)
    api.revealNow({ target: itemB.el })
    expect(scrollToSpy).toHaveBeenLastCalledWith({ left: 460, top: 0, behavior: 'instant' })

    // 隔足够久并开启 reduced-motion -> 依然 instant
    await vi.advanceTimersByTimeAsync(500)
    mockReducedMotion(true)
    api.revealNow({ target: itemA.el })
    expect(scrollToSpy).toHaveBeenLastCalledWith({ left: 300, top: 0, behavior: 'instant' })

    scope.stop()
  })

  it('支持多容器并发调度，且单独 cancel(A) 不影响容器 B', async () => {
    const rail = createScrollFixture({
      clientWidth: 200,
      clientHeight: 40,
      scrollWidth: 900,
      scrollHeight: 40,
    })
    const sidebar = createScrollFixture({
      clientWidth: 160,
      clientHeight: 200,
      scrollWidth: 160,
      scrollHeight: 900,
    })

    const tab = rail.addItem({ contentLeft: 350, contentTop: 0, width: 80, height: 32 })
    const row = sidebar.addItem({ contentLeft: 0, contentTop: 420, width: 140, height: 32 })

    const scope = effectScope()
    const api = scope.run(() => useScrollReveal())

    api.schedule({ container: rail.container, target: tab.el, axis: 'x', inset: 20 })
    api.schedule({ container: sidebar.container, target: row.el, axis: 'y', inset: 8 })

    // 先放行 nextTick 让两个 rAF 都挂上，然后只取消 rail
    await nextTick()
    api.cancel(rail.container)
    await vi.advanceTimersByTimeAsync(20)

    expect(rail.scrollToSpy).not.toHaveBeenCalled()
    expect(sidebar.scrollToSpy).toHaveBeenCalledTimes(1)
    expect(sidebar.scrollToSpy).toHaveBeenLastCalledWith({
      left: 0,
      top: 260, // 420 + 32 - (200 - 8)
      behavior: 'smooth',
    })

    scope.stop()
  })

  it('v-if 切换容器在 nextTick 挂载新 DOM 后仍能正确定位', async () => {
    const workbench = ref(false)
    const activeContainer = ref(null)
    const activeItem = ref(null)

    const scope = effectScope()
    const api = scope.run(() =>
      useScrollReveal({
        container: activeContainer,
        target: activeItem,
        axis: () => (workbench.value ? 'y' : 'x'),
      }),
    )

    // 模拟点击切换 workbench：此时新容器还没挂载（null）
    workbench.value = true
    api.schedule({ instant: true })

    // 在 nextTick 前（同 Vue 渲染周期内）新容器完成挂载
    const nextFixture = createScrollFixture({
      clientWidth: 180,
      clientHeight: 200,
      scrollWidth: 180,
      scrollHeight: 800,
    })
    const { el } = nextFixture.addItem({ contentLeft: 0, contentTop: 350, width: 160, height: 30 })
    activeContainer.value = nextFixture.container
    activeItem.value = el

    await flushSchedule()

    expect(nextFixture.scrollToSpy).toHaveBeenCalledTimes(1)
    expect(nextFixture.scrollToSpy).toHaveBeenLastCalledWith({
      left: 0,
      top: 180,
      behavior: 'instant',
    })

    scope.stop()
  })

  it('组件/effectScope 销毁时自动取消待执行 rAF 与全部事件监听', async () => {
    const { container, scrollToSpy, addItem } = createScrollFixture({
      clientWidth: 200,
      clientHeight: 40,
      scrollWidth: 900,
      scrollHeight: 40,
      supportsScrollEnd: true,
    })
    const { el, itemState } = addItem({ contentLeft: 300, contentTop: 0, width: 80, height: 32 })
    const removeSpy = vi.spyOn(container, 'removeEventListener')

    // 场景 1：rAF 尚未执行就销毁
    const scope1 = effectScope()
    const api1 = scope1.run(() =>
      useScrollReveal({ container: () => container, target: () => el }),
    )
    api1.schedule()
    await nextTick()
    scope1.stop()
    await vi.advanceTimersByTimeAsync(50)
    expect(scrollToSpy).not.toHaveBeenCalled()

    // 场景 2：已发出 smooth 滚动、正在等待 scrollend 时销毁
    const scope2 = effectScope()
    const api2 = scope2.run(() =>
      useScrollReveal({ container: () => container, target: () => el }),
    )
    api2.revealNow()
    expect(scrollToSpy).toHaveBeenCalledTimes(1)

    scope2.stop()
    expect(removeSpy).toHaveBeenCalledWith('scrollend', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('wheel', expect.any(Function))

    // 销毁后再发生漂移并派发 scrollend 或超时，均不得再操作 DOM
    itemState.contentLeft = 400
    container.dispatchEvent(new Event('scrollend'))
    await vi.advanceTimersByTimeAsync(2000)
    expect(scrollToSpy).toHaveBeenCalledTimes(1)
  })
})
