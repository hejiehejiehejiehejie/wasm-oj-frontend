/**
 * 极简 ustar 解析 —— 只给阶段 4 的 C++ 宿主用。
 *
 * 输入是**已经解压好的 tar 字节**（`.br` 由浏览器按 `Content-Encoding: br` 透明解开），
 * 输出 `{ [绝对路径]: Uint8Array }`，形状正好是 `MemoryFs` 的 `files`。
 *
 * 为什么不用现成的 tar 包：我们只需要「普通文件 + prefix」这一小块，1385 条、15.57 MiB，
 * 多一个依赖不如多这 40 行。目录条目跳过，`..` 交给 `MemoryFs.normalizePath` 处理。
 */

const decoder = new TextDecoder()

function readField(buffer, start, length) {
  const slice = buffer.subarray(start, start + length)
  const end = slice.indexOf(0)
  return decoder.decode(end === -1 ? slice : slice.subarray(0, end))
}

/**
 * @param {Uint8Array} buffer
 * @returns {{ files: Record<string, Uint8Array>, count: number }}
 */
export function untarFiles(buffer) {
  if (buffer.length < 512 || readField(buffer, 257, 5) !== 'ustar') {
    throw new Error('sysroot 不是 tar（检查响应的 Content-Encoding: br）')
  }
  const files = {}
  let count = 0
  let offset = 0
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512)
    let empty = true
    for (let i = 0; i < 512; i += 1) {
      if (header[i] !== 0) {
        empty = false
        break
      }
    }
    if (empty) break

    const name = readField(header, 0, 100)
    const size = Number.parseInt(readField(header, 124, 12).trim() || '0', 8)
    const type = String.fromCharCode(header[156])
    const prefix = readField(header, 345, 155)
    const dataStart = offset + 512

    if (type === '0' || type === '\0' || type === '') {
      const raw = prefix ? `${prefix}/${name}` : name
      const path = raw.startsWith('/') ? raw : `/${raw}`
      files[path] = buffer.slice(dataStart, dataStart + size)
      count += 1
    }
    offset = dataStart + Math.ceil(size / 512) * 512
  }
  return { files, count }
}
