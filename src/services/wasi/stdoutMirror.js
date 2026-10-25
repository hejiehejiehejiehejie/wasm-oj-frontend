/**
 * 运行期 stdout 的跨线程镜像 —— **TLE 时「已经打印出来的东西」不能丢**。
 *
 * 【为什么需要它】
 * C++ 跑在一颗常驻 worker 里（services/wasi/），宿主 `runWasiModule()` 是**同步**跑完的。
 * 看门狗（wasmRuntime 的计时器）在主线程，掐断只能靠 `worker.terminate()` —— 那一刻
 * worker 里的局部变量（包括攒着还没 postMessage 出去的那截 stdout）当场蒸发。
 * 靠消息回传就必然有一段「发了但还没送到 / 还没发」的窗口，窗口大小取决于攒批策略：
 * 2026-10-25 实测，worker 按 64 KiB 攒批时，一个「打印 3 行后死循环」的用例 TLE 之后
 * ACTUAL 是**空的**（128 KiB 的用例只留下 131072 字节整块，尾巴照丢）。
 *
 * 【为什么用 SharedArrayBuffer 而不是改攒批粒度】
 * 把 64 KiB 改成 4 KiB 只是把「丢多少」变小，没把「会不会丢」消掉，而且消息条数会涨一千倍。
 * SAB 是两边共享的内存：worker 每收到一段 stdout 就 memcpy 进去，主线程 terminate 之后
 * 直接读，**不需要任何消息送达**，因此不可能丢。
 *
 * 【布局】
 * ```
 * offset 0   4B  control[0]  已写入的字节数（Atomics 读）
 * offset 4   4B  control[1]  溢出标记：1 = 超出容量，后续内容被丢弃
 * offset 8   N B bytes       镜像本体
 * ```
 * 只做**前缀**、不做环形：写满即停。TLE 的用户要看到的是「程序开头打出了什么」，
 * 而不是一段环形缓冲区的中段（那会从半行开始，看着像乱码）。容量 8 MiB 是判题侧
 * 输出上限的几十倍，正常用例连零头都用不到。
 *
 * 【为什么单独一个文件】
 * host.js（worker 侧）与 client.js（主线程侧）都要懂这个布局，而 client.js 不该为了
 * 两个函数把整份 WASI 宿主打进主包。这里零依赖，两边各自 import。
 */

/** 镜像容量（字节）。超过这个量的部分不保留 —— 一个 1.2s 的疯打印能打出几百 MB。 */
export const MIRROR_BYTES = 8 * 1024 * 1024

const HEADER_BYTES = 8

/** 主线程侧：开一份镜像。SAB 不可用（没开跨域隔离）时抛错，调用方按「没有镜像」处理 */
export function createMirror(bytes = MIRROR_BYTES) {
  const sab = new SharedArrayBuffer(HEADER_BYTES + bytes)
  return { sab, ...wrapMirror(sab) }
}

/** worker 侧：把 postMessage 过来的 SAB 包成同一套视图 */
export function wrapMirror(sab) {
  return { control: new Int32Array(sab, 0, 2), bytes: new Uint8Array(sab, HEADER_BYTES) }
}

/** 每次开跑前清零（同一个 worker 会连着跑很多次） */
export function resetMirror(mirror) {
  Atomics.store(mirror.control, 0, 0)
  Atomics.store(mirror.control, 1, 0)
}

/**
 * worker 侧：追加一段原始字节。写满置溢出位并丢弃，不回头覆盖。
 * @param {{ control: Int32Array, bytes: Uint8Array }} mirror
 * @param {Uint8Array} chunk
 */
export function appendMirror(mirror, chunk) {
  const written = Atomics.load(mirror.control, 0)
  const room = mirror.bytes.length - written
  if (room <= 0) {
    Atomics.store(mirror.control, 1, 1)
    return
  }
  const size = Math.min(room, chunk.length)
  mirror.bytes.set(size === chunk.length ? chunk : chunk.subarray(0, size), written)
  Atomics.store(mirror.control, 0, written + size)
  if (size < chunk.length) Atomics.store(mirror.control, 1, 1)
}

/**
 * 主线程侧：读回已经写进镜像的那段 stdout。
 *
 * 整体一次性解码（不是 streaming）：被截断的最后一个多字节字符会变成替换字符，
 * 这正好是「这里被掐断了」的视觉提示。
 *
 * @returns {{ text: string, truncated: boolean }}
 */
export function readMirror(mirror) {
  const total = Atomics.load(mirror.control, 0)
  const truncated = Atomics.load(mirror.control, 1) === 1
  if (!(total > 0)) return { text: '', truncated }
  const size = Math.min(total, mirror.bytes.length)
  try {
    // 必须**先拷贝**成普通 Uint8Array：TextDecoder 不接受 SharedArrayBuffer 上的视图
    // （Encoding 规范里 decode 遇到 SAB 直接抛 TypeError，避免读到撕裂的数据 ——
    //  2026-10-25 踩过：不拷贝时这里被 catch 吞掉，镜像明明有 21 字节却读出空串）
    return { text: new TextDecoder().decode(new Uint8Array(mirror.bytes.subarray(0, size))), truncated }
  } catch {
    return { text: '', truncated }
  }
}
