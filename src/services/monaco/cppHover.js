/**
 * C++ 用户自定义函数的悬停信息 —— tree-sitter 语法级。
 *
 * 【为什么是语法级】真正的「类型 + 重载 + 声明位置」要 clangd / libclang 那一套语义分析，
 * 代价是把编译器塞进 wasm（见 hover.js 文件头）。tree-sitter 只做语法树，能拿到
 * 函数定义/声明在源码里的写法、参数列表和紧贴在上方的注释，拿不到模板实例化后的真实类型。
 * 这正是本模块的定位：补上「用户自己写的函数」这块静态表覆盖不到的空白，标准库仍由
 * hover.js 的静态签名表负责。
 *
 * 【成员函数也走这里】类内定义的成员函数在源码里写着，`inline` 是隐式的、类名限定是
 * 由所在类决定的 —— 语义补全只回 `void update(int)`，拼不出 `inline void BIT::update(int)`
 * （VS Code 的 clangd 悬停就是这么显示的）。所以成员函数同样收进索引，按「名字 → 各所属类」
 * 存；调用处再按接收者的声明类型挑。标准库成员（`v.push_back`）不在本文件里，索引里没有，
 * 自然落回语义补全。
 *
 * 【为什么能给出签名】函数在源码里本来就是按 `返回类型 名字(参数)` 写的，语法树直接切出来
 * 就是它自己的签名；不需要推导，也不会像静态表那样编造。
 *
 * 【文案在哪】本模块只产出事实（签名代码 + 用户注释），悬停里怎么排、要不要加标签行，
 * 由 hover.js 决定；模块本身不出现给人读的文案。
 *
 * 【懒加载】语法引擎（web-tree-sitter 运行时 ~200KB + cpp 语法 ~4.4MB）只在第一次悬停时下载，
 * 平时不占首屏。加载失败就静默退回静态表，不阻塞编辑器。
 *
 * 【缓存】按 model 的 versionId 缓存这次解析结果，文本没变就不重新 parse；
 * 文本变了先 delete 旧树再重建。`Tree` 坐在 tree-sitter 的 wasm 线性内存里、不受 JS GC 管理，
 * 所以除了「重解析前删旧树」，还要在 model dispose（关标签页）时显式 delete，
 * 并按 LRU 只留少量活跃文件（见 CACHE / treeFor）。
 */
import { Language, Parser } from 'web-tree-sitter'
import runtimeWasmUrl from 'web-tree-sitter/tree-sitter.wasm?url'
import grammarWasmUrl from 'tree-sitter-wasms/out/tree-sitter-cpp.wasm?url'

/** 只在这些节点上认「标识符」 */
const IDENTIFIERS = new Set(['identifier', 'field_identifier', 'type_identifier'])

/** 这些祖先里出现标识符时不该弹（注释 / 字符串 / 预处理行） */
const NO_HOVER = new Set([
  'comment',
  'string_literal',
  'raw_string_literal',
  'char_literal',
  'system_lib_string',
  'preproc_include',
  'preproc_def',
])

/** 单例：Parser.init 是全局的，只初始化一次；失败后清空，下次悬停再试 */
let parserPromise = null

function loadParser() {
  if (parserPromise === null) {
    parserPromise = (async () => {
      await Parser.init({ locateFile: () => runtimeWasmUrl })
      const language = await Language.load(grammarWasmUrl)
      const parser = new Parser()
      parser.setLanguage(language)
      return parser
    })().catch((error) => {
      parserPromise = null
      throw error
    })
  }
  return parserPromise
}

/**
 * model → { versionId, tree, index }。
 *
 * 用 Map 而不是 WeakMap：`Tree` 分配在 tree-sitter 的 **wasm 线性内存**里，不受 JS GC 管理。
 * WeakMap 在 model 被回收时会悄悄丢掉条目 —— 而那条 wasm 堆上的语法树永远没人 delete，
 * 正是「关掉标签页就泄漏」的形状。所以键、清理时机都由我们自己掌握（见 treeFor）。
 */
const CACHE = new Map()
/** 同时最多留几棵语法树：再多就按最久未用淘汰（多开标签页时 wasm 堆不会一直涨） */
const MAX_TREES = 4
/** 已经挂过 onWillDispose 的 model（只挂一次，避免每次重解析叠一层监听） */
const HOOKED = new WeakSet()

