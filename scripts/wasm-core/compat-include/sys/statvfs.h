#pragma once

// wasi-libc 的 struct statvfs 成员叫 f_flag，而 LLVM 的 Unix/Path.inc 只在
// NetBSD / DragonFly / GNU / MVS 上用 f_flag，其余平台一律读 f_flags。这里给出
// 一份字段顺序与 wasi-libc 完全一致的副本，只把成员名改成 f_flags —— 布局不变，
// statvfs() 由 libc 填充，读出来的位仍然在正确位置。
//
// MNT_LOCAL 在 WASI 上不存在；is_local() 恒返回 false（浏览器 VFS 本来也没有
// 「远程挂载」的概念）。
#if !defined(__wasi__)
#include_next <sys/statvfs.h>
#else

#include <features.h>

#define __NEED_fsblkcnt_t
#define __NEED_fsfilcnt_t
#include <bits/alltypes.h>

#ifdef __cplusplus
extern "C" {
#endif

struct statvfs {
  unsigned long f_bsize, f_frsize;
  fsblkcnt_t f_blocks, f_bfree, f_bavail;
  fsfilcnt_t f_files, f_ffree, f_favail;
#if __BYTE_ORDER == __LITTLE_ENDIAN
  unsigned long f_fsid;
  unsigned :8 * (2 * sizeof(int) - sizeof(long));
#else
  unsigned :8 * (2 * sizeof(int) - sizeof(long));
  unsigned long f_fsid;
#endif
  unsigned long f_flags, f_namemax;
  unsigned int f_type;
  int __reserved[5];
};

int statvfs(const char *__restrict, struct statvfs *__restrict);
int fstatvfs(int, struct statvfs *);

#ifndef MNT_LOCAL
#define MNT_LOCAL 0
#endif

#ifdef __cplusplus
}
#endif
#endif
