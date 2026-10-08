/**
 * C / C++ / Python 的静态智能提示。
 *
 * 【为什么是静态表】Monaco 只给这三种语言内置了分词器与 languageConfiguration
 * （高亮 / 括号 / 注释 / 自动闭合 / 缩进规则都有），**没有**语义补全 —— 光靠它，
 * 输入 `vec` 只会从当前文档里找出现过的词。真正的 IntelliSense 要接 clangd / Pyright
 * 这类语言服务（另有进程、另有运行时），本仓不引。这里用一份手写的
 * 「关键字 + 常用标准库 + 代码片段」表顶上，零依赖、离线可用、两端一致。
 *
 * 【只注册补全，不注册悬停 / 签名帮助】悬停与参数提示的正文都是给人看的说明文字，
 * 按「界面文案一律不写死」得进 i18n 数据表；补全面板的条目本身是代码（`std::vector`
 * 这种），不算界面文案，所以不进消息表。
 *
 * 【注册时机】本模块被 monaco-setup.js 顶层 import，模块只求值一次，注册也就只有一次。
 * 补全项的 range 在每次 provideCompletionItems 时按光标处的单词现算，与具体文档无关。
 */
import * as monaco from 'monaco-editor'

const { CompletionItemKind, CompletionItemInsertTextRule } = monaco.languages

// ------------------------------------------------------------ C / C++

/** 关键字（含 C++ 的语境关键字与常用类型名） */
const CPP_KEYWORDS = [
  'alignas', 'alignof', 'auto', 'bool', 'break', 'case', 'catch', 'char', 'char16_t',
  'char32_t', 'class', 'const', 'constexpr', 'const_cast', 'continue', 'decltype',
  'default', 'delete', 'do', 'double', 'dynamic_cast', 'else', 'enum', 'explicit',
  'extern', 'false', 'float', 'for', 'friend', 'goto', 'if', 'inline', 'int', 'long',
  'mutable', 'namespace', 'new', 'noexcept', 'nullptr', 'operator', 'private',
  'protected', 'public', 'register', 'reinterpret_cast', 'return', 'short', 'signed',
  'sizeof', 'static', 'static_assert', 'static_cast', 'struct', 'switch', 'template',
  'this', 'throw', 'true', 'try', 'typedef', 'typeid', 'typename', 'union', 'unsigned',
  'using', 'virtual', 'void', 'volatile', 'while',
]

