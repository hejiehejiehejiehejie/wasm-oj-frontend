/**
 * runno 的 C++ 沙箱流水线 —— 在浏览器里用 wasm 版 clang 8 + wasm-ld 编译并运行 C++。
 *
 * 为什么从 Wasmer 换成 runno（https://github.com/taybenlor/runno）：
 * @wasmer/sdk 的 clang 包（约 100MB）只要实例化到 libc++ 头（<vector> / <string>）就会在
 * cc1 的代码生成阶段永久卡死，而且 WASIX 实例没有 cancel API，只能 terminate 整个 Worker。
 * runno 走的是另一条路：binji 的 wasm-clang + 一份 sysroot tar.gz，合计约 14MB，
 * 且它的 WASIWorkerHost 提供 kill()，卡死和死循环终于能真正中断。
 *
 * 这里只做流水线：准备工具链 → clang 编译 → wasm-ld 链接 → 跑产物。
 * 阶段播报、看门狗、取消时机由 services/wasmRuntime.js 统一负责。
 *
 * 实测踩过的坑（改这段代码前先看一眼）：
 * 1. WASI 的 argv[0] 必须是程序名。漏掉它会让第一个真实参数（比如 -cc1）被当成程序名吃掉，
 *    于是 clang 跑在 driver 模式，报出来的错全是误导性的。
 * 2. cc1 的写法用 runno / binji 的原版：-emit-obj + -internal-isystem <dir>（分开写两个参数）。
 * 3. 绕开 driver 直接调 wasm-ld，就得自己带上 compiler-rt，否则 libc++ 里只要用到
 *    sort / map 就会缺 __lttf2 之类的符号。
 */
import { WASIWorkerHost } from '@runno/wasi'

// runno 的静态资源站：clang.wasm 7.5MB、wasm-ld.wasm 4.9MB、clang-fs.tar.gz 1.8MB
const ASSETS = 'https://runno.dev/langs'
const CLANG_URL = `${ASSETS}/clang.wasm`
const LINKER_URL = `${ASSETS}/wasm-ld.wasm`
const SYSROOT_URL = `${ASSETS}/clang-fs.tar.gz`

const SOURCE_PATH = '/program.cpp'
const OBJECT_PATH = '/program.o'
const BINARY_PATH = '/program.wasm'
// 万能头就放在 sysroot 的 include 目录里，clang 的 -internal-isystem /sys/include 能直接搜到
const UNIVERSAL_HEADER_PATH = '/sys/include/bits/stdc++.h'

// WASI 文件系统里的时间戳，对我们没有意义，给个固定值即可
const TIME = new Date(0)

const CLANG_ARGS = [
  '-cc1',
  '-emit-obj',
  '-disable-free',
  '-isysroot',
  '/sys',
  '-internal-isystem',
  '/sys/include/c++/v1',
  '-internal-isystem',
  '/sys/include',
  '-internal-isystem',
  '/sys/lib/clang/8.0.1/include',
  '-ferror-limit',
  '4',
  '-fmessage-length',
  '80',
  // 不要开 -fcolor-diagnostics：诊断信息会带上 ANSI 颜色码，而测试卡片是纯文本渲染
  // clang 8 的 cc1 默认只到 gnu++14，竞赛代码要 c++17（结构化绑定、if 初始化等）
  '-std=c++17',
  '-O2',
  '-o',
  OBJECT_PATH,
  '-x',
  'c++',
  SOURCE_PATH,
]

const LINKER_ARGS = [
  '--no-threads',
  '--export-dynamic',
  '-z',
  'stack-size=1048576',
  '-L/sys/lib/wasm32-wasi',
  '-L/sys/lib/clang/8.0.1/lib/wasi',
  '/sys/lib/wasm32-wasi/crt1.o',
  OBJECT_PATH,
  '-lc',
  '-lc++',
  '-lc++abi',
  '/sys/lib/clang/8.0.1/lib/wasi/libclang_rt.builtins-wasm32.a',
  '-o',
  BINARY_PATH,
]

