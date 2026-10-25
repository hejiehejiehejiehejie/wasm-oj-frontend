/**
 * 给 `@runno/wasi` 的 WASI 宿主补三处上游缺的东西：正确的时钟、运行结果里的
 * 「证据字段」（trap 原因 / 运行段墙钟 / 线性内存字节数 / sbrk 失败次数），以及
 * 「缺文件返回 ENOENT」—— 最后一条是 23.1.0 内核的硬前提，见下面 PATH_REPLACEMENTS。
 *
 * 【要解决的问题】上游 0.10.0（已是最新版）的 `clock_time_get` 四种 clock id 一律回 `new Date()`
 * ——毫秒级**墙上**时钟，`clock_res_get` 一律回 1e6 ns。于是站内跑的用户代码里：
 *   - `chrono::steady_clock` 只有 1ms 粒度，微秒 / 纳秒读数永远是 1000 的整数倍；
 *   - 「单调时钟」其实跟着系统时钟跳（实测 CLOCK_REALTIME 与 CLOCK_MONOTONIC 同一个 tv_sec）。
 * 这是上游的实现，不是我们这边配错了什么。
 *
 * 【为什么改的是 node_modules 里的一段字符串】真正跑用户程序的是 `@runno/wasi` **内联**在
 * `dist/main.js` 里的那份 worker 源码（单引号包裹的转义字符串 + `new Blob([...])`）：
 *   - `WASIWorkerHost` 的 context 选项（fs / args / env / debug…）碰不到 WASI 方法的实现；
 *   - debug 钩子 `function St(e,t,i,n){…;return i}` 原样返回 errno，改不了结果；
 *   - 那份 worker 的 Blob 在模块加载时就造好了，运行时再换 `URL.createObjectURL` 来不及；
 *   - 实例化时是 `this.clock_time_get.bind(this)`，所以**事后**往 prototype 上覆盖也没用
 *     （这是第一版脚本的写法，已弃）。
 * 只剩源码这一层可动：把那两个方法的实现整段替换掉。替换体只用当前作用域里已有的名字
 * （`C` 是 clock id 枚举、`s` 是 errno 枚举），不引入新全局。
 *
 * 【口径】REALTIME = 墙上时间（`Date.now()`，报 1ms 粒度）；MONOTONIC 与两个 CPU 时钟 =
 * `performance.timeOrigin + performance.now()`（微秒级、不受系统时钟影响，报 1µs 粒度）。
 * CPU 时钟浏览器给不了真正的 CPU 时间，退化到单调钟是各家浏览器 WASI 运行时的通行做法。
 * 分开算再加（`timeOrigin` 取整毫秒 + `now()` 换纳秒），不把两个数量级差很多的浮点数相加 ——
 * 直接相加会掉到 ~0.5µs 的量化台阶上。本站是跨域隔离的（`vite.config.js` 的 COOP/COEP），
 * `performance.now()` 拿到的是高精度值。
 *
 * 【dev 服务器额外一步】Vite 会把 `@runno/wasi` 预打包进 `node_modules/.vite/deps/`，而它的
 * 缓存键是 lockfile + 配置哈希，**不含 node_modules 里的文件内容**。只改源码的话 dev 依旧跑旧的那份，
 * 所以打完补丁要把这个缓存目录删掉，让 Vite 下次启动按打过补丁的源码重新打包（纯生成物，删了自愈）。
 * `vite build` 走 Rollup 直读源码，不受这一步影响。
 *
 * 【失败怎么办】`--check` 模式给 verify / CI 用；锚点对不上就直接非零退出，
 * 绝不静默放过（升级 `@runno/wasi` 后上游一改形状，这里必须当场响）。
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import process from 'node:process'
import path from 'node:path'

const require = createRequire(import.meta.url)

// 注意不能用 `require.resolve('@runno/wasi/dist/main.js')`：这个包只导出 `.`，
// 子路径会被 ERR_PACKAGE_PATH_NOT_EXPORTED 挡掉。裸包名走 "default" 条件，落的就是 dist/main.js。
const TARGET = require.resolve('@runno/wasi')

if (!TARGET.endsWith(`${path.sep}dist${path.sep}main.js`)) {
  throw new Error(`@runno/wasi 解析到的不是 dist/main.js：${TARGET}\n上游改了入口布局，请重新核对。`)
}

/** 本补丁的签名，出现即说明已经打过 */
const PATCH_TAG = 'cp-clock-patch'
/** 结果元数据补丁的签名 */
const RESULT_PATCH_TAG = 'cp-result-patch'
/** 缺文件 errno 补丁的签名 */
const PATH_PATCH_TAG = 'cp-enoent-patch'

