<script setup>
// 局部等待指示：一枚跟着 currentColor 走的细圆环。
//
// 只在「等的是外部事情、界面又没别的东西在动」的地方用（取码、下载、导入、提交……），
// 它不是全屏遮罩 —— 等待期间用户该能继续操作别的区域。
//
// 尺寸默认 12px：与行内 11~12px 的文字同高，塞进状态行 / 小按钮不会把行高撑开。
// 环宽按尺寸推（size / 8），小尺寸下不会糊成一坨实心圆。
defineProps({
  size: { type: [Number, String], default: 12 },
})
</script>

<template>
  <span
    class="loading-spinner"
    :style="{ '--spinner-size': `${size}px` }"
    aria-hidden="true"
  ></span>
</template>

<style scoped>
.loading-spinner {
  display: inline-block;
  flex: 0 0 auto;
  width: var(--spinner-size);
  height: var(--spinner-size);
  border: calc(var(--spinner-size) / 8) solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  opacity: 0.8;
  vertical-align: -0.1em;
}

/* base.css 在 reduce 下把所有动画压成 0.01ms（一次性），无限转圈会变成静止的环。
   静止的环本身仍然是一个「正在进行」的记号，所以这里不另做降级，只是不转。 */
@media (prefers-reduced-motion: no-preference) {
  .loading-spinner {
    animation: loading-spinner-spin 0.75s linear infinite;
  }
}

@keyframes loading-spinner-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
