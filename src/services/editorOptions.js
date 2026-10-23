/**
 * editorOptions —— 编辑器偏好的单一出处。
 *
 * 这里同时放三样东西，因为它们必须互相对得上：面板下拉里能选的 id、从 localStorage
 * 读回来时认的合法值、以及 Monaco 真正吃到的选项。拆成两处迟早会出现「面板里选了这一项、
 * 编辑器却不认」的漂移。
 *
 * 【默认值纪律】EDITOR_SETTINGS_DEFAULTS 里的每一项都刻意等于改造前的硬编码值，
 * 老用户升上来（localStorage 里只有旧键）视觉上零变化。
 * 唯一的例外是 insertSpaces（默认关，按 Tab 出制表符）：Monaco 自己的默认是「用空格代替 Tab」，
 * 这里按用户口径刻意改掉，不是疏漏。
 * 另一处刻意的例外是 autoSave（默认开），理由写在它自己那行注释里。
 */

/** 主题决定整套界面配色（见 styles/base.css 的变量），所以只有深 / 浅两套。
 *  这个 id 有三重身份，改名时必须一起动：Monaco 自定义主题名（src/monaco-setup.js）、
 *  <html data-theme> 的值（src/styles/base.css 的选择器）、以及存档里 theme 字段的取值
 *  （迁移见 src/App.vue 的 readEditorSettings），另加 guide.html 的首帧内联脚本。 */
export const THEMES = [
  { id: 'dark', labelKey: 'settings.option.themeDark' },
  { id: 'light', labelKey: 'settings.option.themeLight' },
]

/** 字体栈：末尾都留一个 monospace 兜底，首选字体没装也不会退化成非等宽。
 *  标了「内置」的三款是自托管的 webfont（见 styles/fonts.css / public/fonts/），
 *  栈里刻意写成「Web 族名 → 同名的系统字体 → 系统等宽」：内置优先、跨设备一致，
 *  文件万一取不到还能退到用户自己装的那一款。 */
export const FONT_FAMILIES = [
  {
    id: 'default',
    labelKey: 'settings.option.fontDefault',
    stack: 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace',
  },
  {
    id: 'jetbrains-web',
    labelKey: 'settings.option.fontJetBrains',
    stack: '"JetBrains Mono Web", "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace',
  },
  {
    id: 'fira-code-web',
    labelKey: 'settings.option.fontFiraCode',
    stack: '"Fira Code Web", "Fira Code", ui-monospace, Menlo, Consolas, monospace',
  },
  {
    id: 'cascadia-web',
    labelKey: 'settings.option.fontCascadia',
    stack: '"Cascadia Code Web", "Cascadia Code", ui-monospace, Menlo, Consolas, monospace',
  },
  { id: 'sf-mono', label: 'SF Mono', stack: '"SF Mono", ui-monospace, Menlo, monospace' },
  { id: 'menlo', label: 'Menlo', stack: 'Menlo, Monaco, "Courier New", monospace' },
  { id: 'consolas', label: 'Consolas', stack: 'Consolas, "Courier New", monospace' },
  { id: 'courier', label: 'Courier New', stack: '"Courier New", Courier, monospace' },
]

/** 行高倍数（Monaco 的 lineHeight 是像素整数，用它乘字号算出来） */
export const LINE_HEIGHT_RATIOS = [1.2, 1.4, 1.5, 1.6, 1.8]

export const WRAP_MODES = [
  { id: 'off', labelKey: 'settings.option.wrapOff' },
  { id: 'on', labelKey: 'settings.option.wrapOn' },
  { id: 'wordWrapColumn', labelKey: 'settings.option.wrapColumn' },
]

/**
 * 行号三态。前两个 id 直接就是 Monaco 认的值；`md-off`（仅 Markdown 隐藏）不是 Monaco 选项，
 * 进 Monaco 前由 resolveLineNumbers 按「当前是不是题解」折算成 on / off。
 */