// clang 带的是 libc++，没有 GCC 的 <bits/stdc++.h>，自己补一个同名头进去。
// 顶着这个名字就得对得起它：把竞赛里会用到、且这套 sysroot 确实有的头都列上
// （逐个核对过存在性）。线程 / 文件系统 / 正则这些在 wasm 里没意义的就没放。
const UNIVERSAL_HEADER = `#ifndef OJ_SANDBOX_BITS_STDCXX_H
#define OJ_SANDBOX_BITS_STDCXX_H
#include <iostream>
#include <iomanip>
#include <sstream>
#include <string>
#include <vector>
#include <deque>
#include <list>
#include <queue>
#include <stack>
#include <set>
#include <map>
#include <unordered_map>
#include <unordered_set>
#include <bitset>
#include <algorithm>
#include <numeric>
#include <functional>
#include <iterator>
#include <utility>
#include <tuple>
#include <array>
#include <limits>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <cctype>
#include <cassert>
#include <cstdint>
#endif
`

function wasiFile(path, content, mode = 'string') {
  return { path, content, mode, timestamps: { change: TIME, access: TIME, modification: TIME } }
}

/** 浏览器原生 gzip 解压，省掉 pako 依赖 */
async function gunzip(bytes) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('当前浏览器不支持 DecompressionStream，无法解包本地工具链')
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function readField(buffer, start, length) {
  const slice = buffer.subarray(start, start + length)
  const end = slice.indexOf(0)
  return new TextDecoder().decode(end === -1 ? slice : slice.subarray(0, end))
}

/** 极简 ustar 解析：只取普通文件（目录条目跳过），足够解 runno 的 sysroot */
function untar(buffer) {
  const fs = {}
  let files = 0
  let offset = 0
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512)
    let empty = true
    for (let i = 0; i < 512; i++) {
      if (header[i] !== 0) {
        empty = false
        break
      }
    }
    if (empty) break

    const name = readField(header, 0, 100)
    const size = parseInt(readField(header, 124, 12).trim() || '0', 8)
    const type = String.fromCharCode(header[156])
    const prefix = readField(header, 345, 155)
    const dataStart = offset + 512

    if (type === '0' || type === '\0' || type === '') {
      const raw = prefix ? `${prefix}/${name}` : name
      const path = raw.startsWith('/') ? raw : `/${raw}`
      fs[path] = wasiFile(path, buffer.slice(dataStart, dataStart + size), 'binary')
      files++
    }
    offset = dataStart + Math.ceil(size / 512) * 512
  }
  return { fs, files }
}

/**
 * 工具链只取一次：两个 wasm 二进制转成 blob: URL 挂在内存里，
 * sysroot 解包成 WASI 文件系统（416 个文件，约 8.7MB）。
 * 这样重复评测不必依赖 HTTP 缓存，也不会每次重下 12MB。
 */
let toolchain = null
let toolchainPromise = null

