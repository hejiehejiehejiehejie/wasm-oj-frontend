/*
 * wasi-libc 有 <endian.h>，但没有 macOS 风格的 <machine/endian.h>。
 * LLVM 的 llvm/ADT/bit.h 在「非 Linux / 非 Windows」的兜底分支里会 include 后者，
 * 而 wasm32-wasip1 恰好三条平台宏都不匹配（它只定义 __wasi__ / __wasm__），
 * 于是会报 fatal error: 'machine/endian.h' file not found。
 *
 * 这个兼容头只做转发，放进 -I 路径最前面即可（见 toolchain-wasip1.cmake）。
 */
#pragma once
#include <endian.h>
