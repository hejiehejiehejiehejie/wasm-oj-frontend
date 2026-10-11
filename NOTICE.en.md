# Third-party open-source notices (NOTICE)

This site (unnamed, repository `wasm-oj-frontend`) wrote only the interface, the interaction and the judging logic itself; what actually makes it run is a batch of open-source projects.
This file is the **single list of third-party components**, for two purposes: **giving credit**, and **keeping the copyright and licence notices each project requires** when the site is distributed.

The short, user-facing version is the "Acknowledgements and open-source licences" section of `guide.en.html` — **the complete version (this file) is generated into `notice.en.html` on the site** (`npm run notice`), and that page is linked from the guide; **this file is the one that counts**.

> The Chinese version of this list is `NOTICE.md` → `notice.html`. **The two are kept in step by hand**: whenever you change one, change the other. Sections and table rows correspond one to one.

## Maintenance rules

- Five things force a return to this file: changing `package.json` (adding/removing a dependency, or a major-version bump), replacing a toolchain directory under `public/wasm/`, replacing the rendering runtime under `public/md/` (it tracks the katex / marked versions), replacing the extension package in `public/extension/`, or replacing the bundled fonts under `public/fonts/`.
- **Always verify version numbers on the real artifact — never write them from memory** (the commands are at the end of this file).
- The site is publicly deployed and its output carries other people's code, so this list is not a "local memo" but part of the distribution obligation.
- This file lists **other people's** projects only. This repository currently has no `LICENSE` file (i.e. "all rights reserved" by default); that does not affect the obligations of the third-party licences above, but it is a separate decision if the site's own code is ever open-sourced.

