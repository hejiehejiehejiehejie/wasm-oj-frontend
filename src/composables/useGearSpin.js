/**
 * useGearSpin —— 设置齿轮「点一下**逆时针**转 120°」（2026-11-12 用户要求；同日由顺时针改过来）。
 *
 * 【为什么是累加，而不是「转过去再弹回来」】
 * 一次点击转 120°、停下就留在那儿：下一发从当前角度接着转，永远接得上。
 * 若做成「0 → 120 → 回 0」的 one-shot，动画一结束就得把角度瞬移回起点，
 * 那一下必然是生硬的一跳（而且下一发的起点和上一发的终点对不上）。
 * 120° 起步的角度对齿轮来说也看不腻 —— 三发之后回到 0°，正好一圈。
 *
 * 【方向】CSS 的 `rotate()` 正角度是**顺时针**，所以逆时针就是往负方向累加（见 `spin()`）。
 * `GEAR_SPIN_STEP` 保留正数当「一格多大」，方向只在累加那一行带符号 —— 别把负号藏进常量里，
 * 否则后面改时长 / 曲线的人看到 -120 会以为是笔误。
 *
 * 【曲线】`y2 > 1` 的 cubic-bezier 就是「冲过头一点再回来」：起手快、落点带一丝回弹，
 * 停下来没有匀速感。幅度约 8%（120° 上越到 ~130° 再落回 120°），再多就像在晃。
 * ⚠️ 时长与曲线只在下面这两处写，两个消费方（侧栏页头齿轮 / 折叠态图标栏齿轮）
 * 都从这儿取 —— 它们各是一份 scoped 样式，写在 CSS 里就得抄两遍。
 *
 * 【减弱动效】`base.css` 末尾那条 `@media (prefers-reduced-motion: reduce)` 把
 * `transition-duration` 压成 0.01ms（带 !important，内联样式也压得住），
 * 所以这里不必再问一次 matchMedia —— 转 120° 是状态而不是装饰，瞬时切过去就行。
 *
 * 【消费方的两条纪律】
 * - 绑定在**图标**上，不是按钮上：按钮本身还有「填亮＝开着」的底色，别跟着转；
 * - 只在真正翻转菜单的那一拍调 `spin()`：`suppressOpen` 拦掉的那一发（pointerdown
 *   已经收掉菜单、click 又被进来）什么都没变，转了就是对不上的反馈。
 */
import { computed, ref } from 'vue'

/** 每一格多大（正值，三发正好一圈，停下时齿轮的角度始终是 120 的整数倍） */
export const GEAR_SPIN_STEP = 120
/** 转完这一发要多久 */
export const GEAR_SPIN_MS = 620
/** 起手快、落点带一丝回弹（见头注释「曲线」） */
export const GEAR_SPIN_EASE = 'cubic-bezier(0.22, 1.3, 0.36, 1)'

/**
 * @returns {{ spin: () => void, style: import('vue').ComputedRef<Record<string, string>> }}
 *   `spin()` 让齿轮再逆时针转一格；`style` 直接绑到 `AppIcon` 上（`:style="spinStyle"`，
 *   经 attrs 落到它那个 `<svg>` 根上）。
 */
export function useGearSpin() {
  const angle = ref(0)

  function spin() {
    // 负号＝逆时针（CSS 的正角度是顺时针），见头注释「方向」
    angle.value -= GEAR_SPIN_STEP
  }

  // 首帧只有 rotate(0deg)、没有角度变化，所以 transition 不会白播一次
  const style = computed(() => ({
    transform: `rotate(${angle.value}deg)`,
    transition: `transform ${GEAR_SPIN_MS}ms ${GEAR_SPIN_EASE}`,
  }))

  return { spin, style }
}
