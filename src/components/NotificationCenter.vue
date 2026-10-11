<script setup>
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { t } from '../i18n/index.js'
import { dismissNotification, notifications } from '../services/notifications.js'

// 四类型各一枚图标（AppIcon 的名字）。error 用「圆圈 ×」而不是 alert（三角形）：
// 那枚是警告的字形，压着红字会被读成 warning。
const ICONS = { info: 'info', success: 'check', warning: 'alert', error: 'error' }

/**
 * 视觉顺序：常驻（expireAt = Infinity）排最上，剩余时间短的排最下 —— 按 expireAt
 * 降序算出每条的 CSS order。v-for 仍按**展示顺序**渲染：数组一旦重排，Vue 会挪动
 * DOM 节点，挪动会重启进场动画（原型 updateOrder 的注释专门交代过这一点）。
 * 所以这里只产出 id → order 的映射，卡片本身的插入位置不动。
 */
const orders = computed(() => {
  const sorted = [...notifications.value].sort((a, b) => b.expireAt - a.expireAt)
  const map = new Map()
  sorted.forEach((item, index) => map.set(item.id, index))
  return map
})

/**
 * 点操作按钮：先跑调用方的回调（拿到本条通知对象），再按普通流程退场 ——
 * 包括给队列腾位置。退场中的条目整颗忽略，避免回调打在正在淡出的通知上。
 */
function runAction(notif, action) {
  if (notif.leaving) return
  if (action.run) action.run(notif)
  dismissNotification(notif.id)
}
</script>

<template>
  <!-- 不再 Teleport 到 body：容器 absolute 锚在编辑区（.pane--editor，含块）右下角。
       不用视口右下角的原因：侧边栏可停靠右侧，浮在视口上的 toast 会盖住侧栏。
       栏内还有 overflow: hidden，slide-in 从栏的右缘滑进来正好被裁掉界外那半段。 -->
  <div v-if="notifications.length" class="notif-center" role="status" aria-live="polite">
      <div
        v-for="notif in notifications"
        :key="notif.id"
        class="notif"
        :class="[`is-${notif.type}`, { 'is-leaving': notif.leaving }]"
        :style="{ order: orders.get(notif.id) }"
      >
        <AppIcon :name="ICONS[notif.type] ?? 'info'" :size="15" class="notif__icon" />
        <div class="notif__content">
          <div class="notif__body">
            <p class="notif__title">{{ notif.title }}</p>
            <p v-if="notif.message" class="notif__message">{{ notif.message }}</p>
          </div>
          <!-- 操作按钮（可选，至多 2 颗，见服务层契约）：点击跑回调再退场 -->
          <div v-if="notif.actions.length" class="notif__actions">
            <button
              v-for="action in notif.actions"
              :key="action.id"
              class="notif__action"
              @click="runAction(notif, action)"
            >
              {{ action.label }}
            </button>
          </div>
        </div>
        <button
          class="notif__close"
          :aria-label="t('notifications.close')"
          @click="dismissNotification(notif.id)"
        >
          <AppIcon name="close" :size="13" />
        </button>
      </div>
  </div>
</template>

<style scoped>
/* 编辑区右下角（含块 = App 里的 .pane--editor，那边给了 position: relative）。
   容器本身 pointer-events: none，卡片各自接管 —— 否则整块 320px 的透明区域会
   挡住底下内容的点击。z-index 取 150：压过编辑栏内的浮层（Monaco 菜单等）；
   栏外的东西（body 级确认框、全局菜单）层叠序更高，会短暂盖住 toast ——
   toast 跟着编辑栏走是本组件的第一约束，盖不盖得过那些是第二位的。 */
.notif-center {
  position: absolute;
  right: 20px;
  bottom: 20px;
  z-index: 150;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 320px;
  max-width: calc(100% - 40px);
  pointer-events: none;
}

/* 2px 圆角 + 玻璃底：原型定的形态，与站内 10px 圆角的卡片语言刻意不同档 ——
   toast 是「贴出来的便签」，不是「一张卡」。进场动画挂在常驻规则上，
   由元素插入 DOM 自然触发一次；退场（is-leaving）时换成 notif-out。 */
.notif {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 2px;
  background: var(--toast-bg);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  box-shadow: var(--toast-shadow);
  animation: notif-in 300ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

/* 时长与服务层 notifications.js 的 EXIT_MS 必须一致，否则位置让早了/让晚了 */
.notif.is-leaving {
  animation: notif-out 200ms ease-out both;
}

@keyframes notif-in {
  from {
    transform: translateX(120%);
    opacity: 0;
  }
  to {
    transform: none;
    opacity: 1;
  }
}

@keyframes notif-out {
  from {
    transform: scale(1);
    opacity: 1;
  }
  to {
    transform: scale(0.95);
    opacity: 0;
  }
}

/* 悬停抬一档底色。收进 (hover:hover)：触屏上 :hover 会粘在最后点过的卡片上不散，
   那样一条通知会永久停在「悬停色」。 */
@media (hover: hover) {
  .notif:hover {
    background: var(--toast-bg-hover);
  }
}

/* 类型着色只落在图标上：正文保持中性色，四种类型混着排时才不会花 */
.notif__icon {
  flex: 0 0 auto;
  margin-top: 1px;
}

.notif.is-info .notif__icon {
  color: var(--info);
}

.notif.is-success .notif__icon {
  color: var(--ok);
}

.notif.is-warning .notif__icon {
  color: var(--warn);
}

.notif.is-error .notif__icon {
  color: var(--fail);
}

/* 正文 + 可选按钮行包成一列：按钮跟文字对齐在图标右侧，右上角的 × 不参与 */
.notif__content {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.notif__body {
  min-width: 0;
}

.notif__title {
  margin: 0;
  font-size: 13px;
  line-height: 1.35;
  color: var(--text);
}

.notif__message {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-dim);
  overflow-wrap: break-word;
}

/* 操作按钮行：幽灵按钮（透明底 + 描边），压在玻璃底上不再垫一层面色。
   允许换行 —— 两条中文长按钮在 320px 宽度下排得下，但别赌它永远排得下。 */
.notif__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.notif__action {
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 2px;
  font-size: 12px;
  line-height: 1.2;
  color: var(--text-dim);
  background: transparent;
  transition:
    color 0.16s ease,
    background-color 0.16s ease;
}

.notif__action:hover {
  color: var(--text);
  background: var(--bg-hover);
}

/* 关闭键压在右上角，hover 才显形（原型同款）。触屏没有 hover：那批指针上它常驻可见，
   否则通知点不开也关不掉。 */
.notif__close {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin: -2px -4px 0 0;
  border-radius: 2px;
  color: var(--text-faint);
  transition:
    color 0.16s ease,
    background-color 0.16s ease,
    opacity 0.16s ease;
}

.notif__close:hover {
  color: var(--text);
  background: var(--bg-hover);
}

@media (hover: hover) {
  .notif__close {
    opacity: 0;
  }

  .notif:hover .notif__close {
    opacity: 1;
  }
}
</style>