/** 丢掉某个 model 的缓存并释放它的语法树（wasm 堆里那份只有 delete 才会还回去） */
function releaseTree(model) {
  const cached = CACHE.get(model)
  if (cached === undefined) return
  CACHE.delete(model)
  cached.tree.delete()
}

/**
 * 从 `function_definition` / 带函数声明的 `declaration` 上切出签名。
 * @param {import('web-tree-sitter').SyntaxNode} node
 * @param {string | null} [className] 成员函数所属的类；自由函数传 null
 * @returns {{ name: string, signature: string, definition: boolean, className: string | null } | null}
 */
function describeFunction(node, className = null) {
  const declarator = functionDeclarator(node)
  if (declarator === null) return null

  const nameNode = declarator.childForFieldName('declarator')
  const name = nameNode?.text?.split('::').pop() ?? ''
  if (!IDENTIFIERS.has(nameNode?.type) || name === '') return null

  const typeNode = node.childForFieldName('type')
  const typeText = typeNode?.text ?? ''
  const template = node.parent?.type === 'template_declaration' ? node.parent.text : ''
  const templateHead = template.slice(0, template.indexOf(node.text))
  const declaratorText = className === null ? declarator.text : `${className}::${declarator.text}`
  // 类内定义的成员函数隐式 inline。clangd 会在悬停里补出 `inline`（VS Code 就是这么显示的），
  // 这里照做；源码自己写了的、以及 constexpr / virtual（语义上另有一套写法）不重复补。
  let specifiers = ''
  if (className !== null) {
    const prefix = typeNode ? node.text.slice(0, typeNode.startIndex - node.startIndex).trim() : ''
    const words = prefix === '' ? [] : prefix.split(/\s+/u)
    if (
      !words.some(
        (word) => word === 'inline' || word === 'constexpr' || word === 'consteval' || word === 'virtual',
      )
    ) {
      words.push('inline')
    }
    specifiers = words.length ? `${words.join(' ')} ` : ''
  }
  const signature = `${templateHead}${specifiers}${typeText} ${declaratorText}`.trim()

  return {
    name,
    signature,
    definition: node.type === 'function_definition',
    className,
    // 参数个数：悬停到调用处时按它挑重载（`query(r)` 不该显示 `query(int l, int r)`）；
    // 参数表里有 `...` 或取不到时记 null = 不按个数筛
    arity: declaratorArity(declarator),
  }
}

/**
 * 函数声明符的参数个数。`f()` → 0，`f(int, int)` → 2，可变参数 / 没有参数表 → null。
 * @param {import('web-tree-sitter').SyntaxNode} declarator
 * @returns {number | null}
 */
function declaratorArity(declarator) {
  const parameters = declarator.childForFieldName('parameters')
  if (!parameters || parameters.text.includes('...')) return null
  return parameters.namedChildren.filter((child) => child.type !== 'comment').length
}

/** 深度优先找第一个指定类型的子孙节点（含自身） */
function firstDescendant(node, type) {
  if (!node) return null
  if (node.type === type) return node
  for (const child of node.namedChildren) {
    const found = firstDescendant(child, type)
    if (found) return found
  }
  return null
}

/**
 * `auto modify = [&](int p, int val) { … };` —— 把 lambda 变量当成一个函数来悬停。
 *
 * VS Code / clangd 对这种变量的悬停给的是函数式签名（`void modify(int p, int val)`），
 * 不是 `auto`：lambda 的返回类型由 body 决定。语法树里能确定的是：
 * 写了尾置返回 `-> T` 就用 T；body 里没有 `return` 就是 void；有 `return` 但没写尾置
 * 返回类型时推不出来，退成 `auto`（不自作主张猜 int）。
 * @param {import('web-tree-sitter').SyntaxNode} declaration `declaration` 节点
 * @returns {{ name: string, signature: string, definition: true, className: null, arity: number | null } | null}
 */
