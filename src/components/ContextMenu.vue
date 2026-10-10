<script setup>
/**
 * ContextMenu —— Teleport 到 body 的通用右键菜单。
 * fixed 定位，挂载后按视口四边收敛（避免溢出屏幕）；
 * 点击外部 / Esc / 窗口失焦关闭。
 *
 * 视觉以一份 vanilla IDE 右键菜单模板为准（2026-10-10，用户指定）：颜色全部走
 * `base.css` 的 `--menu-*` 令牌（那组是 VS Code Dark+ / Light+ 的原装配对），
 * 形状与字距照模板 —— 6px 圆角、220px 最小宽、通栏方形悬停、0.1s 弹开；
 * 字体 13px、条目内边距 6px 20px、右列键位 11px 且与文字至少隔 20px。
 * **行高不写死**（模板也没写）：交给字体的天然行盒，见 `.context-menu__item` 那条注释。
 *
 * 尺寸统一由 `--menu-scale` 从模板原值乘出来（2026-10-11 用户要「整体等比缩小一号」，
 * 原比例 1）。宽 / 内边距 / 圆角 / 字号 / 条目间距都跟着这一档走 —— **改小改大都只动这一个数**，
 * 别去单独调某一个 px，那样就不是等比了。模板原值一律留在 `calc()` 里当被乘数，
 * 免得日后有人把乘出来的结果当成手感值删掉（坑 33 明令不许凭手感调这组令牌）。
 * 站内所有右键菜单都走这一个组件（文件树、编辑区），改样式只改这里。
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * @typedef {Object} MenuItem
 * @property {string} id
 * @property {string} [label]
 * @property {string} [shortcut] 右列的快捷键文本（如 `Ctrl+C`）；不给就不占位
 * @property {boolean} [disabled]
 * @property {boolean} [divider]
 */

const props = defineProps({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  /** @type {MenuItem[]} */
  items: { type: Array, required: true },
})

const emit = defineEmits(['select', 'close'])

const root = ref(null)
const position = ref({ left: `${props.x}px`, top: `${props.y}px` })
const ready = ref(false)

function close() {
  emit('close')
}

function select(item) {
  if (!item || item.disabled || item.divider) return
  emit('select', item.id)
}

function onPointerDown(event) {
  if (root.value && !root.value.contains(event.target)) close()
}

function onKeyDown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

onMounted(async () => {
  await nextTick()
  const el = root.value
  if (el) {
    const rect = el.getBoundingClientRect()
    const gap = 8
    const left = Math.max(gap, Math.min(props.x, window.innerWidth - rect.width - gap))
    const top = Math.max(gap, Math.min(props.y, window.innerHeight - rect.height - gap))
    position.value = { left: `${left}px`, top: `${top}px` }
  }
  ready.value = true
  // 延迟注册：避免触发本次右键的同一事件立刻把菜单关掉
  window.setTimeout(() => {
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
  }, 0)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('keydown', onKeyDown, true)
  window.removeEventListener('blur', close)
  window.removeEventListener('resize', close)
})
</script>

<template>
  <Teleport to="body">
    <div
      ref="root"
      class="context-menu"
      :class="{ 'context-menu--ready': ready }"
      :style="position"
      role="menu"
    >
      <template v-for="(item, index) in items" :key="item.id ?? index">
        <div v-if="item.divider" class="context-menu__divider" role="separator"></div>
        <button
          v-else
          type="button"
          class="context-menu__item"
          :disabled="item.disabled"
          role="menuitem"
          @click="select(item)"
        >
          <span class="context-menu__label">{{ item.label }}</span>
          <!-- 右列快捷键（模板里「文字在左、键位在右」的排布）。给不给由调用方决定：
               现在文件树的「重命名 / 删除」与编辑区那四项都带数据，其余项不带、这一格就不出现。
               数据一律来自快捷键绑定表（`formatCombo(bindings[行动 id])`），不要写死字符串。 -->
          <span v-if="item.shortcut" class="context-menu__shortcut">{{ item.shortcut }}</span>
        </button>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