/**
 * 结果元数据补丁（判定规范 §4.2 / §5.2）。
 *
 * worker 原来只回 `{exitCode, fs}`：trap 原因丢了、`_start` 的起止时刻也拿不到，于是
 * 「内存分配失败」只能靠「134 + 空 stderr」猜。这里加两处：
 *   - 在 start 之前插入 `__cpr()`：读完导出函数 `__oj_sbrk_get()`（链接期探针给的
 *     memory.grow 失败次数）、`memory.buffer.byteLength`、trap 文本与 `_start` 墙钟，
 *     拼进返回对象；WASIWorkerHost 原样把 result 透传回主线程。
 *   - 把三处 return 换成 `this.__cpr(...)`，并在 `_start` 前记一个时间戳。
 * 替换体同样**不出现单引号与反斜杠**（它待在外层单引号字符串里），也不引入新名字之外的全局。
 */
const RESULT_REPLACEMENTS = [
  {
    name: 'start 结果元数据 helper',
    from: '}}start(t,i={}){if(this.hasBeenInitialized)',
    to:
      '}}__cpr(t,i,r){/*' +
      RESULT_PATCH_TAG +
      '*/let e=null;try{e=this.instance&&this.instance.exports.__oj_sbrk_get?this.instance.exports.__oj_sbrk_get()|0:null}catch{e=null}return{exitCode:t,fs:this.drive.fs,trap:i?String(i):void 0,runMs:r?Math.round(performance.now()-r):null,memoryBytes:this.memory?this.memory.buffer.byteLength:0,sbrkFailures:e}}start(t,i={}){if(this.hasBeenInitialized)',
  },
  {
    name: 'start 计时与 trap 原因',
    from: 'const n=this.instance.exports._start;try{n()}catch(r){if(r instanceof Q)return{exitCode:r.code,fs:this.drive.fs};if(r instanceof WebAssembly.RuntimeError)return{exitCode:134,fs:this.drive.fs};throw r}return{exitCode:0,fs:this.drive.fs}}',
    to: 'const n=this.instance.exports._start,a=performance.now();try{n()}catch(r){if(r instanceof Q)return this.__cpr(r.code,0,a);if(r instanceof WebAssembly.RuntimeError)return this.__cpr(134,r,a);throw r}return this.__cpr(0,0,a)}',
  },
]

/**
 * 待替换的时钟实现，逐字取自 `@runno/wasi@0.10.0` 内联 worker 源码。
 * 替换体里不出现单引号、反斜杠与真空行 —— 它要安全地待在一个单引号字符串里。
 */
const CLOCK_REPLACEMENTS = [
  {
    name: 'clock_res_get',
    from: 'clock_res_get(t,i){switch(t){case C.REALTIME:case C.MONOTONIC:case C.PROCESS_CPUTIME_ID:case C.THREAD_CPUTIME_ID:return new DataView(this.memory.buffer).setBigUint64(i,BigInt(1e6),!0),s.SUCCESS}return s.EINVAL}',
    to: 'clock_res_get(t,i){/*' + PATCH_TAG + '*/let a;if(t===C.REALTIME)a=BigInt(1e6);else{if(t!==C.MONOTONIC&&t!==C.PROCESS_CPUTIME_ID&&t!==C.THREAD_CPUTIME_ID)return s.EINVAL;a=BigInt(1e3)}return new DataView(this.memory.buffer).setBigUint64(i,a,!0),s.SUCCESS}',
  },
  {
    name: 'clock_time_get',
    from: 'clock_time_get(t,i,n){switch(t){case C.REALTIME:case C.MONOTONIC:case C.PROCESS_CPUTIME_ID:case C.THREAD_CPUTIME_ID:return new DataView(this.memory.buffer).setBigUint64(n,w(new Date),!0),s.SUCCESS}return s.EINVAL}',
    to:
      'clock_time_get(t,i,n){/*' +
      PATCH_TAG +
      '*/let a;if(t===C.REALTIME)a=BigInt(Date.now())*BigInt(1e6);else{if(t!==C.MONOTONIC&&t!==C.PROCESS_CPUTIME_ID&&t!==C.THREAD_CPUTIME_ID)return s.EINVAL;a=BigInt(Math.round(performance.timeOrigin))*BigInt(1e6)+BigInt(Math.round(performance.now()*1e6))}return new DataView(this.memory.buffer).setBigUint64(n,a,!0),s.SUCCESS}',
  },
]

