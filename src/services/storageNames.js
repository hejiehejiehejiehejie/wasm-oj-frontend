/**
 * 持久化名字的**唯一定义处** —— 缓存桶名、IndexedDB 库名，以及它们改名前的旧名字。
 *
 * 【为什么要有这个文件】
 * 这些名字原来散在四个模块里各自硬编码，其中两个（工具链桶、渲染器桶）还被
 * Service Worker 与页面**同时**引用。两处字面量一旦对不上，页面写进 A 桶、SW 却在
 * activate 阶段按 B 桶的白名单清理 —— 用户已经下好的 76MB 工具链会被静默删掉，
 * 下次运行重新下载，没有任何报错。收敛到一处之后，改名只需要动这个文件。
 *
 * 【三类名字，改法不一样】
 * - SHELL_VERSION：发版时手动 +1，只影响外壳桶。
 * - 工具链 / 渲染器桶：**刻意不带外壳版本号**。它们的资产路径本身带版本
 *   （public/wasm/<版本>/、/md/assets.json 随 katex 版本生成），换版本 = 换 URL =
 *   旧缓存自然失效；桶名再跟外壳版本走，只会让「升一次外壳把 76MB 工具链一起清掉」
 *   这种事故重演。
 * - LEGACY_*：改名前的旧名字。它们是**不可删的契约点** —— 不写出旧名字，就没法把
 *   改名那一刻还在用旧版本的用户的数据搬过来。删掉等于让他们丢工作区 / 重下 76MB。
 *
 * 【Service Worker 怎么办】
 * SW 是 classic worker，没有 `import`，读不到这个模块。所以它需要的那几个常量由
 * vite.config.js 的 cp-service-worker 插件在构建期生成一段 `const …` 前置到
 * src/sw.js 上，来源就是下面的 SERVICE_WORKER_CONSTANTS。
 */

// ---------------------------------------------------------------- Cache Storage 桶

/** 外壳版本号：**发版时改这一行**。升它会让旧外壳桶在 SW activate 阶段被清掉。 */
const SHELL_VERSION = 'v4'

/** 外壳桶：构建产物 + 静态资源，小而常变。 */
export const SHELL_CACHE = `cp-shell-${SHELL_VERSION}`

/** 工具链桶：clang / wasm-ld / sysroot / CPython，体积大、随 URL 固定，不带版本号。 */
export const TOOLCHAIN_CACHE = 'cp-toolchain-v3'

/**
 * 工具链桶的前缀。卸载运行时按前缀全扫，而不是只认当前这一个名字 ——
 * 改名之后，总还有用户的浏览器上留着上一代的桶。
 */
export const TOOLCHAIN_CACHE_PREFIX = 'cp-toolchain'

/** 题解渲染器桶（katex + marked）：页面在用户点「下载」时写入，SW 只负责别清它。 */
export const MD_CACHE = 'cp-md-runtime-v1'

/**
 * 改名前的桶名 → 现在的桶名。SW 在 activate 阶段按这张表原样搬运，再删掉旧桶。
 * 外壳桶不在表里：它装的是带内容哈希的构建产物，重新预缓存本来就是升级外壳该做的事。
 */
export const LEGACY_BUCKETS = [
  ['cph-toolchain-v3', TOOLCHAIN_CACHE],
  ['cph-md-runtime-v1', MD_CACHE],
]

// ---------------------------------------------------------------- IndexedDB 库

/** 本地工作区（VFS）：nodes / contents 两个 store。 */
export const VFS_DB_NAME = 'cp-vfs'
/** 改名前的 VFS 库名，由 LocalVFSProvider 的搬运逻辑一次性读走。 */
export const LEGACY_VFS_DB_NAME = 'cph-vfs'

/** 预编译头（PCH）存档。纯缓存，下次编译能自动重建，所以旧库可以直接删掉。 */
export const PCH_DB_NAME = 'cp-pch'
/** 改名前的 PCH 库名：约 6.9MB，确认新库打开成功后静默删除。 */
export const LEGACY_PCH_DB_NAME = 'cph-pch'

// ---------------------------------------------------------------- Service Worker 注入表

/**
 * 需要出现在 Service Worker 里的常量。cp-service-worker 插件按这张表生成
 * `const <名字> = <值>` 前置到 src/sw.js 上，所以**新增 SW 要用的桶名时，
 * 在这里补一行即可**，不用改插件、也不用改 sw.js。
 *
 * 只放 SW 真正用到的：它在两个地方引用桶名 —— activate 的 keep 白名单，
 * 以及 fetch 处理器的分桶（bucketFor）。
 */
export const SERVICE_WORKER_CONSTANTS = {
  SHELL_CACHE,
  TOOLCHAIN_CACHE,
  MD_CACHE,
  LEGACY_BUCKETS,
}
