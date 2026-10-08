/**
 * 本机文件夹工作区里「哪些条目不该进树、也不该进沙箱」的**唯一出处**。
 *
 * Rust 侧 `fs_scan` 只收参数（`{ dotFiles, dirNames }`）、不写死策略 —— 免得同一套
 * 过滤规则在 JS 与 Rust 两边各维护一份。所以这里的常量与 [`isIgnoredEntry`] 才是权威：
 * `LocalFolderVFSProvider` 组装 `fs_scan` 参数用它，第 6 步 `runnoFs` 决定沙箱收录范围时也用它。
 */

import { SIDECAR_DIR } from './workspaceSidecar.js'

/**
 * 额外拒绝的目录名（按单级名字比，不看层级）。
 *
 * 里面其实都点开头，也都会被下面「点开头一律跳过」那条规则挡住 —— 但**显式列出来**是有意的：
 * 这三样是「一定不能进功能性名单」的硬约束（`.git` 是版本库、`node_modules` 是依赖、
 * `.unnamed/` 是本方案自己的 sidecar），写死在这里，日后调过滤宽窄时不会顺手把它们放进来。
 */
export const DIR_DENY = ['.git', 'node_modules', SIDECAR_DIR]

/**
 * 该条目是否不进树 / 不进沙箱。
 *
 * 规则：点开头的一律跳过（`.git`、`.unnamed`、`.env`、`.DS_Store` …），
 * 或命中 {@link DIR_DENY}。参数是**单级名字**，不是路径。
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isIgnoredEntry(name) {
  const text = String(name ?? '')
  if (text.startsWith('.')) return true
  return DIR_DENY.includes(text)
}

/**
 * `fs_scan` 命令的过滤参数形态（见 src-tauri/src/workspace.rs 的 `IgnoreRules`）。
 * @returns {{ dotFiles: boolean, dirNames: string[] }}
 */
export function scanIgnore() {
  return { dotFiles: true, dirNames: [...DIR_DENY] }
}
