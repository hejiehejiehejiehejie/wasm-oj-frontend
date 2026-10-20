import { nextTick } from 'vue'
import { importProblem } from '../services/vfs/problemImport.js'
import { isContestScrapeActive, useCompanionBridge } from './useCompanionBridge.js'

/**
 * 把扩展推来的题目接进工作区。
 *
 * 跨标签页那一段（postMessage 握手 / 去重）由 useCompanionBridge 管，这里只做两件事：
 * 1) 接住 importProblem 的异常 —— 这是订阅回调，没人 await，漏了就是一条 unhandled rejection，
 *    而界面上什么都不会发生（扩展那边 sendMessage 成功，它也以为投递成功了）；
 * 2) 等 Vue 把 model 挂上编辑器再抢焦点。workspace.activeId 的 watch 是 pre 队列，
 *    紧跟着 await 抢会抢在一个还没换过 model 的编辑器上。
 *
 * 【样例不归这里管】抓来的 tests 跟着题目一起落在那个文件的 config 上，评测面板由
 * App.vue 里跟随 activeNode 的重载去读 —— 面板永远只显示当前文件的样例，这里不需要
 * 再灌一份（灌了反而会在「导入落地前用户已切走」时把别的题的样例写进面板）。
 *
 * @param {{
 *   onImported?: (result: { name: string, ojDir: string, codePath: string, created: boolean, config: Record<string, any> }) => void,
 * }} [options]
 */
export function useCompanionImport({ onImported } = {}) {
  useCompanionBridge((task) => {
    // 整场抓样例时安静落库：那一路会连着投七八道题，抢焦点等于把用户的页签翻七八次。
    // 判据取「此刻有没有一场抓取在跑」—— 只有它能区分「用户点图标抓一道」与「批量补样例」
    importProblem(task, { quiet: isContestScrapeActive() })
      .then(async (result) => {
        await nextTick()
        onImported?.(result)
      })
      .catch((error) => {
        console.warn('[cp] 题目导入失败', error)
      })
  })
}