function describeLambda(declaration) {
  const init = declaration.childForFieldName('declarator')
  if (init?.type !== 'init_declarator') return null
  const nameNode = init.childForFieldName('declarator')
  const lambda = init.childForFieldName('value')
  if (nameNode?.type !== 'identifier' || lambda?.type !== 'lambda_expression') return null

  const body =
    lambda.childForFieldName('body') ??
    lambda.namedChildren.find((child) => child.type === 'compound_statement') ??
    null

  // 参数表在 body 之前，`[&](int p, int val)` 里的 `(…)`
  let parameters = null
  for (const child of lambda.namedChildren) {
    if (body && child.id === body.id) break
    if (child.type === 'parameter_list') {
      parameters = child
      break
    }
    parameters = firstDescendant(child, 'parameter_list')
    if (parameters) break
  }

  const head = body ? lambda.text.slice(0, body.startIndex - lambda.startIndex) : lambda.text
  const trailing = /->\s*([^(){}]+?)\s*$/u.exec(head)
  const resultType = trailing
    ? trailing[1].trim()
    : firstDescendant(body, 'return_statement') !== null
      ? 'auto'
      : 'void'

  return {
    name: nameNode.text,
    signature: `${resultType} ${nameNode.text}${parameters?.text ?? '()'}`,
    definition: true,
    className: null,
    arity: parameters
      ? parameters.text.includes('...')
        ? null
        : parameters.namedChildren.filter((child) => child.type !== 'comment').length
      : 0,
  }
}

/**
 * 类型名自己的悬停内容：`using ll = long long;` / `typedef long long ll;` /
 * `#define ll long long`。
 *
 * 为什么单独收这一类：类型别名在源码里写着定义，直接取整条声明就是 clangd 显示的样子；
 * 而语义补全协议对类型名只会回一个**裸名字**（没有 `[#类型#]` 块），格式化出来是
 * `ll;` 这种没有信息量的东西。别名索引排在语义之前，就是为了挡住这条。
 * @param {import('web-tree-sitter').SyntaxNode} node
 * @returns {{ name: string, signature: string } | null}
 */
function describeAlias(node) {
  const signature = node.text.trim()
  if (signature === '') return null
  let nameNode = null
  if (node.type === 'alias_declaration') {
    nameNode = node.childForFieldName('name')
  } else if (node.type === 'type_definition') {
    nameNode = node.childForFieldName('declarator')
  } else if (node.type === 'preproc_def') {
    nameNode = node.childForFieldName('name')
  }
  if (nameNode === null || !IDENTIFIERS.has(nameNode.type)) return null
  return { name: nameNode.text, signature }
}

/**
 * 调用处传了几个实参。语法树比数逗号可靠：`f(make_pair(1, 2))` 明确是一个实参。
 * @param {import('web-tree-sitter').SyntaxNode} call call_expression
 * @returns {number | null}
 */
function callArgumentCount(call) {
  const args = call.childForFieldName('arguments')
  if (!args) return null
  return args.namedChildren.filter((child) => child.type !== 'comment').length
}

/** 这条函数的参数个数能不能接住这次调用；null 视作「不筛」 */
function fitsArity(item, arity) {
  return arity === null || item.arity === null || item.arity === arity
}

/** 顺着 declarator 链找 function_declarator（`int (*f)(int)` 这种多一层指针） */
function functionDeclarator(node) {
  let current = node.childForFieldName('declarator')
  while (current) {
    if (current.type === 'function_declarator') return current
    if (
      current.type === 'pointer_declarator' ||
      current.type === 'reference_declarator' ||
      current.type === 'parenthesized_declarator'
    ) {
      current = current.childForFieldName('declarator')
      continue
    }
    return null
  }
  return null
}

/** 紧贴函数上方、最多隔一个空行的连续注释 */
function leadingComment(node) {
  const outer = node.parent?.type === 'template_declaration' ? node.parent : node
  const parts = []
  let sibling = outer.previousNamedSibling
  while (sibling && sibling.type === 'comment') {
    if (outer.startPosition.row - sibling.endPosition.row > 3) break
    parts.unshift(cleanComment(sibling.text))
    sibling = sibling.previousNamedSibling
  }
  return parts.filter(Boolean).join('\n')
}

/** `// x` / `/* x *\/` 去掉符号后按行拼回去 */
function cleanComment(raw) {
  if (raw.startsWith('//')) {
    return raw
      .split('\n')
      .map((line) => line.replace(/^\s*\/\/\s?/u, ''))
      .join('\n')
      .trim()
  }
  return raw
    .replace(/^\/\*+/, '')
    .replace(/\*+\/$/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*+\s?/u, ''))
    .join('\n')
    .trim()
}

/**
 * 函数所在的类（不是成员函数就返回 null）。嵌套类按 `Outer::Inner` 拼。
 * @param {import('web-tree-sitter').SyntaxNode} node
 * @returns {string | null}
 */
