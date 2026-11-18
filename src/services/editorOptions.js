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
 * 第三处是 cursorSmoothCaretAnimation（2026-11-14 用户要求默认关），理由同它自己那行。
 */

/** 主题决定整套界面配色（见 styles/base.css 的变量）。
 *  每一套主题有两个身份，必须分开看：
 *    · `id` —— 具体配色方案的存档值，同时是 `<html data-theme>` 的取值与 Monaco 自定义主题名
 *      （src/monaco-setup.js），改名时必须一起动，另加各静态页的首帧内联脚本；
 *    · `scheme` —— 只描述明暗（'dark' / 'light'），写在 `<html data-scheme>`。
 *  组件里凡是「只关心明暗」的判断（放大镜用哪套 Monaco 基色、段位色、系统栏图标）一律读
 *  scheme，不要读 id —— 否则每加一套深色主题都得再补一处分支。
 *
 *  `swatch` 是设置页色卡网格的预览色（底色 / 卡片 / 强调 / 正文）。它是**别的主题**的颜色，
 *  当前渲染时读不到那套主题的 CSS 变量，所以只能在这里显式列出；主题配色改动时记得同步。 */
export const THEMES = [
  {
    id: 'dark',
    scheme: 'dark',
    labelKey: 'settings.option.themeDark',
    swatch: ['#1c1c1c', '#252528', '#0e639c', '#d4d4d4'],
  },
  {
    id: 'light',
    scheme: 'light',
    labelKey: 'settings.option.themeLight',
    swatch: ['#fbfbfb', '#ffffff', '#005fb8', '#1f1f1f'],
  },
  {
    id: 'midnight',
    scheme: 'dark',
    labelKey: 'settings.option.themeMidnight',
    swatch: ['#14161d', '#1c1f2b', '#2273b5', '#ccd3e1'],
  },
  {
    id: 'oled',
    scheme: 'dark',
    labelKey: 'settings.option.themeOled',
    swatch: ['#000000', '#101010', '#0e639c', '#e6e6e6'],
  },
  {
    id: 'paper',
    scheme: 'light',
    labelKey: 'settings.option.themePaper',
    swatch: ['#f6f1e6', '#faf6ed', '#9a5b00', '#2f2a22'],
  },
  {
    id: 'leaf',
    scheme: 'light',
    labelKey: 'settings.option.themeLeaf',
    swatch: ['#e8efe3', '#f0f5ec', '#2f7048', '#26302a'],
  },
  {
    id: 'dusk',
    scheme: 'dark',
    labelKey: 'settings.option.themeDusk',
    swatch: ['#282a36', '#2d2f3d', '#7c5cd6', '#f8f8f2'],
  },
  {
    id: 'forest',
    scheme: 'dark',
    labelKey: 'settings.option.themeForest',
    swatch: ['#151b17', '#1d2620', '#1f7a52', '#cfdcd2'],
  },
  {
    id: 'contrast',
    scheme: 'dark',
    labelKey: 'settings.option.themeContrast',
    swatch: ['#000000', '#0a0a0a', '#2ea8ff', '#ffffff'],
  },
  {
    id: 'mist',
    scheme: 'light',
    labelKey: 'settings.option.themeMist',
    swatch: ['#e3e9f1', '#eef2f7', '#43698f', '#2e3440'],
  },
]

/** 主题 id → 明暗。未知 id 一律按深色（与 base.css 的默认值一致）。 */
const THEME_SCHEME = Object.fromEntries(THEMES.map(({ id, scheme }) => [id, scheme]))

