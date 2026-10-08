/**
 * Android 端「随包 C++ 工具链」的准备入口 —— 前端这一侧的唯一出处。
 *
 * Android 的系统里既没有编译器也没有解释器，编译器是随 APK 打包的，启动时要解到应用
 * 私有目录才跑得起来（为什么非得是私有目录、为什么要多一层 `usr/`，见
 * `src-tauri/src/android_toolchain.rs` 的文件头）。首次要解 219MB、好几秒；之后靠一份
 * 版本标记直接跳过，那条命令几毫秒就回来。
 *
 * 三条纪律：
 * 1) **只在 Android 上调**。桌面端（macOS / Windows）用的是系统里已装好的编译器，
 *    那条命令在那边只会回一句「Android 专有」的错误，所以 `IS_ANDROID` 是硬闸门。
 * 2) **全进程只准备一次**：并发的调用共享同一发 Promise（启动那一发，与失败后的重试）。
 * 3) **不产出面向用户的话术**：失败只把 Rust 回的原文收在 `toolchainError` 里，
 *    人话由界面（`ToolchainGate`）经 i18n 数据表翻 —— 与 `native.js` 同一条纪律。
 */
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { IS_ANDROID } from './platform.js'

/** `'idle'`（不需要，或还没开始）→ `'preparing'` → `'ready'` / `'failed'` */
export const toolchainState = ref('idle')

/** 失败原因原文（Rust 侧回的字符串）。只给界面拼提示用，不在这里翻译 */
export const toolchainError = ref('')

/** 在飞的那一发。成功后一直留着 —— 「已就绪」不必再问一遍 */
let pending = null

/**
 * 确保随包工具链就位，返回 `{ reused, root, version }`。
 *
 * 非 Android 直接返回 `null`（什么都不做）。失败也返回 `null` —— 细节看
 * `toolchainState` / `toolchainError`，调用方（遮罩）按状态铺界面。
 */
export function prepareNativeToolchain() {
  if (!IS_ANDROID) return Promise.resolve(null)
  if (pending) return pending

  toolchainState.value = 'preparing'
  toolchainError.value = ''
  pending = invoke('prepare_toolchain')
    .then((report) => {
      toolchainState.value = 'ready'
      return report
    })
    .catch((error) => {
      toolchainState.value = 'failed'
      toolchainError.value = String(error?.message ?? error)
      // 失败不留缓存：遮罩上那颗「重试」要能真的再发一次
      pending = null
      return null
    })
  return pending
}
