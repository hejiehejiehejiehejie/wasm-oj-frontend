<script setup>
/**
 * MenuScrim —— 菜单浮层底下那张「铺满视口的透明遮罩」。
 *
 * 【它负责什么】菜单一开，**整页都不可点、也不许滚**：编辑区、文件树、页签条一概不响应
 * 滚轮 / 触摸拖动 / 点击，点任意位置只是把菜单收掉。做法是铺一层透明层，指针命中全落在
 * 它身上 —— 底下那些滚动容器与 Monaco 的 mousedown 那一套根本收不到事件，
 * 「点空白顺手把光标落进编辑器 / 顺手切了页签 / 顺手选中了某个文件」这类副作用一并没了。
 *
 * 【关闭不在这里】它没有自己的关闭逻辑：点它就等于点菜单外面，走 `usePopoverLayer`
 * 的 `pointerdown` 捕获收掉（触屏会在关闭前登记一次 `swallowNextTap`，抬手不会把
 * 键盘弹出来 / 不会补一发点击到底下的元素上）。
 *
 * 【谁在用】2026-11-18 起三个菜单共用（用户口径统一：**点外部只收菜单，不触发底下
 * 的业务逻辑**）：
 * - `ContextMenu.vue`（右键菜单）：z-index 119 —— 压过编辑区里所有抬层（最高的
 *   选择手柄是 118），菜单本体 120 在它上面；
 * - `SettingsMenu.vue`（设置下拉）：z-index 124 —— 压过通知中心（115）、页签组卡片
 *   （120）等应用层浮层，菜单本体 125、二级 126 在它上面；
 * - `ComponentsMenu.vue`（组件菜单）：z-index 124 —— 同设置菜单那一档，本体 125。
 * 130 及以上的层是模态确认框（删除确认 / 提交确认 / 题目信息），与菜单不该同时开，
 * 不必被它压住；AppTooltip（160）是悬停提示，留着无妨。
 *
 * 【滚动的两条分工】`touch-action: none` 让这一层上的手指不再产生平移 / 缩放（浏览器在
 * `touchstart` 那一刻就定下了手势归属，晚改没用，必须写在静态样式里）；滚轮的
 * `preventDefault` 由模板上的 `@wheel.prevent` 出，Vue 挂的是非被动监听（这一层是 div，
 * 不是 Chrome 默认加被动的 window/document/body）。两条都只作用于「指针落在遮罩上」——
 * 菜单自己是遮罩的上层，菜单内部滚不受影响。`@contextmenu.prevent` 吃掉右键：
 * 否则系统菜单会冒出来（那时菜单已经被上面那一发 pointerdown 收掉了）。
 *
 * 【不压暗画面】IDE 菜单本就不带幕布，透明即可；要一点反馈就在 style 里把
 * background 换成 rgba(0, 0, 0, 0.08)（深浅两套通用）。
 *
 * 【FileExplorer 的坐标反查】遮罩把 pointerdown 吞了之后，「用户点的是哪儿」只能按坐标
 * 反查（`FileExplorer.vue` 的 `underScrim`）；它按类名 `.menu-scrim` 认这一层 ——
 * 改类名必须两处成对改。
 */
defineProps({
  /** 遮罩所在的 z-index：必须低于所属菜单本体、高于要挡住的所有应用层内容 */
  z: { type: Number, required: true },
})
</script>

<template>
  <div
    class="menu-scrim"
    aria-hidden="true"
    :style="{ zIndex: z }"
    @wheel.prevent
    @contextmenu.prevent
  ></div>
</template>

<style scoped>
.menu-scrim {
  position: fixed;
  inset: 0;
  /* 想加一点可感知的压暗就换成 rgba(0, 0, 0, 0.08)（深浅两套通用），并同步写进注释 */
  background: transparent;
  touch-action: none;
  /* 遮罩上的滚到头别再往父级链（body 是 overflow: hidden，本来也滚不动，这道是兜底） */
  overscroll-behavior: contain;
  /* 光标保持箭头：遮罩不算文字区域，出 I 形光标会让人以为能选字 */
  cursor: default;
}
</style>
