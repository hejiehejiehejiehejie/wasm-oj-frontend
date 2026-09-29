# Third-party open-source notices (NOTICE)

This site (unnamed, repository `wasm-oj-frontend`) wrote only the interface, the interaction and the judging logic itself; what actually makes it run is a batch of open-source projects.
This file is the **single list of third-party components**, for two purposes: **giving credit**, and **keeping the copyright and licence notices each project requires** when the site is distributed.

The short, user-facing version is the "Acknowledgements and open-source licences" section of `guide.en.html` — **the complete version (this file) is generated into `notice.en.html` on the site** (`npm run notice`), and that page is linked from the guide; **this file is the one that counts**.

> The Chinese version of this list is `NOTICE.md` → `notice.html`. **The two are kept in step by hand**: whenever you change one, change the other. Sections and table rows correspond one to one.

## Maintenance rules

- Three things force a return to this file: changing `package.json` (adding/removing a dependency, or a major-version bump), replacing a toolchain directory under `public/wasm/`, or replacing the extension package in `public/extension/`.
- **Always verify version numbers on the real artifact — never write them from memory** (the commands are at the end of this file).
- The site is publicly deployed and its output carries other people's code, so this list is not a "local memo" but part of the distribution obligation.
- This file lists **other people's** projects only. This repository currently has no `LICENSE` file (i.e. "all rights reserved" by default); that does not affect the obligations of the third-party licences above, but it is a separate decision if the site's own code is ever open-sourced.

> Last verified: **2026-09-30** (this round only replaced the extension package under `public/extension/` → `cc-for-web-2.65.2.zip`; the version numbers and licences of the third-party components inside it are **unchanged**;
> the dependency figures are still the **2026-09-29** verification: `package-lock.json` at `lockfileVersion: 3`, 92 dependencies in total: 28 production, 64 development).

---

## 1. Site runtime dependencies (shipped with the build)

| Component | Version | Licence | Purpose |
| --- | --- | --- | --- |
| [Vue](https://github.com/vuejs/core) | 3.5.42 | MIT | The framework behind the whole interface |
| [Monaco Editor](https://github.com/microsoft/monaco-editor) | 0.56.0 | MIT | The code editor (VS Code's editor core) |
| ├─ [marked](https://github.com/markedjs/marked) | 14.0.0 | MIT | Transitive dependency of Monaco (Markdown rendering) |
| └─ [DOMPurify](https://github.com/cure53/DOMPurify) | 3.4.8 | **MPL-2.0 OR Apache-2.0** (dual-licensed) | Transitive dependency of Monaco (HTML sanitising). **The only non-permissive runtime dependency on this site** |
| [@runno/wasi](https://github.com/taybenlor/runno) | 0.10.0 | MIT | The local sandbox's WASI runtime: instantiate, feed stdin, `kill()` (TLE relies on it) |

These were verified to actually ship in the build (searching `dist/assets/main-*.js` turns up `DOMPurify` and `marked`), rather than merely sitting in the dependency tree.

The rest of the 28 "production dependencies" in `package-lock.json` (`@vue/compiler-*`, `@babel/*`, `entities`, `postcss`, `magic-string`, `source-map-js`, `estree-walker`, `csstype`, `nanoid`, `picocolors` and so on) are Vue's compiler chain: used at **build time** only, and not shipped in the output.

## 2. Local sandbox toolchain (`public/wasm/`, self-hosted binaries, about 76MB)

These are **upstream prebuilt artifacts taken into this repository as-is** (this site changed nothing), so the upstream notices are distributed along with the files; the full licence texts live in the corresponding upstream repositories.

| Component | Version | Licence | Where it lands and what it is for |
| --- | --- | --- | --- |
| [LLVM / clang](https://github.com/llvm/llvm-project) | 8.0.1 | Apache-2.0 WITH LLVM-exception | `public/wasm/8.0.1/clang.wasm` (31.2MB) —— compiling C++ locally. The prebuilt artifact comes from [binji/wasm-clang](https://github.com/binji/wasm-clang), distributed via runno's `langs/` |
| [LLVM lld](https://github.com/llvm/llvm-project) (wasm-ld) | same generation as above | Apache-2.0 WITH LLVM-exception | `public/wasm/8.0.1/wasm-ld.wasm` (19.5MB) —— linking |
| [wasi-libc](https://github.com/WebAssembly/wasi-libc) | with the wasi-sysroot above | Apache-2.0 WITH LLVM-exception | `libc.a`, `libm.a`, `libpthread.a`, `libdl.a`, `librt.a`, `libutil.a`, `libxnet.a`, `libcrypt.a`, `libresolv.a`, `libwasi-emulated-mman.a`, `crt1.o` inside `clang-fs.tar.gz` —— the C standard library and startup code |
| [libc++ / libc++abi](https://github.com/llvm/llvm-project) | same as above | MIT (University of Illinois / NCSA family) | `libc++.a`, `libc++abi.a` in the same tar —— the C++ standard library (the likes of `<vector>` / `<string>`) |
| [compiler-rt](https://github.com/llvm/llvm-project) | same as above | Apache-2.0 WITH LLVM-exception | `libclang_rt.builtins-wasm32.a` in the same tar —— compiler runtime builtins |
| [CPython](https://github.com/python/cpython) | 3.11.3 | PSF License | `public/wasm/python-3.11.3/python.wasm` + `python-fs.tar.gz` —— running Python locally. A wasm32-wasi build with the standard library in `usr/local/lib/python311.zip`; the build likewise comes from runno's `langs/` |

## 3. UI assets

| Asset | Licence | Source |
| --- | --- | --- |
| seti-ui's `icons/cpp.svg` | MIT | [jesseweed/seti-ui](https://github.com/jesseweed/seti-ui) (VS Code's default file icon theme, glyph `\E01A`). Used in `SOLID_PATHS.cpp` of `src/components/AppIcon.vue`; the source is recorded in a comment in that file |

- The other icons (`play` / `gear` / `files` / `cases` / `file-plus` / `folder-plus` / `python` and so on) are inline SVGs drawn for this site in the 24×24 stroked style of lucide; **no icon dependency was introduced**.
- **All fonts go through the system font stack** (`-apple-system` / PingFang SC / SF Mono / JetBrains Mono fallbacks); there is no self-hosted or CDN webfont.
- The PWA icons (`public/icons/*.png`), `favicon.svg` and `og-cover.png` are all made for this site.
- ⚠️ **To be confirmed**: the Python two-snake mark in `SOLID_PATHS.python` has **no recorded source** in the code (its shape matches the Python mark in simple-icons). Once it is confirmed who added it and where it came from, add a row to this table.

## 4. Browser extension CC for Web

The package is distributed from this site (`public/extension/cc-for-web-<version>.zip`, currently **2.65.2**; re-versioned on 2026-09-30, the behaviour change being "deliver to the web page and to local IDE tools at the same time", with the third-party components inside unchanged from the table below), and its source lives in another repository (`cph-companion`).

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

# 5) whether a dependency really made it into the build
grep -l DOMPurify dist/assets/*.js
```

> After changing this list, do two things: run `npm run notice` to regenerate `notice.html` / `notice.en.html` (skipping it leaves a stale page; `node scripts/render-notice.mjs --check` will catch it),
> and take another look at the "Acknowledgements and open-source licences" section of `guide.en.html` (and `guide.html` for the Chinese side) to see whether it still holds — that is the short version users read.
> **Do not forget to update `NOTICE.md` as well: the two language versions are kept in step by hand, with no automatic sync.**