async function fetchBlobURL(url, label) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${label} 下载失败（HTTP ${response.status}）`)
  const bytes = await response.arrayBuffer()
  return URL.createObjectURL(new Blob([bytes], { type: 'application/wasm' }))
}

function loadToolchain(onStatus) {
  if (!toolchainPromise) {
    toolchainPromise = (async () => {
      onStatus('download', '正在获取本地工具链（clang + 链接器 + 系统头文件，约 14MB，只下一次）…')
      const [clangURL, linkerURL, sysroot] = await Promise.all([
        fetchBlobURL(CLANG_URL, 'clang'),
        fetchBlobURL(LINKER_URL, 'wasm-ld'),
        (async () => {
          const response = await fetch(SYSROOT_URL)
          if (!response.ok) throw new Error(`系统头文件下载失败（HTTP ${response.status}）`)
          return untar(await gunzip(new Uint8Array(await response.arrayBuffer())))
        })(),
      ])
      toolchain = { clangURL, linkerURL, sysroot: sysroot.fs }
      return toolchain
    })()
    // 失败时把缓存的 promise 清掉，下次点「下载」能重试
    toolchainPromise.catch(() => {
      toolchainPromise = null
    })
  }
  return toolchainPromise
}

/** 只把工具链拉到本地（不发编译任务），用于「本地运行环境」面板的下载按钮。 */
export async function preloadToolchain(onStatus = () => {}) {
  const startedAt = performance.now()
  await loadToolchain(onStatus)
  return Math.round(performance.now() - startedAt)
}

/**
 * 释放还在等 stdin 的推送循环。
 *
 * pushStdin / pushEOF 是用 0ms 定时器空转等「stdin 槽位被消费者读回 0」的。
 * 程序从头到尾不读 stdin（或者被 kill 掉）时，消费者永远不会再来，这两个循环
 * 就会一直转到页面关掉为止——每跑一个这样的用例就多一份空转。把槽位写回 0
 * 它们就立刻退出；退出后写进去的内容没有人在读，无害。
 */
function releaseStdinWaiter(host) {
  try {
    new DataView(host.stdinBuffer).setInt32(0, 0)
  } catch {
    /* 拿不到内部缓冲区就算了，最坏结果只是多两个空转定时器 */
  }
}

/**
 * 跑一个 WASI 模块，收回 stdout / stderr / 退出码，以及跑完之后的文件系统。
 * onHost 用来把当前 WASIWorkerHost 交给上层，卡死或被取消时靠它 kill()。
 */
async function runWasi(binaryURL, { name, args, fs, stdin, onHost }) {
  let stdout = ''
  let stderr = ''
  const host = new WASIWorkerHost(binaryURL, {
    // argv[0] 是程序名，不能省（见文件头的坑 1）
    args: [name, ...args],
    env: {},
    fs,
    stdout: (chunk) => {
      stdout += chunk
    },
    stderr: (chunk) => {
      stderr += chunk
    },
  })
  onHost(host)
  try {
    // 必须推 stdin 再推 EOF，否则读 stdin 的程序会一直等。
    // pushEOF 要等程序真去读 stdin 才会返回，所以这里不能 await。
    void host.pushStdin(stdin ?? '')
    void host.pushEOF()
    const result = await host.start()
    return { exitCode: result.exitCode, fs: result.fs ?? {}, stdout, stderr }
  } catch (error) {
    // 被 kill()（超时 / 取消）时 start() 会抛，而此刻已经收到的输出只活在这两个闭包变量里，
    // 挂到错误上带出去：TLE 的卡片靠它显示程序跑到哪一步。
    if (error && typeof error === 'object') {
      error.partialStdout = stdout
      error.partialStderr = stderr
    }
    throw error
  } finally {
    releaseStdinWaiter(host)
    onHost(null)
  }
}

/**
 * 编译并运行一段 C++。
 * @returns {Promise<{ stage: 'compile' | 'run', ok: boolean, exitCode: number, stdout: string, stderr: string, durationMs: number }>}
 * 工具链本身出问题（下载失败、浏览器不支持等）会抛异常，由上层翻译成 failure。
 */
export async function runCpp({ code, stdin, onStatus = () => {}, onHost = () => {} }) {
  const startedAt = performance.now()
  const tool = await loadToolchain(onStatus)

  onStatus('compile', '正在编译…')
  const compiled = await runWasi(tool.clangURL, {
    name: 'clang',
    args: CLANG_ARGS,
    fs: {
      ...tool.sysroot,
      [UNIVERSAL_HEADER_PATH]: wasiFile(UNIVERSAL_HEADER_PATH, UNIVERSAL_HEADER),
      [SOURCE_PATH]: wasiFile(SOURCE_PATH, String(code ?? '')),
    },
    onHost,
  })

  if (!compiled.fs[OBJECT_PATH]) {
    return {
      stage: 'compile',
      ok: false,
      exitCode: compiled.exitCode,
      stdout: compiled.stdout,
      stderr: compiled.stderr || '编译未通过',
      durationMs: Math.round(performance.now() - startedAt),
    }
  }

  const linked = await runWasi(tool.linkerURL, {
    name: 'wasm-ld',
    args: LINKER_ARGS,
    fs: compiled.fs,
    onHost,
  })

  const binary = linked.fs[BINARY_PATH]
  if (!binary) {
    // 链接失败在语义上还是「这段代码编译不过」，跟原来的 clang driver 表现一致
    return {
      stage: 'compile',
      ok: false,
      exitCode: linked.exitCode,
      stdout: linked.stdout,
      stderr: linked.stderr || '链接失败',
      durationMs: Math.round(performance.now() - startedAt),
    }
  }

  onStatus('run', '正在运行…')
  const binaryURL = URL.createObjectURL(new Blob([binary.content], { type: 'application/wasm' }))
  try {
    const ran = await runWasi(binaryURL, { name: 'program', args: [], fs: {}, stdin, onHost })
    return {
      stage: 'run',
      ok: ran.exitCode === 0,
      exitCode: ran.exitCode,
      stdout: ran.stdout,
      stderr: ran.stderr,
      durationMs: Math.round(performance.now() - startedAt),
    }
  } finally {
    URL.revokeObjectURL(binaryURL)
  }
}