function enclosingClass(node) {
  const parts = []
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (
      parent.type === 'class_specifier' ||
      parent.type === 'struct_specifier' ||
      parent.type === 'union_specifier'
    ) {
      const name = parent.childForFieldName('name')?.text
      if (name) parts.unshift(name)
    }
    if (parent.type === 'translation_unit' || parent.type === 'namespace_definition') break
  }
  return parts.length ? parts.join('::') : null
}

/**
 * `BIT bit;` / `BIT bit[N];` / `BIT bit{...};` 里的 `bit`。
 * @param {import('web-tree-sitter').SyntaxNode | null} node
 * @returns {string | null}
 */
function declaredName(node) {
  let current = node
  while (current) {
    // 类内字段在语法树里是 field_identifier，普通变量是 identifier
    if (current.type === 'identifier' || current.type === 'field_identifier') return current.text
    if (
      current.type === 'init_declarator' ||
      current.type === 'array_declarator' ||
      current.type === 'pointer_declarator' ||
      current.type === 'reference_declarator' ||
      current.type === 'parenthesized_declarator'
    ) {
      current = current.childForFieldName('declarator')
      continue
    }
    return null
  }
  return null
}

/**
 * 一遍遍历收集：
 * - `functions`：自由函数 / lambda 变量，名字 → 信息（定义优先于同名声明）；
 * - `members`：成员函数，名字 → 信息数组（不同类可以有同名方法、同类可以有重载）；
 * - `vars`：变量名 → 声明里的类型文本（`bit.update` 靠它判断接收者属于哪个类）；
 * - `variables`：变量 / 参数 / 成员字段，名字 → 声明信息数组（悬停显示类型）；
 * - `types`：类型别名 / typedef / 宏，名字 → 定义原文（悬停 `ll` 显示 `using ll = long long;`）。
 */
function buildIndex(tree) {
  /** @type {Map<string, object>} */
  const functions = new Map()
  /** @type {Map<string, object[]>} */
  const members = new Map()
  /** @type {Map<string, string>} */
  const vars = new Map()
  /** @type {Map<string, object[]>} */
  const variables = new Map()
  /** @type {Map<string, string>} */
  const types = new Map()

  const visit = (node) => {
    if (
      node.type === 'alias_declaration' ||
      node.type === 'type_definition' ||
      node.type === 'preproc_def'
    ) {
      const alias = describeAlias(node)
      if (alias !== null) types.set(alias.name, alias.signature)
    }
    if (node.type === 'function_definition' || node.type === 'declaration') {
      const className = enclosingClass(node)
      const info = describeFunction(node, className)
      if (info !== null) {
        if (className === null) {
          const existing = functions.get(info.name)
          if (!existing || (!existing.definition && info.definition)) {
            functions.set(info.name, { ...info, comment: leadingComment(node) })
          }
        } else {
          const list = members.get(info.name) ?? []
          // 同一个类里的重载要各存各的：`query(int)` 和 `query(int, int)` 是两条
          const existing = list.find(
            (item) => item.className === className && item.signature === info.signature,
          )
          if (existing === undefined) {
            list.push({ ...info, comment: leadingComment(node) })
          } else if (!existing.definition && info.definition) {
            Object.assign(existing, info, { comment: leadingComment(node) })
          }
          members.set(info.name, list)
        }
      }
    }
    if (node.type === 'declaration') {
      // lambda 变量也收进来，悬停时按函数签名显示（`auto modify = [&](int p, int val)`）
      const lambda = describeLambda(node)
      if (lambda !== null && !functions.has(lambda.name)) {
        functions.set(lambda.name, { ...lambda, comment: leadingComment(node) })
      }
    }
    if (node.type === 'declaration' || node.type === 'parameter_declaration') {
      const type = node.childForFieldName('type')?.text
      const name = declaredName(node.childForFieldName('declarator'))
      if (type && name) vars.set(name, type)
    }
    if (
      node.type === 'declaration' ||
      node.type === 'parameter_declaration' ||
      node.type === 'field_declaration'
    ) {
      collectVariables(node, variables, vars)
    }
    for (const child of node.namedChildren) {
      if (child) visit(child)
    }
  }

  visit(tree.rootNode)
  return { functions, members, vars, variables, types }
}

