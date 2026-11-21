import { defineConfig } from 'vitest/config'

// 单测独立成一份最小配置：不加载 app 的 vite.config.js（那里面有构建期插件与
// 多入口约束，跑测试时既不需要也容易互相拖累）。
// 需要 DOM 的用例在文件头用 `@vitest-environment jsdom` 单独声明。
export default defineConfig({
  test: {
    include: ['src/**/*.spec.js'],
  },
})
