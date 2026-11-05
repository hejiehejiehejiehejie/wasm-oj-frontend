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
 * - 工具链 / 渲染器桶：**刻意不带外壳版本号**。换版本靠资产路径失效，但两者细节不同：
 *   工具链的路径本身带版本（`public/wasm/<版本>/`），换代 = 换 URL = 旧条目自然失效；
 *   渲染器的文件是固定名（`/md/katex.min.js`），版本只写在 `assets.json` 里，所以换代时
 *   多出来的旧文件由 `mdRuntime` 下载时按清单清扫（见其 `pruneStaleMdAssets`）。
 *   桶名再跟外壳版本走，只会让「升一次外壳把 76MB 工具链一起清掉」这种事故重演。
 * - LEGACY_*：改名前的旧名字。它们是**不可删的契约点** —— 不写出旧名字，就没法把
 *   改名那一刻还在用旧版本的用户的数据搬过来。删掉等于让他们丢工作区 / 重下 76MB。
 *
 * 【Service Worker 怎么办】
 * SW 是 classic worker，没有 `import`，读不到这个模块。所以它需要的那几个常量由
 * vite.config.js 的 cp-service-worker 插件在构建期生成一段 `const …` 前置到
 * src/sw.js 上，来源就是下面的 SERVICE_WORKER_CONSTANTS。
 */

// ---------------------------------------------------------------- Cache Storage 桶

/**
 * 外壳版本号：**发版时改这一行**。升它会让旧外壳桶在 SW activate 阶段被清掉。
 *
 * v4 → v5（2026-10-15）：站点图标（`/favicon.svg`、`/favicon.ico`、`/icons/*.png`）从
 * `sw.js` 的 `STATIC_ASSETS` 里摘了出去、改由 fetch 放行给网络（见 `sw.js` 文件头边界 5）。
 * 升版本是为了把旧桶里那 7 条「再没有任何代码按这个 key 去取」的图标记录一并清掉 ——
 * 光摘条目不升也能跑（那几条只是死数据），但这次同时动了外壳缓存的内容，按硬约束表
 * 那条「改外壳缓存内容或策略就升」一起升。
 *
 * v5 → v6（2026-10-25）：外壳桶的回收从「只按 `/assets/` 清」扩成「按 `/retain-manifest.json`
 * 清不在清单里的条目」（见 sw.js 的 `pruneStaleShellArtifacts`）。这一版**必须**升：v5 桶里
 * 已经攒下的那些残骸，有新判据也认不出来的（`/<handle>` 入口页、10-15 之前那批图标条目、
 * 历年 `/assets/` 那 165MB），只有整桶删一次才能一次清空。
 *
 * 之后再改回收判据就不必再升 —— 只要「该留哪些」仍由清单驱动（`retain-manifest`），
 * 桶里不会留下判据够不着的东西。2026-11-06 把判据从「三类版本前缀」放成「清单之外全删」
 * 时就没有升版本：同一个 buildId 的下一次发版 activate 会照常跑这一趟。
 */
const SHELL_VERSION = 'v6'

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

// ---------------------------------------------------------------- 界面浮层

/**
 * 悬浮倒计时卡：窗口位置 / 尺寸 / 锁定态 / 计时现场。
 *
 * 与工作区模式那两条同一性质 —— 是**这台设备此刻**的事实（窗口摆哪、屏幕多大），
 * **绝不进云同步白名单**。读写都在 `services/countdown.js`。
 */
export const COUNTDOWN_KEY = 'cp.countdown'

// ---------------------------------------------------------------- 跨刷新的一次性通知

/**
 * 「刷新前寄下的那条通知」，存在 **sessionStorage**（不是 localStorage，全站唯一的
 * sessionStorage 用途）。
 *
 * 云端导入与登录成功都是**办完整页刷新**的（设置散在各单例里，逐个通知不如整页重来，
 * 见 cloudSession 的 adoptCloud），可通知只活在内存里 —— 刷新前发出去等于没发。
 * 于是那一条先寄存在这里，由下次启动的 `flushFlashNotification()` 补发并立即删除。
 *
 * 为什么是 sessionStorage：它只该跨过这一次同页签刷新，随页签关掉一起消失。
 * 换成 localStorage，用户下周打开站点会忽然弹出一条「导入成功」。
 */
export const FLASH_NOTICE_KEY = 'cp.flashNotice'

/**
 * 站内报名成功的比赛（`{ id, name, startMs, durationMs }` 数组）：T-10 分钟提醒的数据源。
 *
 * 报名状态本身是扩展读 CF 页面得来的「此刻快照」，拿不到「哪一场什么时候开赛」；
 * 只有走站内报名（CfContestSchedule 的 submitEntry）才同时握有 id / 名字 / 时刻，
 * 所以在这里记一笔，刷新 / 重开站点后由 cfStartReminder 扫它补排定时器。
 *
 * 与工作区模式那几条同一性质 —— 是**这台设备**上的事实（在**这台设备上**报的名），
 * **绝不进云同步白名单**：同步过去等于让另一台设备弹它从没报过的比赛的提醒。
 * 读写都在 `services/cfStartReminder.js`（记录在报名成功那一刻，清理在每次读写时）。
 */
export const CF_REGISTERED_CONTESTS_KEY = 'cp.cfRegisteredContests'

/**
 * 这台设备上开过的虚拟参赛（`{ id, name, startMs, durationMs }` 数组）。
 *
 * VP 在 `contest.list` 里看不出来（那一场永远显示「已结束」），而赛程要把它摆到 VP 开始的
 * 那一刻、开赛前锁题，所以需要单独记一笔。站内开的当场记；别处开的由扩展从 CF 的
 * 「Recent virt. contests」读回来。与上一条同一性质 —— **本机事实，绝不进云同步白名单**。
 * 读写都在 `services/cfVirtualContest.js`。
 */
export const CF_VIRTUAL_CONTESTS_KEY = 'cp.cfVirtualContests'

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
