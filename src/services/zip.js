/**
 * zip —— 最小 zip 写入器（只写不读），导出多文件 / 文件夹时用。
 *
 * 【为什么不引依赖】只有一个用途：把一批内存里的文件打成一个包交给 `<a download>` 或
 * 原生落盘。JSZip / fflate 动辄几十 KB 到上百 KB，而这里需要的东西不到 200 行
 * （见项目约定「新增依赖要先讨论」）。压缩也不必自己写：**zip 用的正是 raw deflate**，
 * 浏览器原生的 `CompressionStream('deflate-raw')` 就是它 —— Chromium 103+ / Safari 16.4+ /
 * Firefox 113+ 都已支持，判不出来时退回 store（不压缩，zip 依然完全合法）。
 *
 * 【写出的是什么】经典 zip：一串 local file header + data，末尾一份 central directory
 * 与 EOCD。刻意**不用 data descriptor**（那只在流式写、大小未知时才需要）—— 我们手里
 * 就是完整的内存数据，先把 CRC 与长度算好再写 header，结构最简单、兼容性最好。
 *
 * 【不支持的】zip64。判题工作区不可能出现 4GB 以上或 65535 个以上的条目；
 * 真撞上就**抛错**而不是静默写出一个坏包（坏包在用户眼里是「解压失败」，查起来极难）。
 */
import { t } from '../i18n/index.js'

/** 单个文件超过这个大小就放弃压缩（内存里再复制一份不划算，直接 store） */
const COMPRESS_LIMIT = 32 * 1024 * 1024

/** ZIP64 的两个上限：条目数超过 65535、或 offset / 大小超过 4GiB 就得用 zip64 结构 */
const MAX_ENTRIES = 0xffff
const MAX_UINT32 = 0xffffffff

const CRC_TABLE = buildCrcTable()

function buildCrcTable() {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
}

/**
 * @param {Uint8Array} bytes
 * @returns {number}
 */
function crc32(bytes) {
  let value = 0xffffffff
  for (let index = 0; index < bytes.length; index += 1) {
    value = CRC_TABLE[(value ^ bytes[index]) & 0xff] ^ (value >>> 8)
  }
  return (value ^ 0xffffffff) >>> 0
}

/**
 * MS-DOS 的日期 / 时间格式（zip header 用的就是它，1980 年起算、秒只有 2 秒精度）。
 * @param {Date} date
 * @returns {{ time: number, date: number }}
 */
function dosStamp(date) {
  const year = Math.max(1980, date.getFullYear())
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

/** 能力探测：有没有 raw deflate。探过一次就记住（同一次会话里不会变） */
let deflateSupport = null

function supportsDeflate() {
  if (deflateSupport === null) {
    deflateSupport = typeof CompressionStream === 'function'
  }
  return deflateSupport
}

/**
 * raw deflate 一段数据；任何一步失败都回 null，由调用方退回 store。
 * @param {Uint8Array} bytes
 * @returns {Promise<Uint8Array|null>}
 */
async function deflateRaw(bytes) {
  if (!supportsDeflate() || bytes.length === 0 || bytes.length > COMPRESS_LIMIT) return null
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))
    const packed = new Uint8Array(await new Response(stream).arrayBuffer())
    // 压不小就用 store：zip 允许同一条目换方法，没必要为一个更长的结果多写 8 字节的头部开销
    return packed.length < bytes.length ? packed : null
  } catch {
    return null
  }
}

/**
 * 一个待写入 zip 的条目。
 * @typedef {Object} ZipEntry
 * @property {string} path zip 内的相对路径（正斜杠分隔）。**目录条目以 `/` 结尾**且不带 data
 * @property {Uint8Array} [data] 文件内容；目录条目省略
 * @property {Date} [mtime] 条目的修改时间，缺省用当前时刻
 */

/**
 * 把若干条目打成一个 zip。
 *
 * 调用方负责给出**已经拍平**的条目列表（含中间目录的空条目 —— 这样解压时空目录不会丢），
 * 顺序即 zip 内的顺序，本函数不改动它。
 *
 * @param {ZipEntry[]} entries
 * @returns {Promise<Blob>}
 */