/** 标准库与常用全局函数。detail 里放它在标准库里的写法（是代码，不是文案） */
const CPP_LIBRARY = [
  // 容器
  { label: 'string', detail: 'std::string', kind: CompletionItemKind.Class },
  { label: 'vector', detail: 'std::vector', kind: CompletionItemKind.Class },
  { label: 'array', detail: 'std::array', kind: CompletionItemKind.Class },
  { label: 'deque', detail: 'std::deque', kind: CompletionItemKind.Class },
  { label: 'list', detail: 'std::list', kind: CompletionItemKind.Class },
  { label: 'queue', detail: 'std::queue', kind: CompletionItemKind.Class },
  { label: 'priority_queue', detail: 'std::priority_queue', kind: CompletionItemKind.Class },
  { label: 'stack', detail: 'std::stack', kind: CompletionItemKind.Class },
  { label: 'map', detail: 'std::map', kind: CompletionItemKind.Class },
  { label: 'multimap', detail: 'std::multimap', kind: CompletionItemKind.Class },
  { label: 'unordered_map', detail: 'std::unordered_map', kind: CompletionItemKind.Class },
  { label: 'set', detail: 'std::set', kind: CompletionItemKind.Class },
  { label: 'multiset', detail: 'std::multiset', kind: CompletionItemKind.Class },
  { label: 'unordered_set', detail: 'std::unordered_set', kind: CompletionItemKind.Class },
  { label: 'bitset', detail: 'std::bitset', kind: CompletionItemKind.Class },
  { label: 'pair', detail: 'std::pair', kind: CompletionItemKind.Class },
  { label: 'tuple', detail: 'std::tuple', kind: CompletionItemKind.Class },
  { label: 'complex', detail: 'std::complex', kind: CompletionItemKind.Class },
  // 常用算法
  { label: 'sort', detail: 'std::sort', kind: CompletionItemKind.Function },
  { label: 'stable_sort', detail: 'std::stable_sort', kind: CompletionItemKind.Function },
  { label: 'reverse', detail: 'std::reverse', kind: CompletionItemKind.Function },
  { label: 'unique', detail: 'std::unique', kind: CompletionItemKind.Function },
  { label: 'lower_bound', detail: 'std::lower_bound', kind: CompletionItemKind.Function },
  { label: 'upper_bound', detail: 'std::upper_bound', kind: CompletionItemKind.Function },
  { label: 'binary_search', detail: 'std::binary_search', kind: CompletionItemKind.Function },
  { label: 'nth_element', detail: 'std::nth_element', kind: CompletionItemKind.Function },
  { label: 'next_permutation', detail: 'std::next_permutation', kind: CompletionItemKind.Function },
  { label: 'max', detail: 'std::max', kind: CompletionItemKind.Function },
  { label: 'min', detail: 'std::min', kind: CompletionItemKind.Function },
  { label: 'max_element', detail: 'std::max_element', kind: CompletionItemKind.Function },
  { label: 'min_element', detail: 'std::min_element', kind: CompletionItemKind.Function },
  { label: 'swap', detail: 'std::swap', kind: CompletionItemKind.Function },
  { label: 'abs', detail: 'std::abs', kind: CompletionItemKind.Function },
  { label: 'gcd', detail: 'std::gcd', kind: CompletionItemKind.Function },
  { label: 'lcm', detail: 'std::lcm', kind: CompletionItemKind.Function },
  { label: 'accumulate', detail: 'std::accumulate', kind: CompletionItemKind.Function },
  { label: 'memset', kind: CompletionItemKind.Function },
  { label: 'memcpy', kind: CompletionItemKind.Function },
  { label: 'strlen', kind: CompletionItemKind.Function },
  { label: 'strcmp', kind: CompletionItemKind.Function },
  { label: 'printf', kind: CompletionItemKind.Function },
  { label: 'scanf', kind: CompletionItemKind.Function },
  { label: 'puts', kind: CompletionItemKind.Function },
  { label: 'getline', kind: CompletionItemKind.Function },
  { label: 'sqrt', kind: CompletionItemKind.Function },
  { label: 'pow', kind: CompletionItemKind.Function },
  { label: 'floor', kind: CompletionItemKind.Function },
  { label: 'ceil', kind: CompletionItemKind.Function },
  { label: 'round', kind: CompletionItemKind.Function },
  // 流与迭代器
  { label: 'cin', detail: 'std::cin', kind: CompletionItemKind.Variable },
  { label: 'cout', detail: 'std::cout', kind: CompletionItemKind.Variable },
  { label: 'cerr', detail: 'std::cerr', kind: CompletionItemKind.Variable },
  { label: 'endl', detail: 'std::endl', kind: CompletionItemKind.Constant },
  { label: 'begin', kind: CompletionItemKind.Method },
  { label: 'end', kind: CompletionItemKind.Method },
  { label: 'rbegin', kind: CompletionItemKind.Method },
  { label: 'size', kind: CompletionItemKind.Method },
  { label: 'empty', kind: CompletionItemKind.Method },
  { label: 'clear', kind: CompletionItemKind.Method },
  { label: 'insert', kind: CompletionItemKind.Method },
  { label: 'erase', kind: CompletionItemKind.Method },
  { label: 'find', kind: CompletionItemKind.Method },
  { label: 'count', kind: CompletionItemKind.Method },
  { label: 'front', kind: CompletionItemKind.Method },
  { label: 'back', kind: CompletionItemKind.Method },
  { label: 'push_back', kind: CompletionItemKind.Method },
  { label: 'pop_back', kind: CompletionItemKind.Method },
  { label: 'emplace_back', kind: CompletionItemKind.Method },
  { label: 'push', kind: CompletionItemKind.Method },
  { label: 'pop', kind: CompletionItemKind.Method },
  { label: 'top', kind: CompletionItemKind.Method },
  { label: 'first', kind: CompletionItemKind.Property },
  { label: 'second', kind: CompletionItemKind.Property },
  // 常量与定长整型
  { label: 'INT_MAX', detail: '<climits>', kind: CompletionItemKind.Constant },
  { label: 'INT_MIN', detail: '<climits>', kind: CompletionItemKind.Constant },
  { label: 'LLONG_MAX', detail: '<climits>', kind: CompletionItemKind.Constant },
  { label: 'LLONG_MIN', detail: '<climits>', kind: CompletionItemKind.Constant },
  { label: 'M_PI', detail: '<cmath>', kind: CompletionItemKind.Constant },
  { label: 'size_t', kind: CompletionItemKind.TypeParameter },
  { label: 'int32_t', kind: CompletionItemKind.TypeParameter },
  { label: 'int64_t', kind: CompletionItemKind.TypeParameter },
  { label: 'uint32_t', kind: CompletionItemKind.TypeParameter },
  { label: 'uint64_t', kind: CompletionItemKind.TypeParameter },
]

