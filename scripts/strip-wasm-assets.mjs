/**
 * strip-wasm-assets —— Tauri 出包前把 `dist/wasm/` 从产物里去掉。
 *
 * 为什么**壳端**（桌面 + Android）都不需要这两个运行时：
 * - 浏览器里的 C++ / Python 沙箱是 wasm，而壳端跑的是系统 / 随包的原生编译器
 *   （engines/native）。两边各自起不来的理由不同：桌面壳没有 COOP/COEP 与 Cache
 *   Storage（HANDOFF 第 14 节第 1、3 条），Android WebView 没有 site isolation。
 * - 代码里也确实是这么标定的，四条互不相干的闸门都在挡它：
 *   `wasmEngine` 的 `platforms: ['web']`（engines/index.js）、设置页「本地运行环境」
 *   整组 `v-if="!isDesktop"`（EditorSettingsPanel.vue）、预下载在桌面端直接早退
 *   （runtimePreload.js 的 scheduleAutoPreload）、SW 注册要求 `IS_WEB`（main.js）。
 *   所以壳端**没有任何代码路径**会去取 `/wasm/` 下的东西。
 *
 * 为什么必须在 cargo 编译**之前**删：前端产物是被 `tauri::generate_context!` 嵌进
 * `libapp_lib.so` / 桌面可执行文件里的，不是放在 APK assets 里 —— 只有先删掉 dist
 * 里那一份，省下的字节才真的落到产物上。所以这一步挂在 `tauri.conf.json` 的
 * `beforeBuildCommand` 上（`build:tauri`），紧跟 `vite build` 之后、对**所有** Tauri
 * 目标生效；网页版部署链路（Vercel）仍走 `npm run build`，两边各不相干。
 *
 * 删的只是 `dist/wasm/`：`dist/md/`（题解渲染器，约 1 MB）留着 —— 桌面端拿不到
 * Cache Storage，它是靠随包这份直接可用的。
 *
 * 用法：npm run build:tauri（本步只管删，dist 得先由 vite build 建出来）
 */

import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WASM = join(ROOT, 'dist/wasm')

/** 递归求和，只为把「省了多少」报出来 */
function sizeOf(dir) {
  let total = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = join(dir, entry.name)
    total += entry.isDirectory() ? sizeOf(child) : statSync(child).size
  }
  return total
}

if (!existsSync(WASM)) {
  console.error(
    'strip-wasm-assets: dist/wasm 不存在 —— 先跑 npm run build。' +
      '（若 vite 已不再往 dist/wasm 输出，说明 public/wasm/ 挪了位置，这条命令要跟着改）',
  )
  process.exit(1)
}

const bytes = sizeOf(WASM)
rmSync(WASM, { recursive: true, force: true })
console.log(
  `strip-wasm-assets: 去掉 dist/wasm（${(bytes / 1048576).toFixed(1)} MiB）` +
    '，壳端用原生编译器，不碰 wasm',
)
