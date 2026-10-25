# 把 LLVM 交叉编译成 wasm32-wasip1 的工具链描述（给 build.mjs 的 wasm 阶段用）。
#
# 交叉编译器就是 wasi-sdk 里的 clang：它在宿主机上运行，目标默认已是 wasm32-wasip1，
# 链接器是 wasi-sdk 的 wasm-ld，sysroot 也取自 wasi-sdk（含 libc / libc++ / 头文件）。
#
# 为什么用 CMAKE_SYSTEM_NAME=Linux 而不是 Generic / WASI：
# LLVM 23 的 HandleLLVMOptions.cmake 里平台判定只有三支：WIN32 / (FUCHSIA|UNIX|CYGWIN) /
# Generic / 其它直接 SEND_ERROR。写 Generic 会让 LLVM_ON_UNIX=0，于是 lib/Support 去编
# Windows 那套 .inc（拿不到真正的 POSIX 实现）；写 WASI 则直接落进 SEND_ERROR 分支。
# Linux 是唯一既让 LLVM_ON_UNIX=1、又不会给编译器塞任何额外宏的选择 —— 编译器宏仍由
# wasi-sdk 的 --target=wasm32-wasip1 决定（__wasi__ / __wasm__，不会定义 __linux__）。
# LLVM 23 的构建系统里也没有任何 WASI 平台分支可复用。
#
# wasi-libc 与 musl 同源，POSIX 面基本齐全，Linux 这套判定与实际行为吻合。
#
# 注意 CMAKE_EXECUTABLE_SUFFIX：wasm-ld 的输出文件名完全由 -o 决定、不会自动补后缀，
# 不设它 CMake 会把产物命名成没有扩展名的 `clang`；设成 .wasm 后产物直接叫 clang.wasm。

set(CMAKE_SYSTEM_NAME Linux)
set(CMAKE_SYSTEM_PROCESSOR wasm32)
set(CMAKE_SIZEOF_VOID_P 4)
set(CMAKE_EXECUTABLE_SUFFIX ".wasm")
# 宿主是 macOS（Mach-O），但 CMake 以为目标是 ELF，install 阶段要求重写 RPATH，
# Ninja 在非 ELF 平台上不支持这一步。wasm 没有动态链接，RPATH 毫无意义，直接沿用构建期值。
set(CMAKE_BUILD_WITH_INSTALL_RPATH ON)
set(CMAKE_SKIP_INSTALL_RPATH ON)

# 为什么从环境变量取而不是 -D 变量：CMake 在编译器自检（try_compile）时会把
# 本工具链文件再 include 进一个临时子工程，而 -D 缓存变量不会自动传下去，
# 变量取不到就会在子工程里报 FATAL_ERROR。环境变量对所有子进程都生效，最稳。
if(NOT WASI_SDK_DIR)
  set(WASI_SDK_DIR "$ENV{WASI_SDK_DIR}")
endif()
if(NOT WASI_SDK_DIR)
  message(FATAL_ERROR "缺少环境变量 WASI_SDK_DIR（wasi-sdk 根目录）")
endif()

set(CMAKE_C_COMPILER "${WASI_SDK_DIR}/bin/clang")
set(CMAKE_CXX_COMPILER "${WASI_SDK_DIR}/bin/clang++")
set(CMAKE_AR "${WASI_SDK_DIR}/bin/llvm-ar")
set(CMAKE_RANLIB "${WASI_SDK_DIR}/bin/llvm-ranlib")
set(CMAKE_NM "${WASI_SDK_DIR}/bin/llvm-nm")
set(CMAKE_OBJCOPY "${WASI_SDK_DIR}/bin/llvm-objcopy")
set(CMAKE_OBJDUMP "${WASI_SDK_DIR}/bin/llvm-objdump")
set(CMAKE_SYSROOT "${WASI_SDK_DIR}/share/wasi-sysroot")

# LLVM 的 lib/Support 有几块非标准扩展依赖，wasi-libc 默认把它们挡在 #error 后面：
#   - CrashRecoveryContext 用 setjmp / longjmp：需要 -mllvm -wasm-enable-sjlj，
#     并把 shim 库 libsetjmp.a 一起链进去（它自己用 wasm 异常实现，浏览器新增了 exnref 支持）；
#   - CrashRecoveryContext / SignalHandler 用 signal：需要 -D_WASI_EMULATED_SIGNAL + -lwasi-emulated-signal；
#   - Memory.inc 用 mmap / munmap / mprotect：需要 -D_WASI_EMULATED_MMAN + -lwasi-emulated-mman。
# 这些只在编译器自己崩溃恢复 / 可执行内存分配时用得上，不影响用户代码。
set(WASI_COMPAT_FLAGS "-D_WASI_EMULATED_SIGNAL -D_WASI_EMULATED_GETPID -D_WASI_EMULATED_PROCESS_CLOCKS -D_WASI_EMULATED_MMAN -mllvm -wasm-enable-sjlj")
set(CMAKE_C_FLAGS_INIT "--target=wasm32-wasip1 -O2 -I${CMAKE_CURRENT_LIST_DIR}/compat-include ${WASI_COMPAT_FLAGS}")
set(CMAKE_CXX_FLAGS_INIT "--target=wasm32-wasip1 -O2 -I${CMAKE_CURRENT_LIST_DIR}/compat-include ${WASI_COMPAT_FLAGS}")
# 链接参数用 CACHE ... FORCE 而不是 CMAKE_EXE_LINKER_FLAGS_INIT：_INIT 只在
# 变量还没进缓存时播种，已经配置过的构建目录改了工具链文件也不会更新 —— 会得到
# 「看着改了、链接行其实没变」的假象。工具链文件是这套构建的唯一权威，直接覆盖。
#
# stack-size：wasm-ld 默认栈只有 64 KiB，clang 自己一跑真实编译就 trap
#（memory access out of bounds）。8 MiB 与 Linux 默认值一致，足够 cc1 的深递归。
set(CMAKE_EXE_LINKER_FLAGS "-lwasi-emulated-signal -lwasi-emulated-getpid -lwasi-emulated-process-clocks -lwasi-emulated-mman -lsetjmp -Wl,-z,stack-size=8388608" CACHE STRING "" FORCE)
# 只有 .wasm 可执行文件需要 link，库全是静态归档；把编译器检查降级成「能编出静态库」
# 可以避开早期 try_compile 在还没有 sysroot 概念时就去链接可执行文件。
set(CMAKE_TRY_COMPILE_TARGET_TYPE STATIC_LIBRARY)
set(CMAKE_C_COMPILER_WORKS 1)
set(CMAKE_CXX_COMPILER_WORKS 1)

set(CMAKE_FIND_ROOT_PATH ${CMAKE_SYSROOT})
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_PACKAGE ONLY)
