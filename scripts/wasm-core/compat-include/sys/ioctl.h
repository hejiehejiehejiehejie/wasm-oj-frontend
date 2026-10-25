#pragma once

// wasi-libc 的 ioctl 头只声明 FIONREAD / FIONBIO 两个请求号，终端尺寸查询
//（struct winsize + TIOCGWINSZ）被裁掉了。LLVM 的 Unix/Process.inc 用它决定
// 输出多少列；在浏览器里列数由 JS 侧决定，这里让 ioctl 直接失败，调用方回落 0。
#ifndef FIONREAD
#define FIONREAD 1
#endif
#ifndef FIONBIO
#define FIONBIO 2
#endif
#ifndef TIOCGWINSZ
#define TIOCGWINSZ 0x5413
#endif

#ifdef __cplusplus
extern "C" {
#endif

struct winsize {
  unsigned short ws_row;
  unsigned short ws_col;
  unsigned short ws_xpixel;
  unsigned short ws_ypixel;
};

static inline int ioctl(int fd, int request, ...) {
  (void)fd;
  (void)request;
  return -1;
}

#ifdef __cplusplus
}
#endif
