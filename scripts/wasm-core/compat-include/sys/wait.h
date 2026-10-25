#pragma once

// wasi-libc 没有 <sys/wait.h>（WASI 不提供 fork/exec/wait 进程模型）。
// LLVM 的 Unix/Program.inc 会编译 fork/exec/wait 那一套代码，但在浏览器里
// 我们只用 cc1 + wasm-ld，这段永远不会执行；这里补齐声明与状态宏让它编过。
#if defined(__wasi__)
#include <errno.h>
#include <sys/resource.h>
#include <sys/types.h>

#ifdef __cplusplus
extern "C" {
#endif

static inline pid_t wait(int *status) {
  if (status)
    *status = 0;
  return -1;
}

static inline pid_t waitpid(pid_t pid, int *status, int options) {
  (void)pid;
  (void)options;
  if (status)
    *status = 0;
  return -1;
}

// Unix/Program.inc 在 `#elif !defined(__Fuchsia__)` 分支里 `using ::wait4`，
// 并读回 rusage（LLVM 的 ProcessStatistics 要统计 CPU 与峰值内存）。
// WASI 没有子进程，这里恒报「没有这个子进程」。
static inline pid_t wait4(pid_t pid, int *status, int options,
                          struct rusage *usage) {
  (void)pid;
  (void)options;
  if (status)
    *status = 0;
  if (usage)
    __builtin_memset(usage, 0, sizeof *usage);
  errno = ECHILD;
  return -1;
}

#ifdef __cplusplus
}
#endif

#ifndef WNOHANG
#define WNOHANG 1
#endif

#define WIFEXITED(status) (((status)&0x7f) == 0)
#define WEXITSTATUS(status) (((status)&0xff00) >> 8)
#define WIFSIGNALED(status) ((((status)&0x7f) + 1) >= 2)
#define WTERMSIG(status) ((status)&0x7f)
#define WIFSTOPPED(status) (((status)&0xff) == 0x7f)
#define WSTOPSIG(status) WEXITSTATUS(status)
#define WIFCONTINUED(status) 0

#else
#include_next <sys/wait.h>
#endif
