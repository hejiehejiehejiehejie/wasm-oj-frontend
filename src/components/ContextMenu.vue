<script setup>
/**
 * ContextMenu —— Teleport 到 body 的通用右键菜单。
 * fixed 定位，挂载后按视口四边收敛（避免溢出屏幕）；
 * 点击外部 / Esc / 窗口失焦关闭。
 *
 * 视觉以一份 vanilla IDE 右键菜单模板为准（2026-10-10，用户指定）：颜色全部走
 * `base.css` 的 `--menu-*` 令牌（那组是 VS Code Dark+ / Light+ 的原装配对），
 * 形状与字距照模板 —— 6px 圆角、220px 最小宽；
 * 字体 13px、条目内边距 6px 12px（模板是 6px 20px，已按下面 2026-11-18 的统一口径收窄）、
 * 右列键位 11px 且与文字至少隔 20px。
 * **行高不写死**（模板也没写）：交给字体的天然行盒，见 `.context-menu__item` 那条注释。
 *
 * 2026-11-18 用户要求从「原生 IDE 还原」再往现代浮层的质感走一档，三处偏离模板：
 *   · **胶囊式悬停**：容器左右恢复 `--menu-pad-x`（4px）内边距、条目给 4px 圆角，
 *     深蓝色块不再通栏顶到边框（模板是通栏方形块，这里刻意改了）。
 *   · **玻璃面 + 无描边 + 三层影**：`--menu-bg` 半透明、边缘不画环（**不写 border**，
 *     也不画 inset 高光），靠 `--menu-shadow` 首层那道虚化发丝影 + 明度差定轮廓；
 *     令牌全在 `base.css`，本文件不写色值。
 *   · **阻尼动效**：0.15s + `cubic-bezier(0.16, 1, 0.3, 1)`，起手 0.92 并轻微上浮。
 *
 * 尺寸统一由 `--menu-scale` 从模板原值乘出来（2026-10-11 用户要「整体等比缩小一号」，
 * 原比例 1）。宽 / 内边距 / 圆角 / 字号 / 条目间距都跟着这一档走 —— **改小改大都只动那一个数**
 * （2026-11-18 起它定义在 `base.css` 的 `:root`，四个菜单组件共用一份，别在组件里再声明）。
 * 别去单独调某一个 px，那样就不是等比了。模板原值一律留在 `calc()` 里当被乘数，
 * 免得日后有人把乘出来的结果当成手感值删掉（坑 33 明令不许凭手感调这组令牌）。
 * 站内所有右键菜单都走这一个组件（文件树、编辑区），改样式只改这里。
 *
 * 定位收敛与「什么时候关」两件事已抽到 `composables/usePopoverLayer.js`（2026-10-11），
 * 与设置下拉菜单共用同一套；本组件只剩渲染。
 */
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { usePopoverLayer } from '../composables/usePopoverLayer.js'

/**
 * @typedef {Object} MenuItem
 * @property {string} id
 * @property {string} [label]
 * @property {string} [shortcut] 右列的快捷键文本（如 `Ctrl+C`）；不给就不占位
 * @property {string} [shortcutIcon] 右列文本**之后**再挂一枚图标（AppIcon 的名字）。给它的场合
 *   只有一种：那颗「键位」其实是个手势 —— 例如「打开题目」的 `⌘ + 单击`，其中的「单击」
 *   用指针图标代替单词（见 `FileExplorer` / `EditorTabs`）。纯组合键别用它，`shortcut` 就够。
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
               数据一律来自快捷键绑定表（`formatCombo(bindings[行动 id])`），不要写死字符串。
               `shortcutIcon` 是给「键位其实是个手势」那一条留的：图标接在文本之后、同一条基线上。 -->
          <span v-if="item.shortcut || item.shortcutIcon" class="context-menu__shortcut">
            <span v-if="item.shortcut" class="context-menu__shortcut-text">{{ item.shortcut }}</span>
            <AppIcon
              v-if="item.shortcutIcon"
              :name="item.shortcutIcon"
              :size="12"
              class="context-menu__shortcut-icon"
            />
          </span>
        </button>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
/* 颜色一律走 base.css 的 --menu-* 令牌，这里不写死任何一个色值；
   尺子（--menu-scale / --menu-pad-x / --menu-item-pad-x）也定义在那边，四个菜单共用一份。
   形状：6px 圆角 / 220px 最小宽 / 容器上下 6px 左右 4px / 条目 6px 12px / 分隔线 6px 6px。
   这些数值不直接写，一律 `模板原值 × --menu-scale`（见文件头那条注释）。 */