/* 颜色一律走 base.css 的 --menu-* 令牌，这里不写死任何一个色值。
   形状照模板：6px 圆角 / 220px 最小宽 / 容器上下 6px / 条目 6px 20px / 分隔线 6px 10px。
   这些数值不直接写，一律 `模板原值 × --menu-scale`（见文件头那条注释）。 */
.context-menu {
  /* 等比缩放系数。0.92 = 13px 字降到 12px，其余尺寸按同一比例跟下来 */
  --menu-scale: 0.92;
  position: fixed;
  z-index: 120;
  min-width: calc(220px * var(--menu-scale));
  /* 左右**不留**内边距是刻意的：悬停色块要通栏顶到菜单两端（模板如此）。
     上下那 6px 是首末条目与边框之间的呼吸位，也顺带让圆角处不会被色块切到。 */
  padding: calc(6px * var(--menu-scale)) 0;
  background: var(--menu-bg);
  border: 1px solid var(--menu-border);
  border-radius: calc(6px * var(--menu-scale));
  box-shadow: var(--menu-shadow);
  visibility: hidden;
  /* 弹开时从鼠标点那个角长出来（模板同） */
  transform-origin: top left;
}

/* 展开动效用**动画**而不是 transition：本组件每次打开都是新挂载（父级用 v-if 控），
   没有「旧状态 → 新状态」可过渡，只能靠 keyframes 播一遍。
   prefers-reduced-motion 由 base.css 的全局规则统一压掉，这里不用再写一遍。 */
.context-menu--ready {
  visibility: visible;
  animation: context-menu-in 0.1s ease;
}

@keyframes context-menu-in {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
}

.context-menu__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(20px * var(--menu-scale));
  width: 100%;
  padding: calc(6px * var(--menu-scale)) calc(20px * var(--menu-scale));
  background: transparent;
  border: none;
  /* 不做圆角：悬停要是通栏的方形色块（模板如此，对应上面容器左右 0 内边距） */
  border-radius: 0;
  color: var(--menu-text);
  font-family: var(--font-sans, system-ui);
  font-size: calc(13px * var(--menu-scale));
  font-weight: 400;
  /* 行高交给字体自己定（模板也没写行高 = normal）。实测 13px 下天然行盒：
     拉丁 16px → 条目 6+6+16 = **28px**（与模板逐像素相同）；中文 18px → 30px
     （CJK 的天然行盒天生高一档，模板若写中文也是这个数）。
     别在这里写死一个数 —— 上一轮写的 `18px` 正好是中文那一档，等于把英文界面也撑高了 2px。
     它是跟着 font-size 自己缩的，所以本轮整体缩小不需要额外动它（12px 下约 5.5+5.5+15 ≈ 26px）。 */
  line-height: normal;
  text-align: left;
  cursor: pointer;
  /* 模板的 0.1s：底色与文字色一起过渡，鼠标扫过一排条目时不会闪 */
  transition: background-color 0.1s ease, color 0.1s ease;
}

.context-menu__item:hover:not(:disabled) {
  background: var(--menu-hover-bg);
  color: var(--menu-hover-text);
}

/* 悬停时快捷键也跟着提亮一档 —— 深蓝底上原本那档灰会糊掉 */
.context-menu__item:hover:not(:disabled) .context-menu__shortcut {
  color: var(--menu-hover-muted);
}

.context-menu__item:disabled {
  /* 0.4 取自模板（原先是 0.45） */
  opacity: 0.4;
  cursor: default;
}

/* 右列快捷键：11px + 暗一档（`--menu-muted`），退到背景里。
   与左边文字之间至少隔 20px —— 模板写的是 `margin-left: 20px`，这里由条目的 `gap: 20px`
   承担：条目是 `justify-content: space-between`，够宽时键位贴右缘、不够宽时 gap 兜住最小间距。
   悬停时提亮一档的规则在上面（`--menu-hover-muted`，模板的 `#b0d0ff`）。 */
.context-menu__shortcut {
  color: var(--menu-muted);
  font-size: calc(11px * var(--menu-scale));
}

.context-menu__divider {
  height: 1px;
  margin: calc(6px * var(--menu-scale)) calc(10px * var(--menu-scale));
  background: var(--menu-separator);
}
</style>