export const LINE_NUMBER_MODES = [
  { id: 'on', labelKey: 'settings.option.lnOn' },
  { id: 'off', labelKey: 'settings.option.lnOff' },
  { id: 'md-off', labelKey: 'settings.option.lnMarkdown' },
]

export const CURSOR_STYLES = [
  { id: 'line', labelKey: 'settings.option.cursorLine' },
  { id: 'block', labelKey: 'settings.option.cursorBlock' },
  { id: 'underline', labelKey: 'settings.option.cursorUnderline' },
]

export const CURSOR_BLINKINGS = [
  { id: 'smooth', labelKey: 'settings.option.blinkSmooth' },
  { id: 'blink', labelKey: 'settings.option.blinkBlink' },
  { id: 'phase', labelKey: 'settings.option.blinkPhase' },
  { id: 'expand', labelKey: 'settings.option.blinkExpand' },
  { id: 'solid', labelKey: 'settings.option.blinkSolid' },
]

/** 空白字符：none 不显示 / boundary 只显示词边界 / selection 只在选中行显示 / trailing 行尾 / all 全部 */
export const WHITESPACE_MODES = [
  { id: 'none', labelKey: 'settings.option.wsNone' },
  { id: 'selection', labelKey: 'settings.option.wsSelection' },
  { id: 'trailing', labelKey: 'settings.option.wsTrailing' },
  { id: 'boundary', labelKey: 'settings.option.wsBoundary' },
  { id: 'all', labelKey: 'settings.option.wsAll' },
]

export const LINE_HIGHLIGHTS = [
  { id: 'all', labelKey: 'settings.option.lhAll' },
  { id: 'line', labelKey: 'settings.option.lhLine' },
  { id: 'gutter', labelKey: 'settings.option.lhGutter' },
  { id: 'none', labelKey: 'settings.option.lhNone' },
]

export const PADDINGS = [
  { id: 'compact', labelKey: 'settings.option.padCompact', top: 8, bottom: 6 },
  { id: 'normal', labelKey: 'settings.option.padNormal', top: 14, bottom: 10 },
]

export const SCROLLBAR_SIZES = [
  { id: 'thin', labelKey: 'settings.option.sbThin', size: 8 },
  { id: 'normal', labelKey: 'settings.option.sbNormal', size: 11 },
  { id: 'thick', labelKey: 'settings.option.sbThick', size: 15 },
]

/**
 * 全部编辑器偏好的默认值。
 * 键名即 localStorage 里 `cp.editorSettings` 的字段名，加新项就往这里加一条。
 */