/** 取当前 model 的语法树与函数索引；文本没变就复用 */
function treeFor(model, parser) {
  const cached = CACHE.get(model)
  if (cached !== undefined && cached.versionId === model.getVersionId()) {
    // LRU：命中就挪到队尾，让最久没用的那棵先被淘汰
    CACHE.delete(model)
    CACHE.set(model, cached)
    return cached
  }

  const tree = parser.parse(model.getValue())
  if (tree === null) return null
  if (cached !== undefined) {
    CACHE.delete(model)
    cached.tree.delete()
  }
  const fresh = { versionId: model.getVersionId(), tree, ...buildIndex(tree) }
  CACHE.set(model, fresh)

  // 关标签页 / 换文件时 Monaco 会 dispose 这个 model：WeakMap 挡不住 wasm 堆里的泄漏，
  // 这里显式把 Tree 还回去。只在第一次见到这个 model 时挂，避免每次重解析叠一层监听。
  if (!HOOKED.has(model)) {
    HOOKED.add(model)
    model.onWillDispose?.(() => releaseTree(model))
  }
  // 超出上限从最久没用的那棵开始收 —— 被挤出去的下次悬停会重新解析
  for (const stale of CACHE.keys()) {
    if (CACHE.size <= MAX_TREES) break
    releaseTree(stale)
  }
  return fresh
}

/**
 * 光标处的用户自定义函数。
 * @param {import('monaco-editor').editor.ITextModel} model
 * @param {{ lineNumber: number, column: number }} position
 * @returns {Promise<{ signature: string, comment: string } | null>}
 */
export async function findCppFunction(model, position) {
  let parser
  try {
    parser = await loadParser()
  } catch {
    // 语法引擎加载失败（离线 / 资源缺失）就当作没有，交给静态签名表
    return null
  }

  const state = treeFor(model, parser)
  if (state === null) return null

  let node = state.tree.rootNode.descendantForIndex(model.getOffsetAt(position))
  while (node && !IDENTIFIERS.has(node.type)) node = node.parent
  if (!node) return null

  // 注释 / 字符串 / #include 行里不弹
  for (let parent = node; parent; parent = parent.parent) {
    if (NO_HOVER.has(parent.type)) return null
  }

  // 只认这些位置：调用的函数名、函数声明的名字、成员调用的方法名。
  // 这样局部变量重名、以及 `obj.field` 这种取字段都不会误弹。
  const parent = node.parent
  const isCallee =
    parent?.type === 'call_expression' && parent.childForFieldName('function')?.id === node.id
  const isDeclaratorName =
    parent?.type === 'function_declarator' &&
    parent.childForFieldName('declarator')?.id === node.id
  // `obj.update(...)` / `ptr->update(...)`：名字是 field_expression 的 field，
  // 而这个 field_expression 正是外层 call_expression 的 function。
  const isMemberCallee =
    parent?.type === 'field_expression' &&
    parent.childForFieldName('field')?.id === node.id &&
    parent.parent?.type === 'call_expression' &&
    parent.parent.childForFieldName('function')?.id === parent.id
  // `auto modify = [&](…) { … };` 的变量名：悬停按 lambda 的函数签名显示
  const isLambdaName =
    parent?.type === 'init_declarator' && parent.childForFieldName('declarator')?.id === node.id

  if (isMemberCallee) return pickMember(state, parent, node.text)
  if (isLambdaName) {
    const lambda = state.functions.get(node.text)
    if (lambda !== undefined) return lambda
  }
  if (isDeclaratorName) {
    // 类内声明 / 定义的名字：按当前所在的类找，找到同名重载后再按这个声明自己的参数个数挑
    const className = enclosingClass(node)
    const match =
      className === null
        ? state.functions.get(node.text)
        : (state.members.get(node.text) ?? []).find(
            (item) => item.className === className && fitsArity(item, declaratorArity(node.parent)),
          )
    if (match !== undefined) return match
  }
  if (isCallee) {
    const callee = state.functions.get(node.text)
    if (callee !== undefined) return callee
  }

  // 类型别名 / typedef / 宏：`ll` 这类名字在语义补全里只回一个裸名字（`ll;`），
  // 不是签名；源码里写着定义，直接按那一行显示（与 clangd 一致）。
  const alias = state.types.get(node.text)
  if (alias !== undefined) {
    return { name: node.text, signature: alias, definition: false, className: null, comment: '' }
  }

  // 变量 / 参数 / 成员字段：悬停显示声明里的类型（`int p`、`vector<int> &a`）
  const variable = findVariable(state.variables, node.text, model.getOffsetAt(position))
  if (variable !== null) {
    return {
      name: variable.name,
      signature: variable.signature,
      definition: false,
      className: null,
      comment: '',
      // 声明写的是 `auto`：语法层只能给推测，上游开了语义分析就问 clang 要真实类型
      auto: variable.auto === true,
    }
  }
  return null
}

