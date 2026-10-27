/**
 * 「我的 Codeforces handle」—— 抽题页与比赛面板共用的一份偏好。
 *
 * 【为什么是模块级 ref】同一个值现在有三个消费方：抽题的「排除已通过的题」、
 * 排行榜的「跳到我」、提交记录的「只看我」。每个组件各持一个 usePersistentRef
 * 会读到三份互不同步的副本（那个 ref 只在挂载时读一次盘），改了一处另外两处不知道。
 * 与 services/cfRuntime.js 的 cfReady 同一套路数：模块级单例，谁都能 import。
 *
 * 落盘键沿用抽题那边既有的 `cp.cf.handle`（值是 JSON 字符串），老用户的填法不丢。
 * 允许逗号 / 分号 / 空格分隔多个账号 —— 排行榜一次只能高亮一个位置，取第一个；
 * 提交记录的「只看我」用整组做本地过滤。
 */
import { ref, watch } from 'vue'

import { normalizeHandles } from './pick.js'

export const MY_HANDLE_KEY = 'cp.cf.handle'

function read() {
  try {
    const raw = window.localStorage.getItem(MY_HANDLE_KEY)
    if (raw === null) return ''
    const value = JSON.parse(raw)
    return typeof value === 'string' ? value : ''
  } catch {
    return ''
  }
}

/** @type {import('vue').Ref<string>} */
export const cfHandle = ref(read())

watch(
  cfHandle,
  (value) => {
    try {
      window.localStorage.setItem(MY_HANDLE_KEY, JSON.stringify(String(value ?? '')))
    } catch {
      /* 存储不可用：这一趟只在内存里生效 */
    }
  },
  { deep: true },
)

/** 当前填的账号列表（去重、去空、保持原写法） */
export function myHandles() {
  return normalizeHandles(cfHandle.value)
}
