/**
 * 自检引擎：把 Standard Input 原样当成程序的输出，不执行任何代码。
 *
 * 用途有两个：没有判题服务时也能把整条状态流转（待运行 / 运行中 / 通过 /
 * 未通过 / 报错）走一遍；以及在没有网络的环境里跑 UI 回归。界面会显式标出
 * 这是演示模式，不会伪造真实执行结果。
 */
export const echoEngine = {
  id: 'echo',
  label: '自检（不执行代码）',
  hint: '把标准输入原样回显成输出，仅用于联调界面与状态流转',
  executesCode: false,
  defaultBase: 'local',

  supports() {
    return true
  },

  async health() {
    return { ok: true, message: '内置引擎，无需服务' }
  },

  async execute({ stdin }) {
    await new Promise((resolve) => setTimeout(resolve, 120))
    return { outcome: 'ok', stdout: String(stdin ?? ''), stderr: '', durationMs: 120 }
  },
}
