/*
 * 只给「构建 clang.wasm / wasm-ld.wasm」用的 signal.h 兼容层。
 *
 * wasi-libc 在 -D_WASI_EMULATED_SIGNAL 下只提供 signal() / raise() / SIGxxx 常量，
 * sigset_t、struct sigaction、sigemptyset、sigprocmask、SIG_BLOCK/UNBLOCK 全被
 * `__wasilibc_unmodified_upstream` 裁掉了（WASI 没有信号，也不打算有）。
 * 而 LLVM 的 lib/Support 里有四处（CrashRecoveryContext / Signals.inc / Program.inc /
 * InitLLVM）需要这些符号才能编过。
 *
 * 这里用「最小可编译桩 + 空实现」补上：结构体足够放 LLVM 会赋值的字段，
 * 函数一律 no-op。编译器自己运行时的信号处理在 wasm 里本来就无意义（没有信号投递），
 * 真正会被触发的只有 CrashRecoveryContext 的 setjmp/longjmp 路径。
 *
 * 这个目录只挂在构建内核时的 -I 上（见 toolchain-wasip1.cmake），不会进 sysroot，
 * 用户代码编译时看到的是 wasi-libc 的原始头文件。
 */
#pragma once

#include_next <signal.h>

#if defined(__wasi__) && !defined(__wasi_signal_shim_h)

#include <errno.h>
#include <sys/types.h>

// sigset_t 已经由 wasi-libc 定义（一个不透明的字节类型），这里不再重复 typedef。

#ifndef SIG_BLOCK
#define SIG_BLOCK 0
#endif
#ifndef SIG_UNBLOCK
#define SIG_UNBLOCK 1
#endif
#ifndef SIG_SETMASK
#define SIG_SETMASK 2
#endif

// struct sigaction 的 flags 位。wasi-libc 全裁掉了；LLVM 的 Signals.inc
// 只把它们写进结构体字段（sigaction 本身是空实现，永远不会被投递）。
#ifndef SA_NOCLDSTOP
#define SA_NOCLDSTOP 1
#endif
#ifndef SA_NODEFER
#define SA_NODEFER 0x40000000
#endif
#ifndef SA_RESETHAND
#define SA_RESETHAND 0x80000000
#endif
#ifndef SA_ONSTACK
#define SA_ONSTACK 0x08000000
#endif
#ifndef SA_SIGINFO
#define SA_SIGINFO 0x00000004
#endif

// 信号处理函数的三参数签名要 siginfo_t。Signals.inc 只读 si_pid（用来判断
// 「信号是不是自己发的」），其余字段留够空间即可 —— 这些值永远由我们的
// 空 sigaction 桩提供，不会来自真实投递。
typedef struct {
  int si_signo;
  int si_errno;
  int si_code;
  int __pad0;
  pid_t si_pid;
  uid_t si_uid;
  void *si_addr;
  int si_status;
  int __pad1[8];
} siginfo_t;

struct sigaction {
  union {
    void (*sa_handler)(int);
    void (*sa_sigaction)(int, siginfo_t *, void *);
  };
  sigset_t sa_mask;
  int sa_flags;
};

static inline int sigemptyset(sigset_t *set) {
  (void)set;
  return 0;
}

static inline int sigfillset(sigset_t *set) {
  (void)set;
  return 0;
}

static inline int sigaddset(sigset_t *set, int signo) {
  (void)set;
  (void)signo;
  return 0;
}

static inline int sigdelset(sigset_t *set, int signo) {
  (void)set;
  (void)signo;
  return 0;
}

static inline int sigismember(const sigset_t *set, int signo) {
  (void)set;
  (void)signo;
  return 0;
}

static inline int sigprocmask(int how, const sigset_t *set, sigset_t *oldset) {
  (void)how;
  (void)set;
  (void)oldset;
  return 0;
}

static inline int sigaction(int signo, const struct sigaction *act, struct sigaction *oldact) {
  (void)signo;
  (void)act;
  (void)oldact;
  return 0;
}

// WASI 没有信号投递，kill 也不在 libc 里。Unix/Program.inc 的 Wait() 在超时
// 分支上会 kill 子进程 —— 而 WASI 根本派生不出子进程（fork 桩恒失败），
// 这条路径不会被执行，给个「进程不存在」的失败返回即可。
static inline int kill(pid_t pid, int signo) {
  (void)pid;
  (void)signo;
  errno = ESRCH;
  return -1;
}

#define __wasi_signal_shim_h
#endif
