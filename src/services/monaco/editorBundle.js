/**
 * Monaco 的唯一引入点 —— **按需版**。全仓只该有这一处 import Monaco。
 *
 * 【为什么不用 `import * as monaco from 'monaco-editor'`】
 * 那个入口（esm/vs/editor/editor.main.js）在编辑器本体之外，还把**全部 83 种语言定义**
 * 和 json / css / html / typescript 四套语言服务（各自带一个 web worker）一起引了进来 ——
 * 合计 4 个 worker 8.9MB + 83 个语言 chunk。而这个站点只开 C / C++ / Python / Markdown
 * （见 language.js 的 EXTENSION_LANGUAGE），其余全是白搭。真正致命的是 Service Worker：
 * precache-manifest 是「构建产物全收」，于是**第一次打开站点**就会把一整套 TypeScript
 * 语言服务下下来（ts.worker 单个 6.6MB，gzip 后仍有 1.4MB）。
 *
 * 下面的清单**逐条抄自 monaco-editor@0.56.0 的 esm/vs/editor/editor.main.js**，
 * 只删掉两类：`languages/definitions/*`（语言语法）与 `languages/features/*`
 * （语言服务，连同 monaco-lsp-client）。升级 Monaco 后要重新对一遍，
 * 复核命令写在 HANDOFF 第 2 节 monaco-setup.js 那一行。
 *
 * ⚠️ 改这份清单要小心：漏一条就是静悄悄掉一个编辑器能力（查找框 / 右键菜单 / 折叠 /
 * 多光标 / 各种快捷键都在里面），不报错，只是「按了没反应」。
 * ⚠️ 用 `monaco-esm/` 前缀而不是 `monaco-editor/xxx`：后者走 monaco 的 exports map，
 * 那里只有 `./*` → `./esm/vs/*.js` 一条，既取不到 .css、也到不了 esm 下的深层路径。
 * 这个前缀指向哪儿见 vite.config.js 的 resolve.alias。
 */
import * as monaco from 'monaco-esm/editor/editor.api.js'

