/**
 * 反馈弹窗（FeedbackDialog）的开关。2026-11-23 加。
 *
 * 【为什么放在 service 而不是组件里】入口在组件菜单（ComponentsMenu）底部那一行，
 * 而弹窗本体挂在 App.vue：组件菜单点完就收、整棵卸载，弹窗不能跟着它一起消失。
 * 两边只共享这一个布尔值，没必要为它引事件总线。
 */
import { ref } from 'vue'

export const feedbackOpen = ref(false)

export function openFeedback() {
  feedbackOpen.value = true
}

export function closeFeedback() {
  feedbackOpen.value = false
}
