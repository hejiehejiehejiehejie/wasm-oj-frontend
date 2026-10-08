/**
 * workspaceSidecar —— 本机文件夹工作区的元数据侧车（工作区根下的 `.unnamed/`）。
 *
 * 【为什么要有侧车】真实目录里没有地方存放「这套 IDE 自己认出来的东西」：文件本身只有正文，
 * 而题目链接、难度、抓到的样例这些必须落在某处。落进 `.unnamed/` 有两个好处：
 * 它点开头，因此**既不在文件树里、也不会被扫描收录**（见 ignoreRules.js 的 DIR_DENY）；
 * 又跟着工作区走 —— 换台机器把目录拷过去，题目信息一起过去。
 *
 * 三个文件：
 *   ids.json     { version:1, paths: { <relPath>: <uuid> } }   路径键
 *   meta.json    { version:1, byId:  { <uuid>: {url,oj,difficulty,date} } }
 *   config.json  { version:1, byId:  { <uuid>: {…抓题原文，含 samples} } }
 *
 * 【为什么 ids 按路径键、meta/config 按 id 键】rename / move 时只需要在 `ids.json` 里做
 * 一次前缀改写（一个文件、一处），meta / config 完全不动。这样既保证 id 跨重启稳定
 * （页签会话恢复要用），又保证 rename 后 id 不变（页签、Monaco model、undo 栈不被打断）。
 *
 * 【写盘纪律】所有写入走**单条串行 Promise 链**去抖合并、按需落盘（只写脏了的那几个文件），
 * 最后交给 Rust 的 `fs_write`（temp + rename 原子替换）。
 *
 * 【启动容错】读不到 / 坏 JSON 一律按空处理，绝不阻断启动 —— 最坏的结果只是
 * 页签会话的 id 重新分配（会话按工作区分桶，重新分配只会让上次的页签失效一次）。
 */
import { invoke } from '@tauri-apps/api/core'

/** 侧车目录名：点开头，因此树与沙箱都看不见它 */
export const SIDECAR_DIR = '.unnamed'
const IDS_REL = `${SIDECAR_DIR}/ids.json`
const META_REL = `${SIDECAR_DIR}/meta.json`
const CONFIG_REL = `${SIDECAR_DIR}/config.json`

/** @type {Map<string, string> | null} rel（相对根的 POSIX 路径）→ 稳定 uuid */
let paths = null
/** @type {Map<string, object> | null} uuid → 题目元数据（url / oj / difficulty / date） */
let metaById = null
/** @type {Map<string, object> | null} uuid → 抓题配置（含 samples） */
let configById = null

/** 串行写入链：保证同一时刻只有一个落盘在跑，且顺序与调用顺序一致 */
let chain = Promise.resolve()
/** 哪些文件有未落盘的改动（去抖合并用） */
let dirty = { ids: false, meta: false, config: false }
/** 已有一轮写入排在链上（再多改动只置脏位，等它跑完一起写） */
let scheduled = false

function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

/** 读一个文件。不存在（首次打开）与读失败都当「没有」，不抛。 */
async function readRaw(rel) {
  try {
    const result = await invoke('fs_read', { rel })
    return { exists: true, raw: String(result?.content ?? '') }
  } catch {
    return { exists: false, raw: '' }
  }
}

/** 只收「值是对象」的条目，坏数据直接跳过（宁可少一条，不让整份文件作废） */
function objectMap(source) {
  const map = new Map()
  if (!source || typeof source !== 'object') return map
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object') map.set(key, value)
  }
  return map
}

/**
 * 载入三个侧车文件。
 * @returns {Promise<boolean>} 有文件在但解析失败时回 false（调用方提示一次），其余回 true
 */
export async function initSidecar() {
  paths = new Map()
  metaById = new Map()
  configById = new Map()
  let ok = true

  const ids = await readRaw(IDS_REL)
  if (ids.exists) {
    try {
      const source = JSON.parse(ids.raw)?.paths
      if (source && typeof source === 'object') {
        for (const [rel, id] of Object.entries(source)) {
          if (typeof id === 'string' && id) paths.set(rel, id)
        }
      }
    } catch {
      ok = false
    }
  }

  const meta = await readRaw(META_REL)
  if (meta.exists) {
    try {
      metaById = objectMap(JSON.parse(meta.raw)?.byId)
    } catch {
      ok = false
    }
  }

  const config = await readRaw(CONFIG_REL)
  if (config.exists) {
    try {
      configById = objectMap(JSON.parse(config.raw)?.byId)
    } catch {
      ok = false
    }
  }

  return ok
}

/**
 * 扫描后对账：新出现的 rel 分配 uuid、已消失的 rel 连同它的 meta / config 一起回收。
 * 这就是「外部新建的文件」拿到 id 的地方（扫描结果与内存索引求差）。
 * @param {string[]} rels 本次扫描到的全部相对路径
 * @returns {Map<string, string>} rel → id 的快照
 */
export function reconcile(rels) {
  if (!paths) paths = new Map()
  const present = new Set(rels)
  let changed = false

  for (const rel of present) {
    if (!paths.has(rel)) {
      paths.set(rel, newId())
      changed = true
    }
  }
  // GC 孤儿：文件已被外部删掉，它的 id 与 meta / config 一起作废
  for (const rel of [...paths.keys()]) {
    if (!present.has(rel)) {
      dropId(paths.get(rel))
      paths.delete(rel)
      changed = true
    }
  }

  if (changed) markDirty('ids')
  return new Map(paths)
}