export function themeScheme(id) {
  return THEME_SCHEME[id] || 'dark'
}

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
 * 正文左侧那一栏（行号栏）的构成，宽屏 / 窄屏各一套。
 *
 * Monaco 把这一栏画成三段：`[行号列][行内装饰区][正文]`，宽度由两个选项决定
 * （见 node_modules 里 `editorLayout` 的 computeLayout：`contentLeft = 行号列 + 装饰区`）。
 * 宽屏这套就是 Monaco / VS Code 的默认值（5 字符 / 10px），一个字符约 8.4px（14px 等宽字体），
 * 于是两位数行号的文件在大屏上要占 `5×8.4 + 10 + 16(折叠控件) = 68px` —— 1400px 宽的面板里
 * 这点常量不显眼，390px 的手机上要吃掉 20% 的宽度，正文被挤成三十来个字符。
 *
 * 窄屏因此只留「行号列 + 一条 2px 的缝」这一小段（2026-11-13 用户报「窄屏下输入区和左边的空隙偏大」，
 * 随后又指出「行号右边那一列黑边在横向滚动时会盖住代码」），并按「有没有行号」分成两档：
 * - `narrow`（有行号）：**行号列宽 = 当前文件行数的位数 + 3 个字符**（下面 editorOptions 里按
 *   `lineCount` 现算，不写死）。多出来的这三格就是数字两侧的边距，左右各一格半：
 *   `styles/base.css` 用 `padding-right: calc(1.5ch - 1px)` 把右边那一格半占掉（`1ch` = 一个数字的宽，
 *   14px 等宽字体下 8.43px），左边的一格半由 `text-align: right` 自然剩下 ——
 *   于是不管文件是 9 行还是 999 行，两侧都各约 1.5 格（约 13px），随字号 / 界面缩放一起变，
 *   而不是「两位数时左边空一大条、三位数时直接顶到栏边」。
 *   位数只增不减地跟着 `max(位数, minChars)` 走，所以 minChars 必须**比实际位数多 3** 才有这般余量；
 *   行数跨过 10 / 100 / 1000 行时要重下发一次选项（`EditorPane.vue` 的 syncGutterDigits）。
 *   （2026-11-13 这档改过三次：①②原为「+1 格 + 右 padding 3px」，实测左 5.1–5.7 / 右 3；
 *   ⑥用户「增大一下行号左右的间距」→「+2 格 + `calc(1ch - 1px)`」，两侧各约 9.5px；
 *   ⑦用户「再增加一点」→ 现在这版，两侧各约 13px。）
 * - **装饰区固定 2px**：这一格只加在行号列的**右侧**，是数字与正文之间那条缝（用户 2026-11-13
 *   第三轮指定：「仍然需要装饰区，只是将它的宽度收窄为 2px」）。
 *   这一档的 `showFoldingControls` 是 `'never'` —— 折叠控件那 16px 是「行号右边一条空白」的
 *   大头，不留它这一栏才只剩数字（`folding: true` 没动，键盘仍能折，见下面正文里的说明）。
 * - `narrowPlain`（不显示行号，即题解）：行号列本来就是 0（`computeLayout` 里
 *   `if (showLineNumbers)` 才算宽度），所以这一档的宽度**全由装饰区给**。给的是 **8px**：
 *   题解没有行号要对齐，这一格纯粹是正文的左呼吸，而 `contentLeft` 同时是三件事 ——
 *   行号栏宽、`.editor-scrollable` 的 `left`（正文视口的左边界）、鼠标命中的基准
 *   （`mouseTarget.js` 里 `scrollLeft + relativePos.x - contentLeft`）。所以这 8px 也**必然**
 *   是横向滚动时正文被 `overflow: hidden` 切掉的位置：往里推 N 像素，就在离左边 N 像素处切。
 *   想「初始有内缩、滑动时满宽」在 Monaco 里做不到，原因是渲染起点必须恒等于 `contentLeft`，
 *   任何「CSS 把视觉起点右移、视口仍从 0 开始」的补偿都会让命中算出的列与实际渲染差一个 N
 *   （点字落偏），`.view-lines` 加 `padding-left` 同理（这个版本的 `padding` 也只有 top/bottom）。
 *   2026-11-13 第五轮用户的原话是「初始有一点边距、滑动时整个区域都能显示」，
 *   两半在数学上互斥，于是取「裁切小于半个汉字」的 8px：初始正文距屏幕 15px（编辑器自身还有 7px），
 *   滚动时那 8px 的死区肉眼基本看不出。**要把这 8px 也去掉就改这里为 0**
 *   （实测 0 时正文贴编辑区左缘、滚动完全满宽）。
 *   那一栏即使收窄，`styles/base.css` 里 `.editor-pane.is-md` 的透明规则也留着 ——
 *   宽屏题解仍走 `wide` 档（26px），那里的底色照样要抹掉。
 *   装饰区本来就不乘 scale，这里同样不乘。
 *
 * 窄屏判据不在这里判：由调用方把 `isNarrowLayout()` 的结果当 `narrow` 传进来（口径只有
 * `shellSettings.js` 那一份）。
 *
 * 【宽屏里的一片窄窗格也走压缩档】（2026-11-17 用户要求：「宽屏的时候，如果一个窗格太窄，
 * 行号也做一个压缩」）分屏之后单片窗格可能只有三四百像素，那 68px 的行号栏占比一点不比手机上小。
 * 于是判据从「整屏是不是窄屏」扩成「这一片窗格是不是窄」：`gutterIsCompact()` 取两者的并集，
 * 宽度由 `EditorPane.vue` 实测自己的 Monaco 容器喂进来（`paneWidth`）。
 * 阈值口径是「正文至少还剩 40 列」—— 把 40 列正文加上行号栏自己的 5 列与 26px 装饰/折叠，
 * 折算成 45ch + 26px（见下面的 `compactGutterLimit`）。14px 字体下约 404px：本机 1440px
 * 窗口里两列分屏每片 426px（还留宽档），再拖窄一点、或切到三四列就换压缩档。
 * ⚠️ 这两档**不是**「窄屏专供」：`styles/base.css` 里行号左右各一格半的内边距与透明底色
 * 原来只挂 `html.is-narrow`，现在同一个判据还给窗格挂 `.editor-pane.is-tight`（见那边的注释）。
 */
