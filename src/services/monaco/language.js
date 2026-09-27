/**
 * 文件路径 → Monaco languageId。
 * 头文件（.h/.hpp）统一按 cpp 高亮；未登记的扩展一律 plaintext。
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
}

/** @param {string} path @returns {string} */
export function languageForPath(path) {
  return EXTENSION_LANGUAGE[extname(path).toLowerCase()] ?? 'plaintext'
}
