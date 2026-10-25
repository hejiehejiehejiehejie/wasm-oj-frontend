/**
 * 阶段 4 的 C++ 宿主客户端：一个常驻 Worker 的薄封装。
 *
 * 与 `host.js` 的分工：host 只做同步 WASI 语义；这里负责 Worker 生命周期、
 * 消息编号、stdout/stderr 的增量回传，以及看门狗要的 `kill()`。
 *
 * 为什么常驻：clang 73 MB、wasm-ld 41 MB，sysroot 1385 条。每次 run 重新实例化 +
 * clone 一份就是阶段 2 那 13–17 s 的来源；这里只在 init 时付一次。
 */

const DEFAULT_INIT = {
  clangURL: '',
  linkerURL: '',
  sysrootURL: '',
  universalHeaderPath: '/sys/include/wasm32-wasip1/bits/stdc++.h',
  universalHeader: '',
  pchSource: '',
}

export class WasiWorkerHost {
  constructor(options = {}) {
    this.options = { ...DEFAULT_INIT, ...options }
    this.worker = null
    this.ready = null
    this.dead = false
    this.nextId = 1
    this.pending = null
    this.stdout = ''
    this.stderr = ''
    // 一次只跑一个 job：运行、语法诊断、PCH 生成共用同一颗常驻 worker，
    // 并发 post 会互相覆盖 pending。排队比开第二颗 worker 便宜得多。
    this.queue = Promise.resolve()
    // 看门狗拿到这个对象后只调 kill()，不碰内部
    this.kill = this.kill.bind(this)
  }

  get alive() {
    return Boolean(this.worker) && !this.dead
  }

  ensureWorker() {
    if (this.worker && !this.dead) return this.worker
    this.dead = false
    const worker = new Worker(new URL('./wasi.worker.js', import.meta.url), {
      type: 'module',
      name: 'cp-cpp-wasi',
    })
    worker.onmessage = (event) => this.onMessage(event.data)
    worker.onerror = (event) => {
      const error = new Error(event?.message || 'C++ WASI worker 崩溃')
      error.partialStdout = this.stdout
      error.partialStderr = this.stderr
      this.fail(error)
    }
    this.worker = worker
    this.ready = this.send({ type: 'init', ...this.options }).then(() => undefined)
    this.ready.catch(() => {
      this.dead = true
    })
    return worker
  }

  onMessage(message) {
    if (message.type === 'stdout') {
      this.stdout += message.text
      return
    }
    if (message.type === 'stderr') {
      this.stderr += message.text
      return
    }
    const pending = this.pending
    if (!pending || pending.id !== message.id) return
    this.pending = null
    if (message.type === 'error') {
      const error = new Error(message.error || 'C++ WASI 宿主错误')
      error.stage = message.stage
      error.partialStdout = this.stdout
      error.partialStderr = this.stderr
      pending.reject(error)
      return
    }
    const result = message.result ?? {}
    // 结果里带完整 stdout；增量那些只给 kill 后的 partial 用，成功路径以完整值为准
    result.stdout = result.stdout || this.stdout
    result.stderr = result.stderr || this.stderr
    this.stdout = ''
    this.stderr = ''
    pending.resolve(result)
  }

  send(payload) {
    const worker = this.worker ?? this.ensureWorker()
    const id = this.nextId++
    const run = this.queue.then(() => {
      if (this.dead || !this.worker) throw new Error('C++ WASI worker 已终止')
      return new Promise((resolve, reject) => {
        this.pending = { id, resolve, reject }
        worker.postMessage({ ...payload, id })
      })
    })
    this.queue = run.then(
      () => {},
      () => {},
    )
    return run
  }

  async start(payload) {
    await this.ready
    if (this.dead) throw new Error('C++ WASI worker 已退出')
    return this.send(payload)
  }

  async compile({ args, source, sourcePath = '/program.cpp', outputPath = '/program.o', pch = null }) {
    return this.start({ type: 'compile', args, source, sourcePath, outputPath, pch })
  }

  async link({ args, object, objectPath = '/program.o', outputPath = '/program.wasm', extraFiles = null }) {
    return this.start({ type: 'link', args, object, objectPath, outputPath, extraFiles })
  }

  async run({ binary, stdin = '', args = [] }) {
    return this.start({ type: 'run', binary, stdin, args })
  }

  async syntax({ args, source, sourcePath = '/program.cpp', pch = null }) {
    return this.start({ type: 'syntax', args, source, sourcePath, pch })
  }

  async preload() {
    await this.ready
    return this.start({ type: 'preload' })
  }

  kill() {
    this.dead = true
    const worker = this.worker
    this.worker = null
    this.ready = null
    if (worker) {
      try {
        worker.terminate()
      } catch {
        /* 已经退出 */
      }
    }
    this.fail(Object.assign(new Error('C++ WASI worker 已终止'), {
      partialStdout: this.stdout,
      partialStderr: this.stderr,
    }))
  }

  fail(error) {
    const pending = this.pending
    this.pending = null
    if (pending) pending.reject(error)
  }

  dispose() {
    this.dead = true
    const worker = this.worker
    this.worker = null
    this.ready = null
    this.fail(Object.assign(new Error('C++ WASI worker 已释放'), { partialStdout: '', partialStderr: '' }))
    if (worker) {
      try {
        worker.terminate()
      } catch {
        /* 已经退出 */
      }
    }
  }
}