/**
 * 新建节点：分配一个新 id 并登记。
 * @param {string} rel
 * @returns {string}
 */
export function assignId(rel) {
  if (!paths) paths = new Map()
  const id = newId()
  paths.set(rel, id)
  markDirty('ids')
  return id
}

/**
 * 改名 / 移动：把整棵子树的 rel 前缀一次性改写（**id 全部保留**，meta / config 无需改动）。
 * @param {string} fromRel
 * @param {string} toRel
 */
export function renamePrefix(fromRel, toRel) {
  if (!paths || !fromRel || !toRel || fromRel === toRel) return
  const prefix = `${fromRel}/`
  /** @type {Array<[string, string, string]>} 旧 rel → 新 rel → id */
  const moved = []
  for (const [rel, id] of paths) {
    if (rel === fromRel) moved.push([rel, toRel, id])
    else if (rel.startsWith(prefix)) moved.push([rel, toRel + rel.slice(fromRel.length), id])
  }
  if (!moved.length) return
  // 先摘旧的再落新的：新 key 有可能与某个旧 key 相交（如 A → A/A），先删后建不会互相覆盖
  for (const [oldRel] of moved) paths.delete(oldRel)
  for (const [, newRel, id] of moved) paths.set(newRel, id)
  markDirty('ids')
}

/**
 * 删除：把该 rel 及其全部后代从表里摘掉（连带 meta / config）。
 * @param {string} rel
 */
export function removePrefix(rel) {
  if (!paths) return
  const prefix = `${rel}/`
  let changed = false
  for (const key of [...paths.keys()]) {
    if (key === rel || key.startsWith(prefix)) {
      dropId(paths.get(key))
      paths.delete(key)
      changed = true
    }
  }
  if (changed) markDirty('ids')
}

// ------------------------------------------------------------ meta / config 读写

/**
 * 某个节点 id 上的题目元数据；没有则 undefined。
 * @param {string} id
 */
export function getMeta(id) {
  return metaById?.get(id)
}

/**
 * 某个节点 id 上的抓题配置（含 samples）；没有则 undefined。
 * @param {string} id
 */
export function getConfig(id) {
  return configById?.get(id)
}

/**
 * 写元数据。传 null / 空对象表示清除（不在文件里留空壳）。
 * @param {string} id
 * @param {object|null} meta
 */
export function setMeta(id, meta) {
  if (!metaById || !id) return
  if (meta && typeof meta === 'object' && Object.keys(meta).length) metaById.set(id, meta)
  else metaById.delete(id)
  markDirty('meta')
}

/**
 * 写抓题配置。传 null / 空对象表示清除。与 setMeta 各占一个文件，互不覆盖。
 * @param {string} id
 * @param {object|null} config
 */
export function setConfig(id, config) {
  if (!configById || !id) return
  if (config && typeof config === 'object' && Object.keys(config).length) configById.set(id, config)
  else configById.delete(id)
  markDirty('config')
}

/**
 * 等待所有已排队的写入落盘（切走工作区前调用，避免丢掉最后一批改动）。
 * @returns {Promise<void>}
 */
export function flushSidecar() {
  return chain.catch(() => {})
}

// ------------------------------------------------------------ 落盘

/** 某个 id 作废时，连带清掉它的 meta / config */
function dropId(id) {
  if (!id) return
  if (metaById?.delete(id)) markDirty('meta')
  if (configById?.delete(id)) markDirty('config')
}

function markDirty(kind) {
  dirty[kind] = true
  scheduleWrite()
}

/** 去抖合并：已有一轮排在链上就只置脏位，等它跑完把脏位一起写 */
function scheduleWrite() {
  if (scheduled) return
  scheduled = true
  chain = chain
    .then(async () => {
      scheduled = false
      const batch = dirty
      dirty = { ids: false, meta: false, config: false }
      await writeAll(batch)
    })
    .catch(() => {
      scheduled = false
    })
}

/**
 * 按需落盘。失败不抛：把该文件的脏位重新置上，留给下一轮改动一起重试
 * （不在这里立刻重排，免得磁盘持续失败时打成死循环）。
 * @param {{ ids: boolean, meta: boolean, config: boolean }} batch
 */
async function writeAll(batch) {
  if (!paths) return
  const jobs = []
  if (batch.ids) jobs.push(['ids', IDS_REL, { version: 1, paths: Object.fromEntries(paths) }])
  if (batch.meta) jobs.push(['meta', META_REL, { version: 1, byId: Object.fromEntries(metaById) }])
  if (batch.config) jobs.push(['config', CONFIG_REL, { version: 1, byId: Object.fromEntries(configById) }])
  if (!jobs.length) return

  try {
    await invoke('fs_mkdir', { rel: SIDECAR_DIR })
  } catch {
    /* 目录已在：正常路径，忽略 */
  }
  for (const [kind, rel, data] of jobs) {
    try {
      await invoke('fs_write', { rel, content: JSON.stringify(data) })
    } catch {
      dirty[kind] = true
    }
  }
}
