#pragma once
#include_next <sys/resource.h>

// wasi-libc 的资源头只保留了 getrusage；rlimit 相关（struct rlimit /
// RLIMIT_STACK / getrlimit）被 __wasilibc_unmodified_upstream 裁掉了。
// LLVM 23 的 lib/Support/ProgramStack.cpp 只在 LLVM_ON_UNIX 下取一次栈上限，
// 用来决定派生线程的栈大小；WASI 没有线程，给个固定值即可。
#if defined(__wasi__) && !defined(__wasi_compat_rlimit_defined)
#define __wasi_compat_rlimit_defined

#ifdef __cplusplus
extern "C" {
#endif

typedef unsigned long long rlim_t;

struct rlimit {
  rlim_t rlim_cur;
  rlim_t rlim_max;
};

#ifndef RLIMIT_STACK
#define RLIMIT_STACK 3
#endif
#ifndef RLIMIT_CORE
#define RLIMIT_CORE 4
#endif
#ifndef RLIMIT_DATA
#define RLIMIT_DATA 2
#endif
#ifndef RLIMIT_RSS
#define RLIMIT_RSS 5
#endif
#ifndef RLIM_INFINITY
#define RLIM_INFINITY (~0ull)
#endif

static inline int getrlimit(int resource, struct rlimit *rl) {
  (void)resource;
  // 8 MiB 与 LLVM 在非 UNIX 平台上的默认栈上限保持一致。
  rl->rlim_cur = 8ull << 20;
  rl->rlim_max = rl->rlim_cur;
  return 0;
}

static inline int setrlimit(int resource, const struct rlimit *rl) {
  (void)resource;
  (void)rl;
  return 0;
}

#ifdef __cplusplus
}
#endif
#endif
