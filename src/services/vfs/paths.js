/**
 * VFS 的 POSIX 路径工具。
 *
 * 约定：VFS 内所有路径都是**绝对且标准化**的，形如 '/src/main.cpp'；根固定为 '/'。
 * 节点的 path 永远由这些函数从 parent.path + name 派生，组件里不许手写拼接。
 */

/**
 * 标准化绝对 POSIX 路径：合并重复 '/'、解析 '.' 与 '..'。
 * 根以上的 '..' 被吞掉（与 POSIX 绝对路径行为一致）。
 * @param {string} path
 * @returns {string}
 */
export function normalize(path) {
  const text = String(path ?? '')
  if (!text.startsWith('/')) throw new Error(`VFS 只支持绝对路径：${path}`)
  const segments = []
  for (const part of text.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      segments.pop()
      continue
    }
    segments.push(part)
  }
  return '/' + segments.join('/')
}

/**
 * 拼接路径片段。非绝对的结果会补根；空片段忽略。
 * @param {...string} parts
 * @returns {string}
 */
export function join(...parts) {
  const filtered = parts.filter((part) => part != null && part !== '')
  if (!filtered.length) return '/'
  let joined = filtered.join('/')
  if (!joined.startsWith('/')) joined = '/' + joined
  return normalize(joined)
}

/**
 * 所在目录路径。
 * @param {string} path
 * @returns {string}
 */
export function dirname(path) {
  const norm = normalize(path)
  if (norm === '/') return '/'
  return norm.slice(0, norm.lastIndexOf('/')) || '/'
}

/**
 * 单级文件名。
 * @param {string} path
 * @returns {string}
 */
export function basename(path) {
  const norm = normalize(path)
  if (norm === '/') return ''
  return norm.slice(norm.lastIndexOf('/') + 1)
}

/**
 * 扩展名（含点）；前导点不算（'.gitignore' → ''）。
 * @param {string} path
 * @returns {string}
 */
export function extname(path) {
  const name = basename(path)
  const index = name.lastIndexOf('.')
  return index > 0 ? name.slice(index) : ''
}

/**
 * 单级名称去掉扩展名后的**主干**（'main.cpp' → 'main'，'a.b.cpp' → 'a.b'）。
 * 判定规则与 extname 完全一致：没有点、或点是前导点（'.gitignore'、'.cph'）时视作没有扩展名，原样返回。
 *
 * 注意参数是**单级名称**而不是路径（'main.cpp' 可以，'/src/main.cpp' 不行）——
 * 新建 / 重命名时输入框里放的本来就是名称。文件只选中主干、不选中后缀，靠它取长度。
 * @param {string} name
 * @returns {string}
 */
export function stem(name) {
  const text = String(name ?? '')
  const index = text.lastIndexOf('.')
  return index > 0 ? text.slice(0, index) : text
}

/**
 * 拆成 { dir, name }。
 * @param {string} path
 * @returns {{ dir: string, name: string }}
 */
export function splitPath(path) {
  const norm = normalize(path)
  if (norm === '/') return { dir: '/', name: '' }
  const index = norm.lastIndexOf('/')
  return { dir: index === 0 ? '/' : norm.slice(0, index), name: norm.slice(index + 1) }
}

/**
 * 校验单级名称：非空、不是 '.' / '..'、不含 '/' 与空字符。
 * @param {string} name
 * @returns {string}
 */
export function assertName(name) {
  const text = String(name ?? '')
  if (!text) throw new Error('名称不能为空')
  if (text === '.' || text === '..') throw new Error('非法名称')
  if (text.includes('/')) throw new Error('名称不能包含 “/”')
  if (text.includes('\0')) throw new Error('名称不能包含空字符')
  return text
}

/**
 * maybeChild 是否在 dirPath 之内（不含自身）。
 * @param {string} dirPath
 * @param {string} maybeChild
 * @returns {boolean}
 */
export function isWithin(dirPath, maybeChild) {
  const dir = normalize(dirPath)
  const child = normalize(maybeChild)
  if (child === dir) return false
  if (dir === '/') return true
  return child.startsWith(dir + '/')
}
