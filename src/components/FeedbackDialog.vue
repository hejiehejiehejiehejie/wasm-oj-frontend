<script setup>
import AppDialog from './AppDialog.vue'
import AppIcon from './AppIcon.vue'
import { t } from '../i18n/index.js'
import { closeFeedback, feedbackOpen } from '../services/feedback.js'

/**
 * 反馈弹窗：设置菜单（SettingsMenu）里「反馈」那一行动作弹出来的卡片。
 *
 * 外壳直接复用 AppDialog（全站确认卡同一套卡面、Esc / 点遮罩关闭、焦点圈定），
 * 正文只有一句说明，两个落点走 footer 的竖排（stack-actions），与导出卡那三个落点
 * 同一版式 —— 别在这里另写一套按钮。
 *
 * 两条链接都用 `_blank` + `noopener`：站内不给外部页面留 opener。
 * 点完顺手收掉卡片（焦点归还由 AppDialog 负责，那时触发它的菜单可能已收起，
 * 它会自己判定触发元素是否还连在文档上）。
 */
const ISSUES_URL = 'https://github.com/hejiehejiehejiehejie/wasm-oj-frontend/issues'
const COMMENTS_URL = 'https://blog.998244353.best/comments/'
</script>

<template>
  <AppDialog
    v-if="feedbackOpen"
    icon="help"
    size="sm"
    stack-actions
    initial-focus=".js-feedback-issue"
    :title="t('settings.feedback.title')"
    @close="closeFeedback"
  >
    <p class="feedback-desc">{{ t('settings.feedback.desc') }}</p>

    <template #footer>
      <a
        class="app-dialog__btn app-dialog__btn--primary feedback-link js-feedback-issue"
        :href="ISSUES_URL"
        target="_blank"
        rel="noopener noreferrer"
        @click="closeFeedback"
      >
        <AppIcon name="external" :size="14" />
        {{ t('settings.feedback.issue') }}
      </a>
      <a
        class="app-dialog__btn feedback-link"
        :href="COMMENTS_URL"
        target="_blank"
        rel="noopener noreferrer"
        @click="closeFeedback"
      >
        <AppIcon name="link" :size="14" />
        {{ t('settings.feedback.board') }}
      </a>
    </template>
  </AppDialog>
</template>

<style scoped>
.feedback-desc {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--text-dim);
}

/* 两枚落点借 .app-dialog__btn 的盒子与配色（见 base.css），
   链接只需要补上按钮没有的那一条：去掉下划线 */
.feedback-link {
  text-decoration: none;
}
</style>