/** 代码片段。缩进用制表符 —— 编辑器默认 insertSpaces 关（见 editorOptions.js 的默认值纪律） */
const CPP_SNIPPETS = [
  {
    label: '#include <bits/stdc++.h>',
    insertText: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n\t$0\n\treturn 0;\n}',
  },
  { label: 'main', insertText: 'int main() {\n\t$0\n\treturn 0;\n}' },
  { label: 'fastio', insertText: 'ios::sync_with_stdio(false);\ncin.tie(nullptr);' },
  {
    label: 'fori',
    insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ++${1:i}) {\n\t$0\n}',
  },
  { label: 'forr', insertText: 'for (auto &${1:x} : ${2:v}) {\n\t$0\n}' },
  { label: 'while', insertText: 'while (${1:cond}) {\n\t$0\n}' },
  { label: 'if', insertText: 'if (${1:cond}) {\n\t$0\n}' },
  { label: 'ifelse', insertText: 'if (${1:cond}) {\n\t$0\n} else {\n\t${2}\n}' },
  { label: 'vector', insertText: 'vector<${1:int}> ${2:v};' },
  { label: 'sortv', insertText: 'sort(${1:v}.begin(), ${1:v}.end());' },
  { label: 'struct', insertText: 'struct ${1:Node} {\n\t$0\n};' },
  { label: 'func', insertText: '${1:int} ${2:name}(${3}) {\n\t$0\n}' },
  { label: 'readints', insertText: 'int ${1:n};\ncin >> ${1:n};' },
]

// ------------------------------------------------------------ Python

const PYTHON_KEYWORDS = [
  'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del',
  'elif', 'else', 'except', 'False', 'finally', 'for', 'from', 'global', 'if', 'import',
  'in', 'is', 'lambda', 'None', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return',
  'True', 'try', 'while', 'with', 'yield',
]

