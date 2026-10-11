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

/**
 * 工具链桶：clang / wasm-ld / sysroot / CPython。
 *
 * **桶名刻意不带版本尾缀**（2026-10-01 去掉 `-v3`）：
 * 1) 它同时被当成「上一代桶」的**前缀**用 —— 卸载时要扫掉所有 `cp-toolchain*`，
 *    带尾缀的话哪怕只是换个版本号，前缀就配不上老桶了（见 runnoSandbox 的 purgeRuntimeCache）；
 * 2) 换代本来就靠资产路径自然失效（`public/wasm/<版本>/`），桶名再带版本是重复的第二套版本号。
 */
export const TOOLCHAIN_CACHE = 'cp-toolchain'

/** 题解渲染器桶（katex + marked）：页面在用户点「下载」时写入，SW 只负责别清它。 */
export const MD_CACHE = 'cp-md-runtime'

/**
 * 改名前的桶名 → 现在的桶名。SW 在 activate 阶段按这张表原样搬运，再删掉旧桶
 * ——**不搬就等于让老用户白下那 76MB**。
 *
 * 条目是「历史层积」而不是废弃代码：改名那一刻浏览器上还留着哪个旧桶，就得认这个名字。
 * 顺序无所谓（每条都会先查目标桶里有没有，不重复搬）。
 * 外壳桶不在表里：它装的是带内容哈希的构建产物，重新预缓存本来就是升级外壳该做的事。
 */
export const LEGACY_BUCKETS = [
  // 2026-10-01：去掉版本尾缀（cp-toolchain-v3 → cp-toolchain）
  ['cp-toolchain-v3', TOOLCHAIN_CACHE],
  ['cp-md-runtime-v1', MD_CACHE],
  // 2026-10-01 更早一步：去掉 `cph-` 前缀（cph-* → cp-*）
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

/**
 * Codeforces 抽题组件的缓存库：题库 / 已 AC / 账号校验。
 * 纯缓存（没有用户数据），卸载组件时整库删掉即可，**不需要 LEGACY_ 名** ——
 * 它是新增特性，没有「改名那一刻还在用旧名字」的老用户。
 */
export const CF_DB_NAME = 'cp-cf'

// ---------------------------------------------------------------- 工作区模式

/**
 * 当前工作区模式：`'vfs'`（虚拟工作区，IndexedDB）或 `'folder'`（本机文件夹，仅桌面端）。
 * 读它的是 `services/vfs/migrate.js` 的启动分岔与 `services/vfs/workspaceMode.js`。
 *
 * **绝不能进云同步白名单**：这是「这台设备此刻开着哪个目录」的事实，换台设备毫无意义。
 */
export const WORKSPACE_MODE_KEY = 'cp.workspaceMode'

/**
 * 本机文件夹工作区的根（磁盘绝对路径）。
 *
 * 与上面那条一起，**绝不进云同步白名单** —— 绝对路径换台设备就是一条不存在的路径。
 * 页面重载后由 `LocalFolderVFSProvider` 读它、再交给 Rust 的 `workspace_open` 重新授权。
 */
export const WORKSPACE_ROOT_KEY = 'cp.workspaceRoot'

// ---------------------------------------------------------------- 云端配置的「本机在跟谁」

/**
 * 本机正在跟着谁的云端配置：`{ handle, updatedAt }`。
 *
 * `updatedAt` 是**已经套用过的那一版**云端的更新时间（服务端给的 ISO 串，空串 = 不知道）。
 * 启动时拿它跟云端比，**相同就不重复套用** —— 少了这道闸门，每次打开站点都会覆盖本机一次，
 * 本机的临时改动被冲掉，而且会「套用 → 刷新 → 又套用」转不出去（那次刷新是没有条件的）。
 *
 * 与上面两条一样是**这台设备**的事实，**绝不进云同步白名单**：同步过去等于让另一台设备
 * 自动套用一份它从没认领过的配置。读写都在 `services/cloudEntry.js`
 * （`readActiveProfile` / `writeActiveProfile` / `forgetActiveProfile`）。
 */
export const CLOUD_ACTIVE_KEY = 'cp.cloudActive'

/**
 * 绑定的云端账号：`{ handle, updatedAt }`。handle 为空串 = 未绑定。
 *
 * 与「本机在跟谁」是两件事：那条记的是**现在用的是谁的配置**（导入一份公开配置也会记），
 * 这条记的是**这台设备认领了哪个用户名**（只有登录 / 验证成功才写），它决定有没有
 * 「上传本机设置 / 解绑」这两个入口。读写都在 `services/cloudSession.js`
 * （面板与齿轮菜单共用同一份会话状态，所以不再各自 `usePersistentRef` 一个）。
 */
export const CLOUD_ACCOUNT_KEY = 'cp.cloudAccount'

/**
 * 设备令牌：验证成功时由服务端签发，之后的写入不必再取码。
 *
 * 与账号一样只留在本机，且**绝不进云同步白名单**：令牌与 handle 一对一绑定，
 * 同步过去等于把别的设备的写入权也搬过来。同样读写在 `services/cloudSession.js`。
 */
export const CLOUD_TOKEN_KEY = 'cp.cloudToken'

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
