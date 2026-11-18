/**
 * useScrollEdge —— 「这块滚动区下面还有下文」这一个布尔值。
 *
 * 样例面板页脚上沿那条发丝线就靠它：**没滚到底才画**（判据与页头恰好相反，见下）。
 * 2026-11-19 之前这段逻辑写在 TestPanel 里，只服务 `.cases` 一个容器；分项视图里滚动所有者
 * 换成了 `.case-viewport`，同一个判据要是抄第二份，两边迟早会差一个像素余量。
 *
 * 判据三条，都是踩过的坑：
 *   ① **没滚到底才画**，不是「滚过顶也画」：页脚在底下，还有内容压在这条线后面才需要描出来；
 *      滚到最底 / 一屏装得下 / 空列表，都没有「下文」，线就不该出现（用户 2026-10-23 纠正）。
 *   ② −1 是亚像素余量：缩放后 scrollHeight 常带小数，差 0.5px 时「已到底」会被读成
 *      「还有下文」，那条线就永远擦不掉。
 *   ③ 别改成「恒定描边」：装得下时，那条线会把一块空白切成两截。
 *
 * 什么时候重算：
 *   - 滚动（scroll 事件）；
 *   - 容器自己的盒子变化（面板用 v-show 切页签，藏起来时 clientHeight 是 0、判据算不出东西，
 *     切回来那一刻盒子从 0 变高，ResizeObserver 会补发这次重算 —— 光靠 scroll 的话，
 *     进面板后只要不动滚轮，线就一直缺着）；
 *   - 容器换人（两种视图来回切，模板 ref 指向的节点被换掉）；
 *   - 内容高度变化（由调用方 watch 数据，或传 `contentRef` 让这里盯住内容盒）。
 *     ResizeObserver 盯滚动容器本身接不住这件事：它的盒子是 flex 定死的，内容长高不改它的尺寸。
 *
 * @param {import('vue').Ref<HTMLElement|null>} elRef      滚动容器
 * @param {import('vue').Ref<HTMLElement|null>} [contentRef] 内容盒（可选，盯它的高度变化）
 * @returns {{ moreBelow: import('vue').Ref<boolean>, sync: () => void }}
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

export function useScrollEdge(elRef, contentRef = null) {
  const moreBelow = ref(false)

  let el = null
  let ro = null
  let contentRo = null

  function sync() {
    if (!el) {
      moreBelow.value = false
      return
    }
    moreBelow.value = el.scrollTop + el.clientHeight < el.scrollHeight - 1
  }

  function unbind() {
    el?.removeEventListener('scroll', sync)
    ro?.disconnect()
    contentRo?.disconnect()
    ro = null
    contentRo = null
    el = null
    moreBelow.value = false
  }

  function bind(next) {
    el = next
    if (!el) return
    el.addEventListener('scroll', sync, { passive: true })
    ro = new ResizeObserver(sync)
    ro.observe(el)
    if (contentRef?.value) {
      contentRo = new ResizeObserver(sync)
      contentRo.observe(contentRef.value)
    }
    sync()
  }

  // flush: 'post'：等 DOM patch 完、新节点已经在文档里再量，否则拿到的是 null 或旧盒子。
  // 数组在 setup 期就定下来（不是每次求值现造），否则 watch 会把新数组当成新来源、每次渲染都重绑。
  const sources = contentRef ? [elRef, contentRef] : [elRef]
  watch(
    sources,
    () => {
      unbind()
      bind(elRef.value)
    },
    { flush: 'post' },
  )

  onMounted(() => bind(elRef.value))
  onBeforeUnmount(unbind)

  return { moreBelow, sync }
}
