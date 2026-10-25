#pragma once
#include_next <unistd.h>
// wasi-libc 的 unistd.h 自己不拉 sys/types.h，而下面的桩要用 mode_t / uid_t。
// 缺这一行时连 `<unistd.h>` 都会编不过，CMake 的 check_symbol_exists 会把
// getpagesize / sysconf 一股脑判成「不存在」。
#include <sys/types.h>

// wasi-libc 把 alarm / getsid 这类「进程组 / 定时器」接口挡在
// __wasilibc_unmodified_upstream 后面（WASI 没有对应能力）。LLVM 的
// lib/Support 只在 Unix/Watchdog.inc 与 LockFileManager.cpp 里用到它们：
//   - Watchdog：真正的超时由 JS 侧看门狗负责，wasm 内部的 alarm 可以空转；
//   - LockFileManager：单进程环境里没有并发实例，getsid 报告「进程已消失」
//     即可让遗留锁被当作陈旧锁清掉，正是我们想要的行为。
// 桩只在内核构建时生效（compat-include 只加进本项目的编译参数）。
#if defined(__wasi__)
#include <errno.h>

// Path.inc 查 passwd 时用 sysconf(_SC_GETPW_R_SIZE_MAX) 取缓冲区大小；
// wasi-libc 没有这个常量，给它一个值让 sysconf 返回 -1，调用方会回落到 16 KiB。
#ifndef _SC_GETPW_R_SIZE_MAX
#define _SC_GETPW_R_SIZE_MAX 100
#endif

#ifdef __cplusplus
extern "C" {
#endif

static inline unsigned alarm(unsigned seconds) {
  (void)seconds;
  return 0;
}

static inline pid_t getsid(pid_t pid) {
  (void)pid;
  errno = ESRCH;
  return -1;
}

// WASI 没有进程派生 / 进程组 / exec：Unix/Program.inc 里这套代码会被编译，
// 但浏览器里我们只用 cc1 + wasm-ld，永不执行。统统返回失败。
static inline pid_t fork(void) {
  errno = ENOSYS;
  return -1;
}

static inline pid_t setsid(void) {
  errno = ENOSYS;
  return -1;
}

static inline int execve(const char *path, char *const argv[],
                         char *const envp[]) {
  (void)path;
  (void)argv;
  (void)envp;
  errno = ENOSYS;
  return -1;
}

static inline int execv(const char *path, char *const argv[]) {
  (void)path;
  (void)argv;
  errno = ENOSYS;
  return -1;
}

// 无用户数据库：固定返回 0，配合 compat-include/pwd.h 的空结果使用。
static inline uid_t getuid(void) { return 0; }
static inline uid_t geteuid(void) { return 0; }
static inline gid_t getgid(void) { return 0; }
static inline gid_t getegid(void) { return 0; }

// wasi-libc 没有 umask（文件权限由 WASI preopen 决定）。LLVM 的 getUmask()
// 只是把当前掩码读出来再写回去，返回 0 相当于「不做任何限制」。
static inline mode_t umask(mode_t mask) {
  (void)mask;
  return 0;
}

// WASI 没有所有权概念，fchown 被 wasi-libc 整段裁掉。Path.inc 的
// changeFileOwnership 只在我们自己请求改所有者时才会走到；报失败会让
// 调用方拿到错误，而浏览器 VFS 里「所有者」本就无从谈起，按无操作成功返回。
static inline int fchown(int fd, uid_t owner, gid_t group) {
  (void)fd;
  (void)owner;
  (void)group;
  return 0;
}

#ifdef __cplusplus
}
#endif
#endif