const LINE_NUMBER_GUTTER = {
  wide: { minChars: 5, decorations: 10, foldingControls: 'mouseover' },
  // 窄屏：minChars 不在这里写死，由 editorOptions() 按「行数位数 + 3」现算（见函数体里的 gutter）
  narrow: { decorations: 2, foldingControls: 'never' },
  // 题解没有行号列，这一档只留 8px：给正文一点左呼吸，同时把横向滚动的死区压到半个字符以内
  narrowPlain: { minChars: 4, decorations: 8, foldingControls: 'never' },
}

/**
 * 压缩档的宽度上限（CSS px）：窗格比它还窄就换 `narrow` 那一套行号栏。
 *
 * 算式 = 「正文 40 列 + 行号栏的 5 列」× 单字宽 + 装饰区 10px + 折叠控件 16px。
 * `ch` 比例取 0.6em：Monaco 默认字体下实测 14px → 8.43px（≈0.602），差的那 0.002 会
 * 让 40 列的判断挪不到 1px，不值得再引一个精确表。
 * 40 列是「一行代码还得能读」的下限（常见代码 60 列上下）：已经要横向滚动时，
 * 再让行号栏占掉五分之一屏宽就没道理了。
 *
 * 字号 / 界面缩放通过 `fontSize` 进来（与 `editorOptions()` 里那份同值），
 * 于是 20px 字体时阈值跟着涨到约 566px —— 大字号下正文列数才是一致的。
 */
function compactGutterLimit(fontSize) {
  return Math.round(fontSize * 0.6 * 45 + 26)
}

/**
 * 这一片窗格该不该用压缩档行号栏（`narrow` 那套）。
 * 两个入口取并集：① 整屏窄屏（`shellSettings.js` 的 `isNarrowLayout()`）；
 * ② 宽屏下这片窗格自己被拖窄了（`paneWidth` 是 Monaco 容器的实测宽）。
 *
 * `paneWidth` 为 0 / 未测到（首帧、容器被 `display: none` 藏起来）时**保持宽档**：
 * 这里只是行号栏的取舍，不该因为量不到宽度就闪一下。调用方在量到之后会再下发一次。
 */
