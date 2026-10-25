#pragma once

// wasi-libc 没有 <pwd.h>（WASI 没有用户数据库）。LLVM 的 Unix/Path.inc 只在
// 展开 "~user" 与 home_directory() 时查 passwd；浏览器里 HOME 由宿主环境给定，
// 查不到用户条目是正常路径，返回空结果即可。
#include <stddef.h>
#include <sys/types.h>

#ifdef __cplusplus
extern "C" {
#endif

struct passwd {
  char *pw_name;
  char *pw_passwd;
  uid_t pw_uid;
  gid_t pw_gid;
  char *pw_gecos;
  char *pw_dir;
  char *pw_shell;
};

static inline int getpwnam_r(const char *name, struct passwd *pwd, char *buf,
                             size_t buflen, struct passwd **result) {
  (void)name;
  (void)pwd;
  (void)buf;
  (void)buflen;
  *result = NULL;
  return 0;
}

static inline int getpwuid_r(uid_t uid, struct passwd *pwd, char *buf,
                             size_t buflen, struct passwd **result) {
  (void)uid;
  (void)pwd;
  (void)buf;
  (void)buflen;
  *result = NULL;
  return 0;
}

static inline struct passwd *getpwuid(uid_t uid) {
  (void)uid;
  return NULL;
}

static inline struct passwd *getpwnam(const char *name) {
  (void)name;
  return NULL;
}

#ifdef __cplusplus
}
#endif