.context-menu {
  position: fixed;
  z-index: 120;
  min-width: calc(220px * var(--menu-scale));
  /* 左右**留** 4px 内边距（2026-11-18 改）：悬停是胶囊式色块，与边框之间要有呼吸位，
     不再像模板那样通栏顶到两端。条目 12px + 这里 4px = 文字距边框 16px。 */
  padding: calc(6px * var(--menu-scale)) calc(var(--menu-pad-x) * var(--menu-scale));
  background: var(--menu-bg);
  /* 这里**没有** border（2026-11-18）：容器不画任何环 —— 轮廓交给
     `--menu-shadow` 首层那道虚化发丝影（blur 1px、不扩散）+ 面料与底图的明度差。
     别因为「看不出边」就补回来：一旦写了 border，哪怕 4% 白，也会被框成一个盒子。
     内联控件（主题芯片 / 复制钮 / 输入框）仍用 --menu-border。 */
  border: none;
  border-radius: calc(6px * var(--menu-scale));
  box-shadow: var(--menu-shadow);
  /* 微毛玻璃（2026-11-18 加）：面是 0.85 的半透明，这层滤镜才看得出「底下还有东西」。
     对比度主题把 --menu-backdrop 设成 none 就把玻璃关掉。 */
  backdrop-filter: var(--menu-backdrop);
  visibility: hidden;
  /* 匣比菜单矮时（矮窗口 / 键盘顶起来）usePopoverLayer 会压一个 max-height，这里负责滚 */
  overflow-y: auto;
  /* 弹开时从鼠标点那个角长出来（模板同） */
  transform-origin: top left;
}

/* 展开动效用**动画**而不是 transition：本组件每次打开都是新挂载（父级用 v-if 控），
   没有「旧状态 → 新状态」可过渡，只能靠 keyframes 播一遍。
   0.15s + 自定义缓出（2026-11-18）：浏览器默认 ease 收得太快，弹开显得「啪」一下；
   cubic-bezier(0.16, 1, 0.3, 1) 是快起慢收的那派曲线，收尾带一点惯性。
   prefers-reduced-motion 由 base.css 的全局规则统一压掉，这里不用再写一遍。 */
.context-menu--ready {
  visibility: visible;
  animation: context-menu-in 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes context-menu-in {
  from {
    opacity: 0;
    /* 0.92 起手 + 上浮 4px：比纯缩放多一档「落定」的纵向感 */
    transform: scale(0.92) translateY(-4px);
  }
}

.context-menu__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(20px * var(--menu-scale));
  width: 100%;
  padding: calc(6px * var(--menu-scale)) calc(var(--menu-item-pad-x) * var(--menu-scale));
  background: transparent;
  border: none;
  /* 胶囊式悬停（2026-11-18 改，原为通栏方形 block）：4px × 系数，全站三档圆角里的 4px 那档。
     配容器左右 --menu-pad-x，悬停色块四周都不贴边。 */
  border-radius: calc(4px * var(--menu-scale));
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

:where(html.is-hoverable) .context-menu__item:hover:not(:disabled) {
  background: var(--menu-hover-bg);
  color: var(--menu-hover-text);
}

/* 悬停时快捷键也跟着提亮一档 —— 深蓝底上原本那档灰会糊掉 */
:where(html.is-hoverable) .context-menu__item:hover:not(:disabled) .context-menu__shortcut {
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
   悬停时提亮一档的规则在上面（`--menu-hover-muted`，模板的 `#b0d0ff`）。
   `inline-flex` 只为 `shortcutIcon` 那一档（键位是手势、末位挂一枚指针）—— 图标要跟文本
   同基线居中、中间留一点点缝。纯文本时不改变任何排布：文本在 flex 里自成一项，宽度仍是本身。 */
.context-menu__shortcut {
  display: inline-flex;
  align-items: center;
  gap: calc(3px * var(--menu-scale));
  color: var(--menu-muted);
  font-size: calc(11px * var(--menu-scale));
}

/* 图标不参与挤压：键位太长时宁可整个右列被 `space-between` 推开，也不让指针变形 */
.context-menu__shortcut-icon {
  flex: none;
}

.context-menu__divider {
  height: 1px;
  /* 容器左右已有 --menu-pad-x（4px），这里收到 6px —— 视觉上仍是距边框约 10px 的那条内缩线 */
  margin: calc(6px * var(--menu-scale)) calc(6px * var(--menu-scale));
  background: var(--menu-separator);
}
</style>
