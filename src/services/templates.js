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
}

export const LANGUAGE_IDS = Object.keys(LANGUAGES)

export function langMeta(id) {
  return LANGUAGES[id] ?? LANGUAGES.cpp
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

const TEMPLATES = { cpp: CPP_TEMPLATE, python: PYTHON_TEMPLATE }

export function defaultCode(id) {
  return TEMPLATES[id] ?? TEMPLATES.cpp
}