/**
 * 缺文件 errno 补丁（2026-10-25，阶段 2 换新内核时踩到）。
 *
 * 上游 `@runno/wasi` 的 in-memory drive 在 `path_open` / `pathStat` 找不到文件时返回
 * `ENOTCAPABLE`（"capabilities insufficient"），而正确的 WASI 语义是 `ENOENT`。
 * clang 的 `__has_include(<features.h>)` 之类的探测会打开一堆**可选头**，拿到
 * ENOTCAPABLE 时 clang 23 直接报 `fatal error: cannot open file ... Capabilities insufficient`
 * （Node 的 `node:wasi` 返回 ENOENT，所以 `verify.mjs` 里同样的 sysroot 一切正常）。
 *
 * 不补这个，新内核在 runno 里连 `<cstdio>` 都过不去；补成 ENOENT 后 `__has_include`
 * 正常退化成 false。替换体同样不能出现单引号 / 反斜杠（它待在外层字符串里）。
 */
const PATH_REPLACEMENTS = [
  {
    name: 'path_open 缺文件返回 ENOENT',
    from: 'return[s.ENOTCAPABLE]}}close(t)',
    to: '/*' + PATH_PATCH_TAG + '*/return[s.ENOENT]}}close(t)',
  },
  {
    name: 'pathStat 缺文件返回 ENOENT',
    from: 'else return[s.ENOTCAPABLE]}',
    to: 'else return[s.ENOENT]}',
  },
]

const REPLACEMENTS = [...CLOCK_REPLACEMENTS, ...RESULT_REPLACEMENTS, ...PATH_REPLACEMENTS]

/** Vite 的依赖预打包缓存 —— 键里没有 node_modules 的文件内容，改完必须让它重来 */
function dropViteDepsCache() {
  // dist/ → @runno/wasi/ → node_modules/.vite/deps
  const depsDir = path.resolve(path.dirname(TARGET), '../../../.vite/deps')

  if (!existsSync(depsDir)) return false

  // 删掉了下次 dev 会自动重建（`_metadata.json` 就在 deps/ 里面），这里只报「清没清」
  rmSync(depsDir, { recursive: true, force: true })

  return true
}

function build() {
  const source = readFileSync(TARGET, 'utf8')
  // 判「打没打过」只认替换体：打过之后 `from` 按设计就不存在了，拿它当幂等依据会自己骗自己
  const missing = REPLACEMENTS.filter(({ to }) => !source.includes(to))

  if (!missing.length) {
    console.log('[patch-wasi-clock] 已打过，跳过')

    return
  }

  let patched = source

  for (const { name, from, to } of missing) {
    const at = patched.indexOf(from)

    if (at === -1) {
      throw new Error(
        `@runno/wasi 的 ${name} 锚点对不上：${TARGET}\n` +
          '上游大概改过这段实现（或换了 minify 形状）。请重新核对再改本脚本，别直接删掉本脚本。',
      )
    }

    if (patched.indexOf(from, at + 1) !== -1) {
      throw new Error(`@runno/wasi 里 ${name} 的锚点出现多次，替换不安全`)
    }

    patched = patched.slice(0, at) + to + patched.slice(at + from.length)
  }

  writeFileSync(TARGET, patched)

  const cleared = dropViteDepsCache()

  console.log(`[patch-wasi-clock] 已给 ${TARGET} 的 worker 源码打上宿主补丁（时钟 + 结果元数据）${cleared ? '（并清掉 Vite 预打包缓存）' : ''}`)
}

function check() {
  const source = readFileSync(TARGET, 'utf8')
  const missing = REPLACEMENTS.filter(({ to }) => !source.includes(to)).map(({ name }) => name)

  if (missing.length) {
    console.error(
      `[patch-wasi-clock] 宿主补丁不在 @runno/wasi 里（缺 ${missing.join(' / ')}），跑一下 npm run wasi:clock-patch`,
    )

    process.exitCode = 1

    return
  }

  console.log('[patch-wasi-clock] 宿主补丁在位')
}

if (process.argv.includes('--check')) {
  check()
} else {
  build()
}