import 'monaco-esm/editor/contrib/anchorSelect/browser/anchorSelect.js'
import 'monaco-esm/editor/contrib/bracketMatching/browser/bracketMatching.js'
import 'monaco-esm/editor/contrib/caretOperations/browser/transpose.js'
import 'monaco-esm/editor/contrib/clipboard/browser/clipboard.js'
import 'monaco-esm/editor/contrib/codeAction/browser/codeActionContributions.js'
import 'monaco-esm/editor/browser/widget/codeEditor/codeEditorWidget.js'
import 'monaco-esm/editor/contrib/codelens/browser/codelensController.js'
import 'monaco-esm/base/browser/ui/codicons/codicon/codicon.css'
import 'monaco-esm/editor/contrib/colorPicker/browser/colorPickerContribution.js'
import 'monaco-esm/editor/contrib/comment/browser/comment.js'
import 'monaco-esm/editor/contrib/contextmenu/browser/contextmenu.js'
import 'monaco-esm/editor/contrib/cursorUndo/browser/cursorUndo.js'
import 'monaco-esm/editor/browser/widget/diffEditor/diffEditor.contribution.js'
import 'monaco-esm/editor/contrib/diffEditorBreadcrumbs/browser/contribution.js'
import 'monaco-esm/editor/contrib/dnd/browser/dnd.js'
import 'monaco-esm/editor/contrib/documentSymbols/browser/documentSymbols.js'
import 'monaco-esm/editor/contrib/dropOrPasteInto/browser/dropIntoEditorContribution.js'
// vs/features/find/register.js 不是普通转发：它给查找框打了一个 tabIndex 补丁（Monaco 自己的），
// 所以这里必须引它这份，而不是直接引 editor/contrib/find/browser/findController.js。
import 'monaco-esm/features/find/register.js'
import 'monaco-esm/editor/contrib/floatingMenu/browser/floatingMenu.contribution.js'
import 'monaco-esm/editor/contrib/folding/browser/folding.js'
import 'monaco-esm/editor/contrib/fontZoom/browser/fontZoom.js'
import 'monaco-esm/editor/contrib/format/browser/formatActions.js'
import 'monaco-esm/editor/contrib/gotoError/browser/gotoError.js'
import 'monaco-esm/editor/standalone/browser/quickAccess/standaloneGotoLineQuickAccess.js'
import 'monaco-esm/editor/contrib/gotoSymbol/browser/link/goToDefinitionAtPosition.js'
import 'monaco-esm/editor/contrib/gpu/browser/gpuActions.js'
import 'monaco-esm/editor/contrib/hover/browser/hoverContribution.js'
import 'monaco-esm/editor/contrib/indentation/browser/indentation.js'
import 'monaco-esm/editor/contrib/inlayHints/browser/inlayHintsContribution.js'
import 'monaco-esm/editor/contrib/inlineCompletions/browser/inlineCompletions.contribution.js'
import 'monaco-esm/editor/contrib/inlineProgress/browser/inlineProgress.js'
import 'monaco-esm/editor/contrib/inPlaceReplace/browser/inPlaceReplace.js'
import 'monaco-esm/editor/contrib/insertFinalNewLine/browser/insertFinalNewLine.js'
import 'monaco-esm/editor/standalone/browser/inspectTokens/inspectTokens.js'
import 'monaco-esm/editor/standalone/browser/iPadShowKeyboard/iPadShowKeyboard.js'
import 'monaco-esm/editor/contrib/lineSelection/browser/lineSelection.js'
import 'monaco-esm/editor/contrib/linesOperations/browser/linesOperations.js'
import 'monaco-esm/editor/contrib/linkedEditing/browser/linkedEditing.js'
import 'monaco-esm/editor/contrib/links/browser/links.js'
import 'monaco-esm/editor/contrib/longLinesHelper/browser/longLinesHelper.js'
import 'monaco-esm/editor/contrib/middleScroll/browser/middleScroll.contribution.js'
import 'monaco-esm/editor/contrib/multicursor/browser/multicursor.js'
import 'monaco-esm/editor/contrib/parameterHints/browser/parameterHints.js'
import 'monaco-esm/editor/contrib/placeholderText/browser/placeholderText.contribution.js'
import 'monaco-esm/editor/standalone/browser/quickAccess/standaloneCommandsQuickAccess.js'
import 'monaco-esm/editor/standalone/browser/quickAccess/standaloneHelpQuickAccess.js'
import 'monaco-esm/editor/standalone/browser/quickAccess/standaloneGotoSymbolQuickAccess.js'
import 'monaco-esm/editor/contrib/readOnlyMessage/browser/contribution.js'
import 'monaco-esm/editor/standalone/browser/referenceSearch/standaloneReferenceSearch.js'
import 'monaco-esm/editor/contrib/rename/browser/rename.js'
import 'monaco-esm/editor/contrib/sectionHeaders/browser/sectionHeaders.js'
import 'monaco-esm/editor/contrib/semanticTokens/browser/viewportSemanticTokens.js'
import 'monaco-esm/editor/contrib/smartSelect/browser/smartSelect.js'
import 'monaco-esm/editor/contrib/snippet/browser/snippetController2.js'
import 'monaco-esm/editor/contrib/stickyScroll/browser/stickyScrollContribution.js'
import 'monaco-esm/editor/contrib/suggest/browser/suggestInlineCompletions.js'
import 'monaco-esm/editor/standalone/browser/toggleHighContrast/toggleHighContrast.js'
import 'monaco-esm/editor/contrib/toggleTabFocusMode/browser/toggleTabFocusMode.js'
import 'monaco-esm/editor/contrib/tokenization/browser/tokenization.js'
import 'monaco-esm/editor/contrib/unicodeHighlighter/browser/unicodeHighlighter.js'
import 'monaco-esm/editor/contrib/unusualLineTerminators/browser/unusualLineTerminators.js'
import 'monaco-esm/editor/contrib/wordHighlighter/browser/wordHighlighter.js'
import 'monaco-esm/editor/contrib/wordOperations/browser/wordOperations.js'
import 'monaco-esm/editor/contrib/wordPartOperations/browser/wordPartOperations.js'
import 'monaco-esm/editor/browser/coreCommands.js'
import 'monaco-esm/editor/contrib/caretOperations/browser/caretOperations.js'
import 'monaco-esm/editor/contrib/dropOrPasteInto/browser/copyPasteContribution.js'
import 'monaco-esm/editor/contrib/find/browser/findController.js'
import 'monaco-esm/editor/contrib/gotoSymbol/browser/goToCommands.js'
import 'monaco-esm/editor/contrib/gotoError/browser/markerSelectionStatus.js'
import 'monaco-esm/editor/contrib/semanticTokens/browser/documentSemanticTokens.js'
import 'monaco-esm/editor/contrib/suggest/browser/suggestController.js'
import 'monaco-esm/editor/common/standaloneStrings.js'
import 'monaco-esm/base/browser/ui/codicons/codicon/codicon-modifiers.css'

// 语法高亮只留站点真会打开的三份（c 与 cpp 共用 cpp/register.js 那一份 monarch 定义）。
// 语言定义是懒加载的（register.js 里 `loader: () => import('./cpp.js')`），
// 所以这里只是注册桩，真正的 monarch 定义仍是一个独立 chunk、用到才下。
// 新增受支持的语言 = 这里加一行 + language.js 的 EXTENSION_LANGUAGE 加一条，两处都要。
import 'monaco-esm/languages/definitions/cpp/register.js'
import 'monaco-esm/languages/definitions/python/register.js'
import 'monaco-esm/languages/definitions/markdown/register.js'

// `export *` 让 `import * as monaco from './editorBundle.js'` 的命名空间里直接有
// languages / editor / KeyCode …（completion.js 在模块顶层就解构 monaco.languages，
// 全量入口时代 import 副作用保证了这一点，按需版必须由这条转发保住同样的时序）。
export * from 'monaco-esm/editor/editor.api.js'
export default monaco
export { monaco }