const PYTHON_BUILTINS = [
  { label: 'print', kind: CompletionItemKind.Function },
  { label: 'input', kind: CompletionItemKind.Function },
  { label: 'len', kind: CompletionItemKind.Function },
  { label: 'range', kind: CompletionItemKind.Function },
  { label: 'enumerate', kind: CompletionItemKind.Function },
  { label: 'zip', kind: CompletionItemKind.Function },
  { label: 'map', kind: CompletionItemKind.Function },
  { label: 'filter', kind: CompletionItemKind.Function },
  { label: 'sorted', kind: CompletionItemKind.Function },
  { label: 'reversed', kind: CompletionItemKind.Function },
  { label: 'sum', kind: CompletionItemKind.Function },
  { label: 'min', kind: CompletionItemKind.Function },
  { label: 'max', kind: CompletionItemKind.Function },
  { label: 'abs', kind: CompletionItemKind.Function },
  { label: 'round', kind: CompletionItemKind.Function },
  { label: 'pow', kind: CompletionItemKind.Function },
  { label: 'divmod', kind: CompletionItemKind.Function },
  { label: 'any', kind: CompletionItemKind.Function },
  { label: 'all', kind: CompletionItemKind.Function },
  { label: 'ord', kind: CompletionItemKind.Function },
  { label: 'chr', kind: CompletionItemKind.Function },
  { label: 'bin', kind: CompletionItemKind.Function },
  { label: 'hex', kind: CompletionItemKind.Function },
  { label: 'isinstance', kind: CompletionItemKind.Function },
  { label: 'open', kind: CompletionItemKind.Function },
  { label: 'int', kind: CompletionItemKind.Class },
  { label: 'float', kind: CompletionItemKind.Class },
  { label: 'str', kind: CompletionItemKind.Class },
  { label: 'bool', kind: CompletionItemKind.Class },
  { label: 'list', kind: CompletionItemKind.Class },
  { label: 'dict', kind: CompletionItemKind.Class },
  { label: 'set', kind: CompletionItemKind.Class },
  { label: 'tuple', kind: CompletionItemKind.Class },
  { label: 'type', kind: CompletionItemKind.Class },
  // 常用方法
  { label: 'append', kind: CompletionItemKind.Method },
  { label: 'extend', kind: CompletionItemKind.Method },
  { label: 'pop', kind: CompletionItemKind.Method },
  { label: 'sort', kind: CompletionItemKind.Method },
  { label: 'reverse', kind: CompletionItemKind.Method },
  { label: 'split', kind: CompletionItemKind.Method },
  { label: 'join', kind: CompletionItemKind.Method },
  { label: 'strip', kind: CompletionItemKind.Method },
  { label: 'replace', kind: CompletionItemKind.Method },
  { label: 'upper', kind: CompletionItemKind.Method },
  { label: 'lower', kind: CompletionItemKind.Method },
  { label: 'items', kind: CompletionItemKind.Method },
  { label: 'keys', kind: CompletionItemKind.Method },
  { label: 'values', kind: CompletionItemKind.Method },
  { label: 'get', kind: CompletionItemKind.Method },
  { label: 'index', kind: CompletionItemKind.Method },
  { label: 'startswith', kind: CompletionItemKind.Method },
]

const PYTHON_SNIPPETS = [
  {
    label: 'ifmain',
    insertText: "if __name__ == '__main__':\n\t${0:main()}",
  },
  { label: 'def', insertText: 'def ${1:name}(${2}):\n\t$0' },
  { label: 'class', insertText: 'class ${1:Name}:\n\tdef __init__(self${2}):\n\t\t$0' },
  { label: 'forrange', insertText: 'for ${1:i} in range(${2:n}):\n\t$0' },
  { label: 'forin', insertText: 'for ${1:x} in ${2:items}:\n\t$0' },
  { label: 'while', insertText: 'while ${1:cond}:\n\t$0' },
  { label: 'if', insertText: 'if ${1:cond}:\n\t$0' },
  { label: 'ifelse', insertText: 'if ${1:cond}:\n\t$0\nelse:\n\t${2:pass}' },
  { label: 'readints', insertText: 'list(map(int, input().split()))' },
  { label: 'readint', insertText: 'int(input())' },
  { label: 'readall', insertText: 'import sys\n\ndata = sys.stdin.read().split()\n$0' },
]

// ------------------------------------------------------------ 组装与注册

/**
 * 把若干段条目合成一张去重表（label 为键）。
 * 关键字排在前、片段排在最后：同样的 label 只留最先出现的那一条。
 * @param {...Array<{label: string}>} groups
 * @returns {Array<object>}
 */