export function gutterIsCompact({ narrow = false, paneWidth = 0, fontSize = 14 } = {}) {
  if (narrow) return true
  if (!(paneWidth > 0)) return false
  return paneWidth < compactGutterLimit(fontSize)
}

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
  // 「光标平滑移动」（Monaco 的 cursorSmoothCaretAnimation）：2026-11-14 用户要求默认关。
  // 这条打破上面的默认值纪律（改造前是开的），是刻意的 —— 打字 / 点鼠标时光标自己滑过去，
  // 与「闪烁方式 = 平滑」叠在一起显得拖沓。老存档里那份 true 由 editorSettings.js 的 v8
  // 迁移改写，只改这里对老用户等于没改（默认值会被深度 watch 自动写进存档）。
  cursorSmoothCaretAnimation: false,
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
  // 默认关（2026-11-17 用户定）：分屏后状态栏只挂焦点窗格，没焦点的那片会连 22px 一起
  // 消失，切换焦点时整片正文跟着上下跳，看起来像「有的有、有的没有」。要显示去设置里打开。
  statusBar: false,
  /**
   * 悬停提示（2026-11-05 加，见 services/monaco/hover.js）。
   *
   * 与 statusBar / lowPower 同理，不是 Monaco 选项，攒在这份存档里只是图「新增一项偏好
   * 不用再开一份 localStorage」。默认开＝改造前就有悬停；关掉后鼠标停在函数上什么都不弹。
   */
  hover: true,
  /**
   * 语义级悬停（实验，2026-11-05 加，见 services/monaco/semanticHover.js）。
   *
   * **默认开（2026-11-05 用户定）**：它借用站内那颗 clang 的代码补全前端做真实类型推导，
   * 代价是首次使用时下载约 30MB 工具链、常驻约 23MiB，且**每次悬停**要跑一遍前端
   * （约 0.2–1s）。这条代价由 P0–P3 的闲置休眠与 gzip 落盘压下来之后才敢默认开：
   * 不悬停就不下载（见 hover.js 的 watch 首枪不预载），闲置 5 分钟宿主自动释放。
   * 老存档里的 false 是「默认值的自动写入」而不是用户选择，由 editorSettings 的 v7
   * 迁移统一改回 true；之后手动关掉不会再被覆盖。
   */
  semanticHover: true,
  /**
   * 「全部样例通过」的庆祝纸屑（2026-10-23 加，见 services/confetti.js）。
   *
   * 与 statusBar / lowPower 同理，不是 Monaco 选项，攒在这份存档里只是图「新增一项偏好
   * 不用再开一份 localStorage」。默认开：它是奖励反馈，绝大多数人不会想去关；
   * 关掉的入口在 设置 › 评测（`settings.judge.celebration`），关掉之后连 canvas 都不建。
   */
  celebration: true,
  /**
   * 「O0 对拍」（2026-11-01 加，见 `services/runner.js` 的 crossCheckBest）。
   *
   * 一键稿在 -O2 下跑完之后，再用 -O0 重编一遍跑同一份输入，两次输出不同就补一行
   * 「结果依赖优化级别」的提示 —— 抓的是 UB（漏 `return` 那类）。
   *
   * **默认关**（2026-11-01 用户定）。理由是它要另开一颗宿主（常驻 +22 MiB，见 HANDOFF §18.2）
   * 并对同一份代码多编一遍；编译期的四条 UB 警告（`UB_WARN_ARGS`）已经能覆盖它抓到的大半，
   * 且那部分是零成本的。所以对拍从「默认在跑的后台活」降级成「想更严一点的人自己开」。
   * 关掉时 `crossCheckBest` 在第一行就返回，第二颗宿主根本不会被建起来。
   * 开关在 设置 › 评测（`settings.judge.crossCheck`）。
   */
  crossCheck: false,
  /**
   * WA 卡片上的**差异染色**（2026-11-09 加，见 services/outputDiff.js 与 TestCaseCard.vue）。
   *
   * 不是说「判定要不要比较输出」—— 那是 checkers.js 的事，这个开关只关显示：关掉之后
   * `diffMarks` 直接返回 null，两个框里一个字都不染，连 `outputDiff.js` 都不进。
   *
   * **默认开**：染色是 WA 卡片上唯一能直接指出「哪几个字符错了」的东西，默认关等于
   * 让绝大多数人看不到它。关掉的人是「已经知道错在哪、只想看干净的输出」那一档。
   * 与 statusBar / crossCheck 同理，不是 Monaco 选项，攒在这份存档里只是图「新增一项偏好
   * 不用再开一份 localStorage」；随云同步（`cp.editorSettings` 在 SYNC_KEYS 里）一起走。
   */
  diffHighlights: true,
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
 * @param {{ markdown?: boolean, narrow?: boolean, lineCount?: number, paneWidth?: number }} [context]
 *   markdown = 当前活跃文件是不是题解（.md）。「仅 Markdown 隐藏」那一档行号与整套括号提示都看它；
 *   切 .md / 切回来时要重下发一次选项。
 *   narrow = 此刻是不是窄屏（`shellSettings.js` 的 `isNarrowLayout()`）：只用来收紧正文左侧那一栏
 *   （见 LINE_NUMBER_GUTTER）。旋屏 / 拖窗口跨过 600px 时也要重下发一次。
 *   lineCount = 当前文件的行数：压缩档的行号列宽按它的位数算（见 LINE_NUMBER_GUTTER 的 `narrow`），
 *   所以行数跨过 10 / 100 / 1000 行时同样要重下发一次。
 *   paneWidth = 这一片窗格里 Monaco 容器的实测宽（px，由 EditorPane.vue 的 ResizeObserver 喂进来）：
 *   宽屏下窗格自己被拖到 `compactGutterLimit()` 以下时也换压缩档（见 `gutterIsCompact()`）。
 */
