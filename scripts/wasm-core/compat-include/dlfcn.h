#pragma once
#include_next <dlfcn.h>

// wasi-libc 的 <dlfcn.h> 只保留 dlopen / dlsym / dlclose（libdl.a 是空壳），
// Dl_info 与 dladdr 被裁掉了。LLVM 的 Unix/Path.inc 用 dladdr 反查可执行文件
// 路径；wasm 里没有「主可执行文件路径」这个概念，返回 0 让调用方走空串分支。
#if defined(__wasi__)
#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
  const char *dli_fname;
  void *dli_fbase;
  const char *dli_sname;
  void *dli_saddr;
} Dl_info;

static inline int dladdr(const void *addr, Dl_info *info) {
  (void)addr;
  (void)info;
  return 0;
}

#ifdef __cplusplus
}
#endif
#endif