function mergeItems(...groups) {
  const table = new Map()
  for (const group of groups) {
    for (const item of group) {
      if (!table.has(item.label)) table.set(item.label, item)
    }
  }
  return [...table.values()]
}

/** 关键字数组 → 补全条目 */
function keywords(words) {
  return words.map((label) => ({ label, kind: CompletionItemKind.Keyword }))
}

/** 片段 → 补全条目（Snippet 类型 + 开启 `${1:...}` 占位符解析） */
function snippets(list) {
  return list.map(({ label, insertText }) => ({
    label,
    kind: CompletionItemKind.Snippet,
    insertText,
    insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
    // 片段与普通建议同屏：editorOptions 里把 snippetsPreventQuickSuggestions 关了，
    // 两处要一起才对得上（只关一半 = 片段把同文档词汇挤掉）
    sortText: `zz_${label}`,
  }))
}

const CPP_ITEMS = mergeItems(keywords(CPP_KEYWORDS), CPP_LIBRARY, snippets(CPP_SNIPPETS))
const PYTHON_ITEMS = mergeItems(
  keywords(PYTHON_KEYWORDS),
  PYTHON_BUILTINS,
  snippets(PYTHON_SNIPPETS),
)

/**
 * 造一个「整表返回、交给 Monaco 过滤」的补全 provider。
 *
 * 表不大（百来条），每次按键都全量返回即可 —— Monaco 自己按光标处的单词前缀过滤。
 * 真正的成本在条目构造上，所以表在模块级建好一次，这里只补一个随光标变化的 range。
 * @param {Array<object>} items
 * @param {string[]} triggerCharacters
 * @param {{ swallowHash?: boolean }} [options] swallowHash：把紧贴单词左边的 `#` 也算进替换范围
 */
function makeProvider(items, triggerCharacters, options = {}) {
  const swallowHash = options.swallowHash === true
  return {
    triggerCharacters,
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      // `#` 不在 C/C++ 的 wordPattern 里，所以打 `#inc` 时 Monaco 只认单词 `inc`，
      // 默认的替换范围会漏掉那个 `#`：采用 `#include <bits/stdc++.h>` 就变成 `##include …`
      // —— 看着像「在已有内容后面又贴了一段」。把紧贴左边的 `#` 一并算进范围，指令才被整体替换
      // （顺带让过滤也对得上：Monaco 是拿 range 里的文本去比 label 的）。
      let startColumn = word.startColumn
      if (swallowHash && startColumn > 1) {
        const before = model.getLineContent(position.lineNumber).charAt(startColumn - 2)
        if (before === '#') startColumn -= 1
      }
      const range = new monaco.Range(
        position.lineNumber,
        startColumn,
        position.lineNumber,
        word.endColumn,
      )
      // insertText 必须每条都落地：不给的话 Monaco 内部（内联补全适配层）会拿到 undefined
      // 再去调 .replaceAll，直接抛异常，补全框虽弹出但控制台是红的。片段自带 insertText，
      // 展开时会覆盖这里的默认值。
      return {
        suggestions: items.map((item) => ({ insertText: item.label, ...item, range })),
      }
    },
  }
}

// `.` / `->` / `::` 之后要能接着出成员与命名空间里的名字，`<` / `#` 之后是模板参数与预处理指令
const CPP_TRIGGERS = ['.', '>', ':', '<', '#']
const PYTHON_TRIGGERS = ['.', ':']

// 只有 C / C++ 要吞 `#`（预处理指令）；Python 里 `#` 是注释开头，吞了反而错
const CPP_OPTIONS = { swallowHash: true }

monaco.languages.registerCompletionItemProvider('c', makeProvider(CPP_ITEMS, CPP_TRIGGERS, CPP_OPTIONS))
monaco.languages.registerCompletionItemProvider('cpp', makeProvider(CPP_ITEMS, CPP_TRIGGERS, CPP_OPTIONS))
monaco.languages.registerCompletionItemProvider('python', makeProvider(PYTHON_ITEMS, PYTHON_TRIGGERS))