export function editorOptions(
  settings,
  scale = 1,
  { markdown = false, narrow = false, lineCount = 1, paneWidth = 0 } = {},
) {
  const font = pick(FONT_FAMILIES, settings.fontFamily, FONT_FAMILIES[0])
  const padding = pick(PADDINGS, settings.padding, PADDINGS[1])
  const scrollbar = pick(SCROLLBAR_SIZES, settings.scrollbarSize, SCROLLBAR_SIZES[1])
  // fontSize / lineHeight 必须是整数像素，Monaco 不接受小数
  const fontSize = Math.round(settings.fontSize * scale)
  // 三态存档 → Monaco 的 'on' / 'off'（「仅 Markdown 隐藏」按当前文件折算）
  const lineNumbers = resolveLineNumbers(settings.lineNumbers, markdown)
  // 题解没有行号列，那一栏宽度归零（见 LINE_NUMBER_GUTTER）；底色由 CSS 抹成透明。
  // 压缩档的判据同时看「整屏窄不窄」与「这片窗格窄不窄」（见 gutterIsCompact 的注释），
  // 它要拿缩放后的 fontSize 判阈值，所以上面先算字号。
  const compact = gutterIsCompact({ narrow, paneWidth, fontSize })
  const gutter = compact
    ? lineNumbers === 'off'
      ? LINE_NUMBER_GUTTER.narrowPlain
      : // 多留三格字符 = 数字左右各一格半边距（CSS 的 padding-right: calc(1.5ch - 1px) 吃掉右边，左边由右对齐剩下）
        { ...LINE_NUMBER_GUTTER.narrow, minChars: String(Math.max(1, lineCount)).length + 3 }
    : LINE_NUMBER_GUTTER.wide
  const scaled = (value) => Math.round(value * scale)
  return {
    // 外观
    fontFamily: font.stack,
    fontSize,
    // 行高跟着「缩放后的字号」算，而不是各乘一次再拼：这样行高倍数这个语义才不漂
    lineHeight: Math.round(fontSize * settings.lineHeightRatio),
    fontLigatures: settings.fontLigatures,
    minimap: { enabled: settings.minimap },
    // 三态存档 → Monaco 的 'on' / 'off'（「仅 Markdown 隐藏」按当前文件折算）；
    // 压缩档那一栏的宽度也看它（不显示行号 ⇒ 只剩装饰区那一段），所以上面先算出来再复用
    lineNumbers,
    // 行号栏那两截（宽档 = Monaco 默认值，压缩档 = 「位数 + 3」个字符 + 2px 缝；来历见 LINE_NUMBER_GUTTER）。
    // 两项都显式写出来：留空就是吃 Monaco 的默认值，而下面 folding 那 16px 是**加在**
    // lineDecorationsWidth 上的 —— 版本一改默认值，这一栏的宽度就跟着漂。
    lineNumbersMinChars: gutter.minChars,
    lineDecorationsWidth: gutter.decorations,
    // 折叠控件：它自己也要占一格（computeLayout 里 `folding && showFoldingControls !== 'never'`
    // 时 `lineDecorationsWidth += 16`），`'mouseover'` 是「指针进到行号栏才浮出加号」。
    // 压缩档给的是 `'never'`：那一格是「行号右边那条空白」的全部来源，去掉它这一栏才只剩数字；
    // 折叠本身没关（`folding: true`），键盘 Ctrl+Shift+[ / ] 仍能折 —— 只是窄到这一档时本来也
    // 点不到悬停才出现的加号。
    folding: true,
    showFoldingControls: gutter.foldingControls,
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