export async function buildZip(entries) {
  if (entries.length > MAX_ENTRIES) throw new Error(t('error.zipTooManyEntries', { max: MAX_ENTRIES }))

  const encoder = new TextEncoder()
  const now = new Date()
  /** @type {{ name: Uint8Array, method: number, crc: number, raw: Uint8Array, packed: Uint8Array|null, stamp: {time:number,date:number}, offset: number }[]} */
  const prepared = []

  let offset = 0
  for (const entry of entries) {
    const name = encoder.encode(entry.path)
    const isDirectory = entry.path.endsWith('/')
    const raw = isDirectory ? new Uint8Array(0) : (entry.data ?? new Uint8Array(0))
    const packed = isDirectory ? null : await deflateRaw(raw)
    const stamp = dosStamp(entry.mtime ?? now)
    // 目录条目的 CRC 与两个长度都是 0（写进去会被多数工具忽略，但规范如此）
    prepared.push({
      name,
      method: packed ? 8 : 0,
      crc: isDirectory ? 0 : crc32(raw),
      raw,
      packed,
      stamp,
      offset,
    })
    offset += 30 + name.length + (packed ? packed.length : raw.length)
  }

  const centralSize = prepared.reduce((total, item) => total + 46 + item.name.length, 0)
  const total = offset + centralSize + 22
  if (offset > MAX_UINT32 || centralSize > MAX_UINT32) throw new Error(t('error.zipTooLarge'))

  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  let cursor = 0

  // ---------------------------------------------------------------- local headers
  for (const item of prepared) {
    const size = item.packed ? item.packed.length : item.raw.length
    view.setUint32(cursor, 0x04034b50, true) // local file header
    view.setUint16(cursor + 4, 20, true) // version needed to extract
    view.setUint16(cursor + 6, 0x0800, true) // flags：bit 11 = 文件名是 UTF-8
    view.setUint16(cursor + 8, item.method, true)
    view.setUint16(cursor + 10, item.stamp.time, true)
    view.setUint16(cursor + 12, item.stamp.date, true)
    view.setUint32(cursor + 14, item.crc, true)
    view.setUint32(cursor + 18, size, true)
    view.setUint32(cursor + 22, item.raw.length, true)
    view.setUint16(cursor + 26, item.name.length, true)
    view.setUint16(cursor + 28, 0, true) // extra length
    out.set(item.name, cursor + 30)
    cursor += 30 + item.name.length
    const body = item.packed ?? item.raw
    out.set(body, cursor)
    cursor += body.length
  }

  // ---------------------------------------------------------------- central directory
  const centralStart = cursor
  for (const item of prepared) {
    const size = item.packed ? item.packed.length : item.raw.length
    view.setUint32(cursor, 0x02014b50, true) // central directory header
    view.setUint16(cursor + 4, 20, true) // version made by
    view.setUint16(cursor + 6, 20, true) // version needed
    view.setUint16(cursor + 8, 0x0800, true)
    view.setUint16(cursor + 10, item.method, true)
    view.setUint16(cursor + 12, item.stamp.time, true)
    view.setUint16(cursor + 14, item.stamp.date, true)
    view.setUint32(cursor + 16, item.crc, true)
    view.setUint32(cursor + 20, size, true)
    view.setUint32(cursor + 24, item.raw.length, true)
    view.setUint16(cursor + 28, item.name.length, true)
    view.setUint16(cursor + 30, 0, true) // extra
    view.setUint16(cursor + 32, 0, true) // comment
    view.setUint16(cursor + 34, 0, true) // disk number start
    view.setUint16(cursor + 36, 0, true) // internal attributes
    view.setUint32(cursor + 38, 0, true) // external attributes
    view.setUint32(cursor + 42, item.offset, true)
    out.set(item.name, cursor + 46)
    cursor += 46 + item.name.length
  }

  // ---------------------------------------------------------------- EOCD
  view.setUint32(cursor, 0x06054b50, true)
  view.setUint16(cursor + 4, 0, true) // 本磁盘号
  view.setUint16(cursor + 6, 0, true) // central directory 所在磁盘号
  view.setUint16(cursor + 8, prepared.length, true)
  view.setUint16(cursor + 10, prepared.length, true)
  view.setUint32(cursor + 12, centralSize, true)
  view.setUint32(cursor + 16, centralStart, true)
  view.setUint16(cursor + 20, 0, true) // 注释长度

  return new Blob([out], { type: 'application/zip' })
}