> Last verified: **2026-10-11** (the extension package under `public/extension/` was replaced → `cc-for-web-2.66.4.zip`. Two behaviour changes, both conveniences for cloud-sync sign-in: ① **verification-code fill-in** — when the user clicks the button on this site, the extension writes the site's code into the Last name field of the Codeforces Social settings page and submits it (that one field only; no cookies, no credentials); ② **sign-in pre-check** — the extension compares locally whether the handle this browser is signed in as matches the one the user entered, answering with only four enumerations (`match` / `mismatch` / `not-logged-in` / `unknown`) and **never the handle itself**. The manifest changes accordingly: `host_permissions` 183 → 184 and `content_scripts` 2 → 3 (the extra one is registered for `https://codeforces.com/settings/social*` only), with no new API `permissions`. These are behaviour/manifest changes rather than dependency changes, so the version numbers and licences of the third-party components inside the package are **unchanged**).
>
> Verified before that: **2026-10-10** (the extension package under `public/extension/` was replaced → `cc-for-web-2.66.3.zip`. Three behaviour changes: ① the extension now supports **Firefox for Android** (`gecko_android` added to the manifest, minimum 142), and two fatal crashes in the background script on Android were fixed (the `contextMenus` / `commands` namespaces do not exist on Android; the old code threw a TypeError during module evaluation, killing the whole background — on Android this showed up as the site reporting "extension not detected" and parse clicks doing nothing — verified on a real device running Firefox 143); ② the injection scope for problem **source** sites is now derived from the parser registry, enlarging `host_permissions` and the auto-parse content script (6 → 183 patterns / 2 → 182 patterns); ③ the Firefox manifest description now notes "Fork of Competitive Companion, now also working on Firefox for Android.". All three are behaviour/manifest changes rather than dependency changes, so the version numbers and licences of the third-party components inside the package are **unchanged**).
>
> Verified two rounds earlier: **2026-10-02** (three monospace fonts are now bundled for the code area: JetBrains Mono 2.211 / Fira Code 5.002 / Cascadia Code 2407.024, with the source files under `public/fonts/`. **Latin-subset woff2 only (Regular + Bold, 149KB in total)**, taken from the [@fontsource](https://github.com/fontsource/fontsource) 5.3.0 builds; all three upstreams are **OFL-1.1**. The version numbers were read off the fonts themselves — the fontsource packages lag upstream, e.g. Fira Code is 6.2 upstream but 5.002 inside the package, so naming the files after the upstream release tags would have recorded them wrongly. This adds assets rather than dependencies, so `package.json` and the runtime manifest are **unchanged**).
>
> Verified three rounds earlier: **2026-10-01** (the extension package under `public/extension/` was replaced twice the same day: first → `cc-for-web-2.66.1.zip` (same behaviour change as the previous entry, dropping the `cph-` handshake prefix), then → `cc-for-web-2.66.2.zip` (behaviour change: the "pending-samples list" mechanism was removed entirely — the extension no longer stores a list; instead, when the user opens a problem page, the extension asks the page on the spot whether that problem exists in the workspace with empty samples (new messages `cp-query-need` / `cp-need-answer`, see `src/composables/useCompanionBridge.js`), and only fetches if so; a cross-repository contract that must ship in lockstep with this site). Both are behaviour changes rather than dependency changes, so the version numbers and licences of the third-party components inside it are **unchanged**).
>
> Verified four rounds earlier: **2026-10-01** (the extension package under `public/extension/` was replaced → `cc-for-web-2.66.0.zip`. The only change is that the handshake message names between the extension and the page dropped the `cph-` prefix and became `cp-*` (a cross-repository contract, see `src/composables/useCompanionBridge.js`); that is a behaviour change rather than a dependency change, so the version numbers and licences of the third-party components inside it are **unchanged**).
>
> Verified five rounds earlier: **2026-09-30** (two things the same day: ① the extension package under `public/extension/` was replaced → `cc-for-web-2.65.3.zip`, the behaviour change being "the delivery targets can now be switched straight from this site's settings page", with the version numbers and licences of the third-party components inside it **unchanged**;
> ② the notes feature shipped, adding a self-hosted Markdown / LaTeX rendering runtime under `public/md/` (KaTeX 0.18.9 + marked 14.0.0), and consequently promoting `marked` / `dompurify` / `katex` to **direct dependencies** of this site.
> The dependency figures were re-verified against the same day's `package-lock.json`: `lockfileVersion: 3`, **94** dependencies in total: **30** production, **64** development).

---

## 1. Site runtime dependencies (shipped with the build)

| Component | Version | Licence | Purpose |
| --- | --- | --- | --- |
| [Vue](https://github.com/vuejs/core) | 3.5.42 | MIT | The framework behind the whole interface |
| [Monaco Editor](https://github.com/microsoft/monaco-editor) | 0.56.0 | MIT | The code editor (VS Code's editor core) |
| ├─ [marked](https://github.com/markedjs/marked) | 14.0.0 | MIT | Transitive dependency of Monaco (Markdown rendering) |
| └─ [DOMPurify](https://github.com/cure53/DOMPurify) | 3.4.8 | **MPL-2.0 OR Apache-2.0** (dual-licensed) | Transitive dependency of Monaco (HTML sanitising). **The only non-permissive runtime dependency on this site** |
| [KaTeX](https://github.com/KaTeX/KaTeX) | 0.18.9 | MIT | LaTeX math rendering for the notes. **Not in the main bundle** — only downloaded on demand from `public/md/` (see 2.2) |
| [@runno/wasi](https://github.com/taybenlor/runno) | 0.10.0 | MIT | The local sandbox's WASI runtime: instantiate, feed stdin, `kill()` (TLE relies on it) |

The notes feature (shipped 2026-09-30) also promoted those two Monaco transitive dependencies to **direct dependencies of this site**: `mdRenderer.js` imports DOMPurify directly (it was already in the main bundle via Monaco), while marked is self-hosted in `public/md/` for on-demand download in addition to the copy Monaco pulls into the main bundle. What was verified to actually ship in the build (by searching `dist/assets/main-*.js`):
`DOMPurify` ✓, `marked` ✓ (the copy from Monaco's dependency tree), `katex` ✗ (the main bundle contains only the word "katex" in UI copy and file names).
So "downloaded on demand" does not mean "a user who never downloaded anything has no marked in the shell" — **marked is in the main bundle already**; the copy under `public/md/` keeps the renderer aligned with the site's own version, and keeps katex out of first paint entirely.

The rest of the 30 "production dependencies" in `package-lock.json` (`@vue/compiler-*`, `@babel/*`, `entities`, `postcss`, `magic-string`, `source-map-js`, `estree-walker`, `csstype`, `nanoid`, `picocolors` and so on) are Vue's compiler chain: used at **build time** only, and not shipped in the output.

## 2. Self-hosted runtimes (under `public/`, none of them reaches the browser until the user clicks "download")

What the two have in common: both are **upstream artifacts taken into this repository as-is** (this site changed nothing; the copy under `public/md/` is produced by `scripts/prepare-md-runtime.mjs` from `node_modules`), and neither is **in the Service Worker precache manifest** —— a user who never clicked download has not a single byte of them in the shell. The upstream notices are therefore distributed along with the files; the full licence texts live in the corresponding upstream repositories.

### 2.1 Local sandbox toolchain (`public/wasm/`, about 76MB)

| Component | Version | Licence | Where it lands and what it is for |
| --- | --- | --- | --- |
| [LLVM / clang](https://github.com/llvm/llvm-project) | 8.0.1 | Apache-2.0 WITH LLVM-exception | `public/wasm/8.0.1/clang.wasm` (31.2MB) —— compiling C++ locally. The prebuilt artifact comes from [binji/wasm-clang](https://github.com/binji/wasm-clang), distributed via runno's `langs/` |
| [LLVM lld](https://github.com/llvm/llvm-project) (wasm-ld) | same generation as above | Apache-2.0 WITH LLVM-exception | `public/wasm/8.0.1/wasm-ld.wasm` (19.5MB) —— linking |
| [wasi-libc](https://github.com/WebAssembly/wasi-libc) | with the wasi-sysroot above | Apache-2.0 WITH LLVM-exception | `libc.a`, `libm.a`, `libpthread.a`, `libdl.a`, `librt.a`, `libutil.a`, `libxnet.a`, `libcrypt.a`, `libresolv.a`, `libwasi-emulated-mman.a`, `crt1.o` inside `clang-fs.tar.gz` —— the C standard library and startup code |
| [libc++ / libc++abi](https://github.com/llvm/llvm-project) | same as above | MIT (University of Illinois / NCSA family) | `libc++.a`, `libc++abi.a` in the same tar —— the C++ standard library (the likes of `<vector>` / `<string>`) |
| [compiler-rt](https://github.com/llvm/llvm-project) | same as above | Apache-2.0 WITH LLVM-exception | `libclang_rt.builtins-wasm32.a` in the same tar —— compiler runtime builtins |
| [CPython](https://github.com/python/cpython) | 3.11.3 | PSF License | `public/wasm/python-3.11.3/python.wasm` + `python-fs.tar.gz` —— running Python locally. A wasm32-wasi build with the standard library in `usr/local/lib/python311.zip`; the build likewise comes from runno's `langs/` |

### 2.2 Notes rendering runtime (`public/md/`, about 578KB)

Parsing Markdown and rendering LaTeX for the notes takes the same "download on demand" route (`src/services/mdRuntime.js`): before the download there is only a hint line, afterwards it lands in the `cp-md-runtime` Cache Storage bucket, and the "local runtimes" section of the settings page can uninstall it together with the cache and the globals it put on the browser.

| Component | Version | Licence | Where it lands and what it is for |
| --- | --- | --- | --- |
| [KaTeX](https://github.com/KaTeX/KaTeX) | 0.18.9 | MIT | `katex.min.js` + `katex.min.css` + `fonts/KaTeX_*.woff2` (20 weights) —— the bulk of the size |
| [marked](https://github.com/markedjs/marked) | 14.0.0 | MIT | `marked.min.js` —— Markdown parsing (same version as the copy in the main bundle from section 1) |

- **woff2 only**: KaTeX's CSS references both woff and ttf fallbacks; copying everything would be 1.1MB, whereas woff2 comes to 296KB, so the script strips the fallbacks (and asserts no leftovers afterwards).
- `public/md/assets.json` is the **single source of truth** for the download manifest (`{ katex, marked, bytes, assets[] }`, written by the script), so the versions need not be transcribed here —— but this file's rule is "measure it on the artifact", so the table above still defers to `public/md/assets.json`.

## 3. UI assets

| Asset | Licence | Source |
| --- | --- | --- |
| seti-ui's `icons/cpp.svg` | MIT | [jesseweed/seti-ui](https://github.com/jesseweed/seti-ui) (VS Code's default file icon theme, glyph `\E01A`). Used in `SOLID_PATHS.cpp` of `src/components/AppIcon.vue`; the source is recorded in a comment in that file |
| Bundled code fonts [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) 2.211 / [Fira Code](https://github.com/tonsky/FiraCode) 5.002 / [Cascadia Code](https://github.com/microsoft/cascadia-code) 2407.024 | **OFL-1.1** (each ships its own SIL OFL; redistribution is permitted) | `public/fonts/*.woff2`, **latin subsets with Regular and Bold only** (6 files, 149KB), taken from the [@fontsource](https://github.com/fontsource/fontsource) 5.3.0 builds; the `@font-face` rules in `src/styles/fonts.css` are the single place they are declared. The filenames carry the fonts' **own** internal version numbers, not the upstream release tags |

- The other icons (`play` / `gear` / `files` / `cases` / `file-plus` / `folder-plus` / `python` and so on) are inline SVGs drawn for this site in the 24×24 stroked style of lucide; **no icon dependency was introduced**.
- The UI (everything outside the code area) still goes entirely through the system font stack (`-apple-system` / PingFang SC / …); **no** self-hosted or CDN webfont.
- **The code area is the exception**: the three monospace fonts in the table above are self-hosted, but they are downloaded **only when the user picks one** under Settings › Editor › Font (anyone who never picks one downloads nothing). They are also not in the Service Worker precache list; they land in the shell bucket through the first-use caching strategy — which is why the filenames must carry version numbers, since an in-place overwrite would leave existing users with the old file forever.
- The PWA icons (`public/icons/*.png`), `favicon.svg` and `og-cover.png` are all made for this site.
- ⚠️ **To be confirmed**: the Python two-snake mark in `SOLID_PATHS.python` has **no recorded source** in the code (its shape matches the Python mark in simple-icons). Once it is confirmed who added it and where it came from, add a row to this table.

## 4. Browser extension CC for Web

The package is distributed from this site (`public/extension/cc-for-web-<version>.zip`, currently **2.66.4**; re-versioned on 2026-10-11, the behaviour changes being two conveniences for cloud-sync sign-in: the extension fills this site's verification code into the Last name field of the Codeforces Social settings page when the user clicks the button (that one field only, no cookies read), and it compares locally whether the handle this browser is signed in as matches the one the user entered (answering with four enumerations only, never the handle itself); `host_permissions` therefore go 183 → 184 and `content_scripts` 2 → 3; the third-party components inside are unchanged from the table below), and its source lives in another repository (`cph-companion`).

| Component | Version | Licence | Notes |
| --- | --- | --- | --- |
| [Competitive Companion](https://github.com/jmerle/competitive-companion) | upstream major 2.x | MIT (© 2017 Jasper van Merle) | This project's fork (renamed CC for Web, changed to deliver to the web page and to local IDE tools at the same time). The upstream `LICENSE` is included in the zip |
| [jszip](https://github.com/Stuk/jszip) | 3.10.1 | **MIT OR GPL-3.0-or-later** (dual-licensed; this project uses the MIT branch) | Extension runtime |
| [pdfjs-dist](https://github.com/mozilla/pdf.js) | 4.2.67 | Apache-2.0 | Extension runtime (PDF statements) |
| [nanobar](https://github.com/jacoborus/nanobar) | 0.4.2 | MIT | Extension runtime |
| [snarkdown](https://github.com/developit/snarkdown) | 2.0.0 | MIT | Extension runtime |
| [p-limit](https://github.com/sindresorhus/p-limit) | 7.3.0 | MIT | Extension runtime |
| [cyrillic-to-translit-js](https://github.com/gerigo/cyrillic-to-translit-js) | 3.2.1 | MIT | Extension runtime |

All of these are bundled into `js/content.js` (about 2MB) and distributed with the extension package.

## 5. Build-time tools (not shipped, credited all the same)

| Component | Version | Licence | Purpose |
| --- | --- | --- | --- |
| [Vite](https://github.com/vitejs/vite) | 8.3.0 | MIT | Build and dev server |
| [Rolldown](https://github.com/rolldown/rolldown) | 1.2.8 | MIT | Vite 8's bundling core |
| [Lightning CSS](https://github.com/parcel-bundler/lightningcss) | 1.33.0 | MPL-2.0 | CSS processing |
| [@vitejs/plugin-vue](https://github.com/vitejs/vite-plugin-vue) | 6.0.9 | MIT | SFC compilation |
| [PostCSS](https://github.com/postcss/postcss) + [postcss-pxtorem](https://github.com/cuth/postcss-pxtorem) | 8.5.28 / 6.1.0 | MIT | Global UI scaling (px→rem conversion) |
| [puppeteer-core](https://github.com/puppeteer/puppeteer) | 25.11.0 | Apache-2.0 | The headless regression script (`npm run verify`) |
| [Binaryen](https://github.com/WebAssembly/binaryen) | 132.0.0 | Apache-2.0 | `npm run wasm:opt` (currently not needed) |

## 6. External judging services (this repository contains **none** of their code)

Both are external services this site talks to **over HTTP**; you have to deploy the server side yourself. The site implements only the protocol client, and has copied or linked none of their code.

| Service | Licence | Notes |
| --- | --- | --- |
| [Piston](https://github.com/engineer-man/piston) | MIT | The default engine; recommended: `docker run -p 2000:2000 ghcr.io/piston-cli/piston:stable` |
| [Judge0](https://github.com/judge0/judge0) | **GPL-3.0** | Optional engine. GPL obligations follow its server side and have nothing to do with this front end; but **if Judge0's code is ever moved into this project**, the licence picture changes and must be re-evaluated at that point |

## 7. Where the full licence texts live

- **npm packages**: `node_modules/<package>/LICENSE*`; production vs. development is in `package-lock.json`.
- **Toolchain binaries**: the upstream repositories named in the table in section 2 (LLVM / wasi-libc / CPython / runno).
- **Self-hosted rendering runtime**: these are `dist` artifacts from npm packages copied over verbatim (KaTeX / marked), so their full licence texts are likewise under `node_modules/<package>/LICENSE*`.
- **Extension**: the `LICENSE` inside `public/extension/cc-for-web-<version>.zip`.

## Appendix: how to re-verify this list

```bash
# 1) direct dependencies
cat package.json

# 2) versions and licences of every dependency (production / development split)
node -e "const l=require('./package-lock.json');for(const [k,v] of Object.entries(l.packages))if(k)console.log((v.dev?'dev ':'prd ')+k.replace('node_modules/','')+' '+v.version+' '+(v.license||'?'))"

# 3) toolchain versions (strings measured from the artifacts, not guessed from directory names)
LC_ALL=C grep -a -o -E "clang version [0-9][0-9a-zA-Z. ()-]*" public/wasm/8.0.1/clang.wasm | sort -u
LC_ALL=C grep -a -o -E "3\.11\.[0-9]+" public/wasm/python-3.11.3/python.wasm | sort -u

# 4) which libraries the sysroot actually contains (to confirm where wasi-libc / libc++ / compiler-rt landed)
tar tzf public/wasm/8.0.1/clang-fs.tar.gz | grep "sys/lib/"

# 5) whether a dependency really made it into the build (NB: katex / marked take the on-demand route, so the library itself is not searchable in the main bundle)
grep -l DOMPurify dist/assets/*.js
grep -c "marked" dist/assets/main-*.js

# 6) versions and byte size of the notes rendering runtime
cat public/md/assets.json
```

> After changing this list, do two things: run `npm run notice` to regenerate `notice.html` / `notice.en.html` (skipping it leaves a stale page; `node scripts/render-notice.mjs --check` will catch it),
> and take another look at the "Acknowledgements and open-source licences" section of `guide.en.html` (and `guide.html` for the Chinese side) to see whether it still holds — that is the short version users read.
> **Do not forget to update `NOTICE.md` as well: the two language versions are kept in step by hand, with no automatic sync.**