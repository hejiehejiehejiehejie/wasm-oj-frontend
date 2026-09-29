/**
 * 文件路径 → Monaco languageId。
 * 头文件（.h/.hpp）统一按 cpp 高亮；未登记的扩展一律 plaintext。
 * .md 走 Monaco 内置的 markdown 分词器（题解用，不参与判题）。
 */
import { extname } from '../vfs/paths.js'

/** @type {Record<string, string>} */
const EXTENSION_LANGUAGE = {
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.h': 'cpp',
  '.hpp': 'cpp',
  '.hh': 'cpp',
  '.hxx': 'cpp',
  '.c': 'c',
  '.py': 'python',
  '.md': 'markdown',
  '.markdown': 'markdown',
}

/** @param {string} path @returns {string} */
export function languageForPath(path) {
  return EXTENSION_LANGUAGE[extname(path).toLowerCase()] ?? 'plaintext'
}