export const EDITOR_SETTINGS_DEFAULTS = {
  theme: 'dark',
  // 外观
  fontFamily: 'default',
  fontSize: 14,
  lineHeightRatio: 1.5,
  fontLigatures: false,
  // 编辑
  tabSize: 4,
  insertSpaces: false,
  wordWrap: 'off',
  wordWrapColumn: 80,
  // 底下这条不是 Monaco 选项，是「什么时候把 model 正文写回 VFS」的行为开关
  // （见 services/autoSave.js）。**刻意的默认值例外**：按上面那条纪律它本该是 false
  // （改造前只认 Ctrl+S 与运行前自动保存），但「改了字直接关页签 / 刷新就丢内容」是实打实的
  // 丢数据 bug，所以默认开着。
  autoSave: true,
  // 光标
  cursorStyle: 'line',
  cursorBlinking: 'smooth',
  cursorSmoothCaretAnimation: true,
  // 显示
  minimap: false,
  // 行号三态（显示 / 隐藏 / 仅 Markdown 隐藏）。**刻意的默认值例外**：按上面那条纪律它
  // 本该等于改造前行为（所有文件都显示行号 = 'on'），但题解（.md）里行号纯属噪音，按用户
  // 口径默认取「仅 Markdown 隐藏」——.md 收掉行号，代码文件照常。
  lineNumbers: 'md-off',
  renderWhitespace: 'selection',
  // 当前行突出：'all' 会把行号那一栏也铺上底色，'line' 只铺正文。默认取 'line' —— 2026-10-11
  // 起色带改成实心底色（见 monaco-setup.js），铺进行号栏会把左侧的参考列一起染色，太吵。
  // 行号文字自身的「当前行提亮」（--text-dim 那档）不受影响：Monaco 的 active-line-number
  // 只看光标所在行，与这个选项无关。四档仍全部开放，想连行号栏一起铺底色的选 'all' 即可。
  renderLineHighlight: 'line',
  bracketPairColorization: true,
  indentGuides: true,
  bracketGuides: true,
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  padding: 'normal',
  scrollbarSize: 'normal',
  stickyScroll: false,
  // 底下这条不是 Monaco 选项（editorOptions() 里没有它），是编辑器面板自己的开关：
  // 攒在同一个存档里只是图「新增一项偏好不用再开一份 localStorage」。
  // 默认开＝改造前就有状态栏，老用户升上来零变化。
  statusBar: true,
  /**
   * 「全部样例通过」的庆祝纸屑（2026-10-23 加，见 services/confetti.js）。
   *
   * 与 statusBar / lowPower 同理，不是 Monaco 选项，攒在这份存档里只是图「新增一项偏好
   * 不用再开一份 localStorage」。默认开：它是奖励反馈，绝大多数人不会想去关；
   * 关掉的入口在 设置 › 评测（`settings.judge.celebration`），关掉之后连 canvas 都不建。
   */
  celebration: true,
  /**
   * 低配模式：只影响**编辑器内的后台语法检查**（`services/monaco/syntaxDiagnostics.js`）。
   *
   * 开着眼务于老机器 —— 那条检查每触发一次就要起一个 WASI worker、实例化 30MB 的 clang、
   * 再跑一遍前端，弱机上比强机贵得多。开启后整档防抖换成 1.2s 起、连续编辑退到 3.6s
   * （正常档是 0.3s 起、退到 1.2s），打字过程中基本不会再起实例；
   * 判题链路完全不受影响（它本来就不是逐键跑的）。
   *
   * 默认关：正常机器上 0.3s 起跳的反馈延迟才是想要的。
   */
  lowPower: false,
  // 「生成图片」的三项（都不是 Monaco 选项，与 statusBar 同理，攒在同一份存档里）：
  // 导出质量、左上角窗口栏三点、以及正文左侧的行号栏。默认高 + 画点 + 画行号，
  // 即用户定的形态；行号默认开是刻意的 —— 导出去给人看的代码图，没行号不好指某一行。
  // **没有「导出配色」这一项**：图片配色一律跟编辑器当前主题走（用户 2026-10-12 定的口径，
  // 「编辑器里什么样，图里就得什么样」），取色见 services/codeImage.js 的 currentThemeColors()。
  // **也没有「画布尺寸」这一项**：图里字号固定（codeImage.js 的 EXPORT_FONT_SIZE），
  // 画布只由代码本身决定，既不吃编辑器字号也不吃屏幕像素密度 —— 换台机器导出，图一样大。
  codeImageQuality: 'high',
  codeImageDots: true,
  codeImageLineNumbers: true,
  /**
   * 「生成图片」出口的两项（用户 2026-10-12 定的口径）：
   * 每次导出都弹一次窗问「复制还是保存」（默认开 —— 一次一选，不替用户猜）；
   * 关掉之后按 `codeImageAction` 直接执行，不再问。
   */
  codeImageAsk: true,
  codeImageAction: 'copy',
}

/**
 * 「生成图片」的导出质量 → 渲染倍率（2 / 3 / 4，见 codeImage.js 的 QUALITY_SCALES）。
 * PNG 无损、没有压缩质量这一说，「质量」就是清晰度：倍率越高越锐利，文件也越大。
 * 画布的逻辑尺寸与质量无关 —— 字号固定，所以三档只是同一张图的三种像素密度。
 */
export const CODE_IMAGE_QUALITIES = [
  { id: 'medium', labelKey: 'settings.option.qualityMedium' },
  { id: 'high', labelKey: 'settings.option.qualityHigh' },
  { id: 'ultra', labelKey: 'settings.option.qualityUltra' },
]

