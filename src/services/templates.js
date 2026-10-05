export const LANGUAGES = {
  cpp: {
    id: 'cpp',
    label: 'C++',
    monaco: 'cpp',
    extension: 'cpp',
    comment: '//',
    piston: { language: 'c++', version: '10.2.0' },
  },
  python: {
    id: 'python',
    label: 'Python 3',
    monaco: 'python',
    extension: 'py',
    comment: '#',
    piston: { language: 'python', version: '3.10.0', },
  },
  // 非判题语言：只用来拿展示标签与新建时的默认扩展名（引擎不认它，见 engines/wasm.js）
  markdown: {
    id: 'markdown',
    label: 'Markdown',
    monaco: 'markdown',
    extension: 'md',
  },
}

export const LANGUAGE_IDS = Object.keys(LANGUAGES)

export function langMeta(id) {
  return LANGUAGES[id] ?? LANGUAGES.cpp
}

/**
 * Monaco languageId → 展示元数据。
 * .md 这类文件不参与判题，activeLanguage 为 null，状态栏只能按扩展名反查标签。
 * @param {string} monacoId
 */
export function langMetaByMonaco(monacoId) {
  for (const meta of Object.values(LANGUAGES)) {
    if (meta.monaco === monacoId) return meta
  }
  return null
}

const CPP_TEMPLATE = `#include <bits/stdc++.h>
using namespace std;

void solve() {
    int a, b;
    cin >> a >> b;
    cout << a + b << '\\n';
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    solve();

    return 0;
}
`

const PYTHON_TEMPLATE = `import sys


def solve() -> None:
    a, b = map(int, sys.stdin.read().split())
    print(a + b)


if __name__ == "__main__":
    solve()
`

const MARKDOWN_TEMPLATE = `# 题目名称

题目链接：

## 题意

## 思路

## 复杂度

- 时间复杂度：$O()$
- 空间复杂度：$O()$

## 参考代码

\`\`\`cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    return 0;
}
\`\`\`
`

/**
 * 内置模板表。这里是**纯内置默认**，用户改过的那一份在 services/fileTemplates.js
 * 的覆盖层里，两者刻意分开：内置改版后没自定义过的用户能自动跟着升级。
 * 导出是为了让 fileTemplates.js 能读内置值来实现「恢复默认」，本模块自身的行为不变。
 */
export const BUILTIN_TEMPLATES = { cpp: CPP_TEMPLATE, python: PYTHON_TEMPLATE, markdown: MARKDOWN_TEMPLATE }

/**
 * 旧草稿迁移 / 首启兜底文件专用：**永远给内置默认**，不认识的语言回落 cpp。
 * 刻意不读用户覆盖 —— 那两处需要一个固定语义（见 fileTemplates.js 的文件头）。
 */
export function defaultCode(id) {
  return BUILTIN_TEMPLATES[id] ?? BUILTIN_TEMPLATES.cpp
}