/**
 * 声明里的类型文本 + 声明符文本 → 悬停签名的样子。
 * `int p`、`vector<int> &a`、`int data[10]` 都按源码写法保留。
 *
 * `auto` 只做**语法级**的尽力推导（初始化式是标识符 / 字面量时），否则原样保留 `auto`：
 * 真实类型要 clang 的语义分析，见 hover.js 里对 `auto` 变量的处理。
 * @param {import('web-tree-sitter').SyntaxNode} declaration
 * @param {import('web-tree-sitter').SyntaxNode} declarator
 * @param {Map<string, string>} vars 变量名 → 声明类型
 */
function declaratorSignature(declaration, declarator, vars) {
  const type = declaration.childForFieldName('type')?.text ?? ''
  const text = declarator.type === 'init_declarator'
    ? declarator.childForFieldName('declarator')?.text ?? ''
    : declarator.text
  if (text === '') return null
  if (/\bauto\b/u.test(type)) {
    const inferred = inferAutoType(declarator, vars)
    if (inferred !== null) return `${inferred} ${text}`
  }
  return type === '' ? text : `${type} ${text}`
}

/**
 * `auto t = m;` / `auto x = 1;` 这类声明能推出来的类型 —— 只看初始化式的**语法形状**。
 *
 * 只覆盖两种有把握的情况：初始化式是同一个索引里登记过的变量（借它的声明类型），
 * 或字面量。其余（函数调用、运算、`new`、列表初始化）一律返回 null，保留 `auto`，
 * 不猜。开了语义悬停时上游会优先问 clang，这里只是没开语义时的兜底。
 * @param {import('web-tree-sitter').SyntaxNode} declarator
 * @param {Map<string, string>} vars
 * @returns {string | null}
 */
function inferAutoType(declarator, vars) {
  if (declarator.type !== 'init_declarator') return null
  const value = declarator.childForFieldName('value')
  if (!value) return null
  if (value.type === 'identifier') {
    const declared = vars.get(value.text)
    // `auto t = m;` 拷贝的是值而不是引用：去掉声明里的 `&` / `const`
    return declared === undefined ? null : declared.replace(/&+$/u, '').replace(/^const\s+/u, '').trim()
  }
  if (value.type === 'number_literal') return numberType(value.text)
  if (value.type === 'char_literal') return 'char'
  if (value.type === 'string_literal') return 'const char*'
  if (value.type === 'true' || value.type === 'false') return 'bool'
  return null
}

/** 数字字面量的类型：有小数点 / 指数 → 浮点，整数按后缀判断 */
function numberType(text) {
  const hex = /^0[xX]/u.test(text)
  const lower = text.toLowerCase()
  // 十六进制里的 `e` / 末尾的 `F` 是数字位，不是指数 / 浮点后缀
  if (!hex && (lower.includes('.') || lower.includes('e'))) {
    return /[fF]$/u.test(text) ? 'float' : 'double'
  }
  const suffix = /([uUlLzZ]+)$/u.exec(text)?.[1] ?? ''
  const unsigned = /[uU]/u.test(suffix) ? 'unsigned ' : ''
  if (/ll|LL/u.test(suffix)) return `${unsigned}long long`
  if (/l|L/u.test(suffix)) return `${unsigned}long`
  return `${unsigned}int`
}

/**
 * 变量的作用范围：参数属于整个函数 / lambda，局部变量属于所在语句块，
 * 成员字段属于类体，全局变量属于整个文件。用范围挑「离光标最近的那次声明」，
 * 循环里重复出现的 `i` 才不会被另一处同名变量顶掉。
 * @param {import('web-tree-sitter').SyntaxNode} node
 */