/**
 * 「生成图片」的两种出口。**关掉「每次询问」时**用这一个（默认 copy：贴到别处是最常见的用途）。
 * 询问开着时这两个值不起作用 —— 那一次由弹窗当场决定。
 */
export const CODE_IMAGE_ACTIONS = [
  { id: 'copy', labelKey: 'settings.option.imageCopy' },
  { id: 'save', labelKey: 'settings.option.imageSave' },
]

/** 整数型偏好的取值范围（读盘时越界就退回默认值；面板上的数字输入框也用它的 min/max） */
export const EDITOR_SETTING_RANGES = {
  fontSize: [8, 32],
  tabSize: [2, 8],
  wordWrapColumn: [40, 200],
}

/** 枚举型偏好的合法取值 */
const VALUE_SETS = {
  theme: THEMES.map((item) => item.id),
  fontFamily: FONT_FAMILIES.map((item) => item.id),
  lineHeightRatio: LINE_HEIGHT_RATIOS,
  wordWrap: WRAP_MODES.map((item) => item.id),
  lineNumbers: LINE_NUMBER_MODES.map((item) => item.id),
  cursorStyle: CURSOR_STYLES.map((item) => item.id),
  cursorBlinking: CURSOR_BLINKINGS.map((item) => item.id),
  renderWhitespace: WHITESPACE_MODES.map((item) => item.id),
  renderLineHighlight: LINE_HIGHLIGHTS.map((item) => item.id),
  padding: PADDINGS.map((item) => item.id),
  scrollbarSize: SCROLLBAR_SIZES.map((item) => item.id),
  codeImageQuality: CODE_IMAGE_QUALITIES.map((item) => item.id),
  codeImageAction: CODE_IMAGE_ACTIONS.map((item) => item.id),
}

/**
 * 把一个来路不明的值夹成合法值；认不出来的键返回 undefined（调用方据此丢弃）。
 * 只认 EDITOR_SETTINGS_DEFAULTS 里有的键，历史遗留的过期字段（如已移除的 keybinding）自然被丢掉。
 * @param {string} key
 * @param {unknown} value
 * @returns {unknown} 合法值或 undefined
 */
export function normalizeEditorSetting(key, value) {
  if (!(key in EDITOR_SETTINGS_DEFAULTS)) return undefined
  const fallback = EDITOR_SETTINGS_DEFAULTS[key]

  const range = EDITOR_SETTING_RANGES[key]
  if (range) {
    const number = Number(value)
    return Number.isFinite(number) && number >= range[0] && number <= range[1]
      ? Math.round(number)
      : fallback
  }
  const allowed = VALUE_SETS[key]
  if (allowed) {
    // lineNumbers 曾经是开关（true / false），老存档里的布尔折算成对应的枚举值；
    // 其余枚举项本来就不接受布尔，走下面那条拒绝分支。
    if (typeof value === 'boolean' && allowed.includes(value ? 'on' : 'off')) {
      return value ? 'on' : 'off'
    }
    return allowed.includes(value) ? value : fallback
  }
  // 剩下的都是开关
  return typeof value === 'boolean' ? value : fallback
}

/**
 * 行号三态 → Monaco 的 'on' / 'off'。
 * 「仅 Markdown 隐藏」不是 Monaco 认的值，只能按当前文件折算，所以 markdown 由调用方传进来。
 */
function resolveLineNumbers(mode, markdown) {
  if (mode === 'off') return 'off'
  if (mode === 'md-off') return markdown ? 'off' : 'on'
  return 'on'
}

