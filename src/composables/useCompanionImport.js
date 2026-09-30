import { nextTick } from 'vue'
import { importProblem } from '../services/vfs/problemImport.js'
import { useCompanionBridge } from './useCompanionBridge.js'

/**
 * 扩展送来的样例（`{ input, output }`）→ 评测面板的卡片数据。
 * 评测面板那一侧叫 expectedOutput，名字对不上，得在这层翻一下。
 * 缺字段的样例直接丢掉：一个空样例跑出来的结果只会误导人。
 *
 * @param {unknown} tests
 * @returns {Array<{ input: string, expectedOutput: string }>}
 */
function toTestCases(tests) {
  if (!Array.isArray(tests)) return []
  return tests
    .filter((test) => test && typeof test === 'object')
    .map((test) => ({
      input: String(test.input ?? ''),
      expectedOutput: String(test.output ?? ''),
    }))
}

/**
 * 把扩展推来的题目接进工作区。
 *
 * 跨标签页那一段（postMessage 握手 / 去重）由 useCompanionBridge 管，这里只做三件事：
 * 1) 接住 importProblem 的异常 —— 这是订阅回调，没人 await，漏了就是一条 unhandled rejection，
 *    而界面上什么都不会发生（扩展那边 sendMessage 成功，它也以为投递成功了）；
 * 2) 把抓到的测试样例**整体替换**进评测面板 —— 抓新题意味着旧题目的样例已经作废，
 *    追加只会得到一串跑不通的垃圾结果，所以这里是覆盖不是合并；
 * 3) 等 Vue 把 model 挂上编辑器再抢焦点。workspace.activeId 的 watch 是 pre 队列，
 *    紧跟着 await 抢会抢在一个还没换过 model 的编辑器上。
 *
 * @param {{
 *   onImported?: (result: { name: string, ojDir: string, codePath: string, created: boolean, config: Record<string, any> }) => void,
 *   setTestCases?: (tests: Array<{ input: string, expectedOutput: string }>) => void,
 * }} [options]
 */
export function useCompanionImport({ onImported, setTestCases } = {}) {
  useCompanionBridge((task) => {
    importProblem(task)
      .then(async (result) => {
        setTestCases?.(toTestCases(result.config?.tests))
        await nextTick()
        onImported?.(result)
      })
      .catch((error) => {
        console.warn('[cp] 题目导入失败', error)
      })
  })
}