function variableScope(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (
      parent.type === 'function_definition' ||
      parent.type === 'lambda_expression' ||
      parent.type === 'compound_statement' ||
      parent.type === 'class_specifier' ||
      parent.type === 'struct_specifier' ||
      parent.type === 'union_specifier' ||
      parent.type === 'declaration' ||
      parent.type === 'translation_unit'
    ) {
      return parent
    }
  }
  return null
}

/**
 * 把 `int a, b;` / `const T &x` / 参数 / 成员字段登记成「名字 → 声明信息」。
 * @param {import('web-tree-sitter').SyntaxNode} node declaration / parameter_declaration / field_declaration
 * @param {Map<string, object[]>} out
 * @param {Map<string, string>} vars 变量名 → 声明类型（`auto` 推导要用）
 */
function collectVariables(node, out, vars) {
  const scope = variableScope(node)
  if (scope === null) return
  // 声明写的是不是 `auto`：悬停时据此决定要不要让语义层给出真实类型
  const declaredType = node.childForFieldName('type')?.text ?? ''
  const isAuto = /\bauto\b/u.test(declaredType)

  const declarators = []
  const add = (candidate) => {
    if (candidate && !declarators.some((item) => item.id === candidate.id)) declarators.push(candidate)
  }
  add(node.childForFieldName('declarator'))
  // `int a, b;` 这类：declarator 字段只给第一个，其余的也在 namedChildren 里
  for (const child of node.namedChildren) {
    if (
      child.type === 'identifier' ||
      child.type === 'init_declarator' ||
      child.type === 'array_declarator' ||
      child.type === 'pointer_declarator' ||
      child.type === 'reference_declarator' ||
      child.type === 'parenthesized_declarator'
    ) {
      add(child)
    }
  }

  for (const declarator of declarators) {
    const name = declaredName(declarator)
    const signature = declaratorSignature(node, declarator, vars)
    if (name === null || signature === null) continue
    const list = out.get(name) ?? []
    list.push({ name, signature, start: scope.startIndex, end: scope.endIndex, auto: isAuto })
    out.set(name, list)
  }
}

/**
 * 光标处该取哪次声明：同名声明里，作用范围包含光标且范围最小的那条。
 * @param {Map<string, object[]>} variables
 * @param {string} name
 * @param {number} offset
 */
function findVariable(variables, name, offset) {
  const list = variables.get(name)
  if (!list?.length) return null
  let best = null
  for (const item of list) {
    if (offset < item.start || offset > item.end) continue
    if (best === null || item.end - item.start < best.end - best.start) best = item
  }
  return best
}

/**
 * 成员调用的目标：同名方法可能出现在多个类里、同一个类里还可能有重载，按顺序筛：
 * 1. 先按接收者的声明类型（`BIT bit;` 的 `bit`）锁类 —— 类型对不上就放弃，
 *    让标准库成员（`v.push_back`）继续走语义补全；
 * 2. 再按这次调用的实参个数挑重载（`query(r)` 只有 `query(int)`）；
 * 3. 类型不明（`arr[i].update` 这类）时，唯一能匹配的那条才敢用。
 * @param {{ members: Map<string, object[]>, vars: Map<string, string> }} state
 * @param {import('web-tree-sitter').SyntaxNode} field 外层 field_expression
 * @param {string} name 方法名
 */
function pickMember(state, field, name) {
  const list = state.members.get(name)
  if (!list?.length) return null

  const arity = callArgumentCount(field.parent)
  const receiver = field.childForFieldName('argument')
  if (receiver?.text === 'this') {
    const className = enclosingClass(field)
    return list.find((item) => item.className === className && fitsArity(item, arity)) ?? null
  }

  const type = receiver?.type === 'identifier' ? state.vars.get(receiver.text) : undefined
  if (type === undefined) {
    const same = list.filter((item) => fitsArity(item, arity))
    return same.length === 1 ? same[0] : null
  }
  return (
    list.find((item) => typeNamesClass(type, item.className) && fitsArity(item, arity)) ?? null
  )
}

/**
 * `BIT` 是否出现在声明类型里：`BIT bit` 里是，`vector<int> bit` 里不是。
 * 只比最后一段类名 —— 嵌套类 `Outer::Inner` 在类型里常写成 `Outer::Inner`，也取 `Inner`。
 * @param {string} typeText
 * @param {string} className
 */
function typeNamesClass(typeText, className) {
  const bare = className.split('::').pop()
  return new RegExp(`\\b${bare}\\b`).test(typeText)
}