/**
 * 偏好 → Monaco 选项。
 * create() 与 updateOptions() 共用这一份，免得加一项设置要改两处、还容易漏。
 * 刻意不含 theme：它是构造参数，运行中的切换必须走 monaco.editor.setTheme()。
 * 刻意不含 tabSize / insertSpaces：那是 model 级选项（见 editorModelOptions）。
 *
 * 【全局缩放的补偿点】Monaco 的样式表在 postcss 黑名单里（不吃 rem），它内部所有
 * 尺寸都靠这里的真实 px 撑起来，所以 fontFamily 之外的像素量都要乘 scale，
 * 否则 125% 下会出现「界面放大了、编辑器还是 14px」的脱节。
 * 注意 tabSize 不乘：那是列数（几个字符宽），不是像素。
 * @param {typeof EDITOR_SETTINGS_DEFAULTS} settings
 * @param {number} scale 全局缩放比例（见 composables/useUiScale.js）
 * @param {{ markdown?: boolean }} [context] markdown = 当前活跃文件是不是题解（.md）。
 *   「仅 Markdown 隐藏」那一档行号与整套括号提示都看它；切 .md / 切回来时要重下发一次选项。
 */
export function editorOptions(settings, scale = 1, { markdown = false } = {}) {
  const font = pick(FONT_FAMILIES, settings.fontFamily, FONT_FAMILIES[0])
  const padding = pick(PADDINGS, settings.padding, PADDINGS[1])
  const scrollbar = pick(SCROLLBAR_SIZES, settings.scrollbarSize, SCROLLBAR_SIZES[1])
  // fontSize / lineHeight 必须是整数像素，Monaco 不接受小数
  const fontSize = Math.round(settings.fontSize * scale)
  const scaled = (value) => Math.round(value * scale)
  return {
    // 外观
    fontFamily: font.stack,
    fontSize,
    // 行高跟着「缩放后的字号」算，而不是各乘一次再拼：这样行高倍数这个语义才不漂
    lineHeight: Math.round(fontSize * settings.lineHeightRatio),
    fontLigatures: settings.fontLigatures,
    minimap: { enabled: settings.minimap },
    // 三态存档 → Monaco 的 'on' / 'off'（「仅 Markdown 隐藏」按当前文件折算）
    lineNumbers: resolveLineNumbers(settings.lineNumbers, markdown),
    // **Monaco 自带的右键菜单整套关掉**（2026-10-14 加）。站内那份是自绘的
    // （`composables/useEditorMenu.js`：桌面右键 / 触屏长按 450ms），Monaco 那份是英文的，
    // 只要有一处漏拦，屏幕上就会冒出一份与双语界面不一致的菜单来。
    //
    // 漏拦就出在触屏那条路上（实测的窗口）：我们撤销长按的位移阈值是 **10px**
    // （`useEditorMenu.js` 的 `MOVE_SLOP`），Monaco 判定「按住」的位移窗是 **30px**
    // （`touch.js` 的 `HOLD_DELAY = 700ms` 那一支，见第 5 节坑 31）。手指按住后先在原地
    // 动过 10px 又不到 30px 时：我们撤了长按，Monaco 到点照发 ⇒ 它那份菜单冒出来。
    // 以往只靠 useEditorMenu 在捕获阶段拦，而那条拦是**有条件的**（只拦「本次触摸已被我们
    // 接管」的那一发），所以这个窗口一直是敞的。
    //
    // 这个选项是 Monaco 自己的开关：`ContextMenuController` 在 `_onContextMenu` 与
    // `showContextMenu` 开头都读它，见到 false 就只落焦点与光标、不弹菜单
    // （`contrib/contextmenu/browser/contextmenu.js` 三处早退）⇒ **任何入口**都弹不出来。
    // 顺带把 Shift+F10 / Menu 键那条键盘路也关掉（同一个开关，那条路捕获监听够不到）。
    // 它**不影响**我们那份菜单：菜单内容与两条拦截都在 `useEditorMenu.js`，与这个选项无关。
    contextmenu: false,
    // 编辑
    wordWrap: settings.wordWrap,
    wordWrapColumn: settings.wordWrapColumn,
    // 光标
    cursorStyle: settings.cursorStyle,
    cursorBlinking: settings.cursorBlinking,
    cursorSmoothCaretAnimation: settings.cursorSmoothCaretAnimation ? 'on' : 'off',
    // 显示
    renderWhitespace: settings.renderWhitespace,
    renderLineHighlight: settings.renderLineHighlight,
    // 题解（.md）里整套括号提示都关掉：散文没有嵌套层级可讲，`(a[b])` 被染成彩虹色、
    // 光标贴住括号还画配对框，纯噪音。三个开关各管一摊：
    // colorization 管括号字符的配色，guides.bracketPairs 管引导线（竖线 + 上下横线），
    // matchBrackets 管配对框 —— 它只管高亮，不影响「跳转到配对括号」这类命令。
    matchBrackets: markdown ? 'never' : 'always',
    bracketPairColorization: { enabled: settings.bracketPairColorization && !markdown },
    guides: {
      indentation: settings.indentGuides,
      // 'active' = 只画光标所在那一层，全画在嵌套深的代码里太花
      bracketPairs: settings.bracketGuides && !markdown ? 'active' : false,
    },
    scrollBeyondLastLine: settings.scrollBeyondLastLine,
    smoothScrolling: settings.smoothScrolling,
    padding: { top: scaled(padding.top), bottom: scaled(padding.bottom) },
    scrollbar: {
      verticalScrollbarSize: scaled(scrollbar.size),
      horizontalScrollbarSize: scaled(scrollbar.size),
      useShadows: false,
    },
    stickyScroll: { enabled: settings.stickyScroll },
    // 智能提示。补全内容本身在 services/monaco/completion.js（C/C++/Python 的关键字 /
    // 标准库 / 片段）；这里只管「什么时候弹、按什么键收」——这几项 Monaco 各有默认值，
    // 显式写出来是为了不随版本漂移，也方便一处看清编辑器的补全行为。
    // comments / strings 关掉是刻意的：那两处的词多半是行文，弹一屏建议只会碍事。
    quickSuggestions: { other: 'on', comments: 'off', strings: 'off' },
    // 输入 `.` `:` 等触发字符时也要弹（provider 的 triggerCharacters 见上）
    suggestOnTriggerCharacters: true,
    // 同文档里出现过的词也参与补全（Monaco 默认就是这个档，写出来备查）
    wordBasedSuggestions: 'currentDocument',
    // Tab 只负责缩进，绝不接受建议。
    //
    // Monaco / VSCode 的默认值都是 'off'，这里曾经写成 'on'：于是补全框关着、
    // 光标前只有一个词时按 Tab 也会把它换成最佳建议（`retur` + Esc + Tab = `return`），
    // 更常见的是「按 Tab 缩进，结果上一行的词被吞掉」。缩进是高频动作，不能有歧义。
    // 要接受建议就用 Enter（见下面那条 acceptSuggestionOnEnter）。
    tabCompletion: 'off',
    // 'smart'：光标处已经写完一个完整词时 Enter 才是换行，避免敲回车顺手吞掉一条建议
    acceptSuggestionOnEnter: 'smart',
    // 片段不挤掉同文档词汇（completion.js 里给片段排了 zz_ 前缀，两者同屏）
    suggest: { snippetsPreventQuickSuggestions: false },
  }
}

/**
 * 偏好 → Monaco 的 **model** 级选项。
 *
 * tabSize / insertSpaces 在 monaco 0.56 里根本不是编辑器选项（EditorOption 里没有它们），
 * 传给 editor.create() / updateOptions() 会被静默丢掉，只能落到 model 上，而且要每挂一个
 * model（切文件、新建文件）都补一次，否则新 model 又会退回默认的 4 空格 / 空格缩进。
 * @param {typeof EDITOR_SETTINGS_DEFAULTS} settings
 */
export function editorModelOptions(settings) {
  return {
    tabSize: settings.tabSize,
    insertSpaces: settings.insertSpaces,
  }
}

/**
 * @template {{ id: string }} T
 * @param {T[]} table
 * @param {string} id
 * @param {T} fallback
 * @returns {T}
 */
function pick(table, id, fallback) {
  return table.find((item) => item.id === id) ?? fallback
}
