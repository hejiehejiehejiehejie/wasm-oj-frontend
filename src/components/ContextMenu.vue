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
 *
 * 定位收敛与「什么时候关」两件事已抽到 `composables/usePopoverLayer.js`（2026-10-11），
 * 与设置下拉菜单共用同一套；本组件只剩渲染。
 */
import { computed } from 'vue'
import { usePopoverLayer } from '../composables/usePopoverLayer.js'

/**
 * @typedef {Object} MenuItem
 * @property {string} id
 * @property {string} [label]
 * @property {string} [shortcut] 右列的快捷键文本（如 `Ctrl+C`）；不给就不占位
 * @property {boolean} [checked] 勾选态（只在可勾选的菜单里给，见下面 `hasChecks`）
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

/**
 * 「有没有勾位」与「这条是不是勾选项」是两个判据，别合并：
 * - `hasChecks`：整份菜单里有一条带 `checked`，就所有条目都留出左侧勾位 ——
 *   否则同一份菜单里有勾的条目文字比没勾的右移一格，左边缘就对不齐。
 *   （文件树 / 编辑区那些菜单一条都不带这个字段，因此完全不受影响，
 *   布局与以前逐像素相同。）
 * - 单个条目的 `role` / `aria-checked`：只看**它自己**有没有 `checked`。
 *   同一份菜单里混着「动作项」（如「侧边栏移到右侧」）和「勾选项」时，
 *   动作项仍得读成普通 menuitem，标成复选框会让读屏念错。
 */
const hasChecks = computed(() => props.items.some((item) => typeof item.checked === 'boolean'))

const { root, position, ready } = usePopoverLayer({
  x: () => props.x,
  y: () => props.y,
  onDismiss: () => emit('close'),
})

function select(item) {
  if (!item || item.disabled || item.divider) return
  emit('select', item.id)
}
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
          :class="{ 'context-menu__item--checked': item.checked }"
          :disabled="item.disabled"
          :role="typeof item.checked === 'boolean' ? 'menuitemcheckbox' : 'menuitem'"
          :aria-checked="typeof item.checked === 'boolean' ? Boolean(item.checked) : undefined"
          @click="select(item)"
        >
          <!-- 勾位：只有整份菜单里存在 checked 字段时才渲染（见 script 里的 hasChecks） -->
          <span v-if="hasChecks" class="context-menu__check" aria-hidden="true"></span>
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

/* 条目文字：撑满中间那段，右列键位才贴得住右缘。
   有勾位时它夹在「勾位」与「键位」之间（space-between + 这条 flex:1 等价于
   原来两栏时的效果，所以不带勾位的菜单布局逐像素没变）。 */
.context-menu__label {
  flex: 1;
}

/* 勾位（2026-10-22 加，图标栏右键菜单是第一个用户）：固定一格宽，有没有勾都占位，
   同一份菜单里各条目的文字左边缘才对得齐。勾本身用两条边框旋转出来，
   不用 `✓` 字符 —— 字符在不同平台的字体里形态与基线都不一样。
   颜色走 currentColor：条目 hover 提亮时勾跟着一起亮。 */
.context-menu__check {
  position: relative;
  flex: 0 0 auto;
  width: calc(12px * var(--menu-scale));
  height: calc(12px * var(--menu-scale));
}

.context-menu__check::before {
  content: '';
  position: absolute;
  left: calc(1px * var(--menu-scale));
  top: calc(3px * var(--menu-scale));
  width: calc(8px * var(--menu-scale));
  height: calc(4px * var(--menu-scale));
  border-left: calc(1.5px * var(--menu-scale)) solid currentColor;
  border-bottom: calc(1.5px * var(--menu-scale)) solid currentColor;
  transform: rotate(-45deg);
  opacity: 0;
}

.context-menu__item--checked .context-menu__check::before {
  opacity: 1;
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
