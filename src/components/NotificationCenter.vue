<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { t } from '../i18n/index.js'
import { dismissNotification, notifications } from '../services/notifications.js'

// 四类型各一枚图标（AppIcon 的名字）。error 用「圆圈 ×」而不是 alert（三角形）：
// 那枚是警告的字形，压着红字会被读成 warning。
const ICONS = { info: 'info', success: 'check', warning: 'alert', error: 'error' }

/**
 * 倒计时用的「现在」。带 `countdown` 的通知（见 services/notifications.js 文件头）
 * 每秒把它推进一格：模板里那条读数就是 `deadline - now`，所以**必须拿绝对时刻重算**，
 * 不能自己累减 —— 后台标签页 / 移动端的 interval 会被节流甚至冻住，累减出来的数会比
 * 真实时间慢一大截。文案与 mm:ss 格式都在调用方给的函数里，这里不认识任何业务。
 *
 * 只在「场上确实有带倒计时的通知」时才开着这只 interval：没有它的那几天，
 * 通知中心不该每秒醒一次。
 */
const now = ref(Date.now())
let ticker = 0

watch(
  () => notifications.value.some((item) => item.countdown),
  (hasCountdown) => {
    if (hasCountdown && !ticker) {
      now.value = Date.now()
      ticker = window.setInterval(() => {
        now.value = Date.now()
      }, 1000)
      return
    }
    if (!hasCountdown && ticker) {
      window.clearInterval(ticker)
      ticker = 0
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  if (ticker) window.clearInterval(ticker)
  ticker = 0
})

/** 某条通知那行倒计时的当前文案；`expired` 只用来决定配色（到点转 --warn） */
function countdownOf(notif) {
  const remain = notif.countdown.deadline - now.value
  return remain > 0
    ? { expired: false, text: notif.countdown.text(remain) }
    : { expired: true, text: notif.countdown.expiredText() }
}

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
 * `keep: true` 的那颗**不退场**：见服务层文件头，复制完验证码往往还要点下一颗。
 */
function runAction(notif, action) {
  if (notif.leaving) return
  if (action.run) action.run(notif)
  if (!action.keep) dismissNotification(notif.id)
}

/**
 * 点整条通知打开落地页（只有带 `link` 的那几条可点，见服务层文件头）。
 *
 * 三种情况不算数：
 * - 点在按钮上（× 与操作按钮各有各的动作，别让冒泡把它们变成「顺带打开」）；
 * - 用户拖选文字后松手的那一下 —— 想把「挂在第 3 个点 · 15ms」抄走，不该跳走；
 * - 正在退场的条目（引用上已经作废）。
 * 键盘那一路（Enter / Space）不看选区：焦点在卡片上就是要打开，那时残留的选区
 * 是上一件事留下的。
 *
 * 打开后**不退场**：跳去 Codeforces 看完提交，回来时这条还在，30 秒自己会走。
 */
function openLink(notif, event) {
  if (!notif.link || notif.leaving) return
  if (event.type === 'click') {
    const target = event.target
    if (target instanceof Element && target.closest('button')) return
    const selection = window.getSelection()
    if (selection && String(selection).trim()) return
  }
  window.open(notif.link, '_blank', 'noopener')
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
        :class="[`is-${notif.type}`, { 'is-leaving': notif.leaving, 'is-clickable': notif.link }]"
        :style="{ order: orders.get(notif.id) }"
        :role="notif.link ? 'link' : null"
        :tabindex="notif.link ? 0 : null"
        @click="openLink(notif, $event)"
        @keydown.enter.prevent="openLink(notif, $event)"
        @keydown.space.prevent="openLink(notif, $event)"
      >
        <AppIcon :name="ICONS[notif.type] ?? 'info'" :size="15" class="notif__icon" />
        <div class="notif__content">
          <div class="notif__body">
            <p class="notif__title">
              <span class="notif__title-text">{{ notif.title }}</span>
              <AppIcon v-if="notif.link" name="external" :size="11" class="notif__link-icon" />
            </p>
            <p v-if="notif.message" class="notif__message">{{ notif.message }}</p>
            <!-- 活倒计时（可选）：调用方给 deadline 与两句文案，这里只负责每秒重算 -->
            <p
              v-if="notif.countdown"
              class="notif__countdown"
              :class="{ 'is-expired': countdownOf(notif).expired }"
            >
              {{ countdownOf(notif).text }}
            </p>
          </div>
          <!-- 操作按钮（可选，至多 MAX_ACTIONS 颗，见服务层契约）：点击跑回调，默认随之退场 -->
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
   挡住底下内容的点击。
   z-index 取 115：压过编辑栏内的浮层（抽屉 30、倒计时卡 110、Monaco 菜单等），
   又低于放大镜（118）、body 级菜单（120 / 125）、确认框（130）、拖拽幽灵（140）、
   tooltip（160）—— toast 是背景播报，不该盖住任何正在被操作的浮层。
   2026-11-05 由 150 下调：原先比菜单 / 确认框都高，在没有 View Transitions 的
   浏览器里通知会盖住右键菜单和确认框遮罩（层叠阶梯的完整口径见 App.vue）。
   窄屏展开的抽屉（.pane--tests，z 30）压不压得住它，看 `.pane--editor` 是否因
   `view-transition-name` 自成层叠上下文：支持 View Transitions 的浏览器里压得住，
   不支持的浏览器里这里的 115 直接生效、在抽屉之上。 */
.notif-center {
  position: absolute;
  right: 20px;
  bottom: 20px;
  z-index: 115;
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
  border-radius: 2px;
  background: var(--toast-bg);
  /* 只写标准属性：成对写前缀会被 Lightning CSS 只留前缀、Chrome 141+ 又不认前缀（见 CountdownCard） */
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

/* 悬停抬一档底色。判据是 html.is-hoverable（services/hoverCapability.js）：
   触屏上 :hover 会粘在最后点过的卡片上不散，那样一条通知会永久停在「悬停色」。 */
:where(html.is-hoverable) .notif:hover {
  background: var(--toast-bg-hover);
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
  /* 标题与那枚「点得开」的图标排成一行：文本自己换行，图标钉在首行右侧。
     flex 是为了让图标永远贴着**第一行**结尾，而不是被长标题的末行带走。 */
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin: 0;
  font-size: 13px;
  line-height: 1.35;
  color: var(--text);
}

.notif__title-text {
  min-width: 0;
  overflow-wrap: break-word;
}

/* 可点的通知（带 link）在标题尾缀一枚 `external`：光标提示只对鼠标有用，
   触屏上没人会去 hover，得有一个**看得见**的「这条点得开」。 */
.notif__link-icon {
  flex: 0 0 auto;
  /* 13px × 1.35 的行盒里居中那 11px：与文字基线齐平，不抢视线 */
  margin-top: 3px;
  color: var(--text-faint);
}

/* 悬停时标题加下划线、图标提一档色，和 cursor 一起说「这里是个链接」。
   判据同全站：只在真悬停指针上。 */
:where(html.is-hoverable) .notif.is-clickable:hover .notif__link-icon {
  color: var(--text-dim);
}

:where(html.is-hoverable) .notif.is-clickable:hover .notif__title {
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* 可点整条：光标给提示（触屏上没有 cursor，那里的提示交给上面那枚图标）。 */
.notif.is-clickable {
  cursor: pointer;
}

.notif__message {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-dim);
  overflow-wrap: break-word;
}

/* 倒计时那行：等宽 + 定宽数字，免得 9:59 → 9:58 时整行宽度抖一下。
   到点转 --warn 并换回正文字体 —— 那时它显示的是「已过期」一句中文，不是时间了。 */
.notif__countdown {
  margin: 2px 0 0;
  font-family: var(--mono-font);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--text-dim);
}

.notif__countdown.is-expired {
  font-family: inherit;
  font-variant-numeric: normal;
  color: var(--warn);
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

:where(html.is-hoverable) .notif__action:hover {
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

:where(html.is-hoverable) .notif__close:hover {
  color: var(--text);
  background: var(--bg-hover);
}

/* 关闭键压在右上角，能悬停时才藏着、悬停才显形（原型同款）；手指 / 无悬停指针上它常驻可见，
   否则通知点不开也关不掉。判据是 html.is-hoverable（services/hoverCapability.js：
   手指按下就关、鼠标一动就开）—— 触屏上 :hover 会粘在最后点过的那张卡上不散，
   那样一条通知会永久停着「悬停色」的 ×。 */
:where(html.is-hoverable) .notif__close {
  opacity: 0;
}

:where(html.is-hoverable) .notif:hover .notif__close {
  opacity: 1;
}
</style>
