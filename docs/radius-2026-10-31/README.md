# 圆角迁移留档（2026-10-31）

把 HANDOFF §1.A 登记的那些「不在 10 / 6 / 4 三档」的圆角，**一律往小的一档改**；
差 1px 以内的（2px 发丝、3px）按「太接近、改了看不出差别」不动。

- 拍摄条件：1400×900 视口、`deviceScaleFactor: 2`（图里 1 CSS px = 2 像素）、`cp.uiScale = 1`、深色主题。
- 按钮类是**悬停态**拍的 —— 底色出来才看得见圆角；容器类（卡片 / 列表 / 输入框）是静止态。
- 每张图按它裁的位置扩了 12px 边距，能看到相邻元素，便于判断「有没有贴着邻居显脏」。

## 改了并且拍了图的（19 处）

| 编号 | 截图 | 选择器 | 位置 | 旧 → 新 |
|---|---|---|---|---|
| 01 | `01-explorer-btn.png` | `.explorer__btn` | `FileExplorer.vue:1764` | 5 → **4** |
| 02 | `02-md-tool.png` | `.md-tool` | `EditorPane.vue:1355` | 5 → **4** |
| 03 | `03-view-switch-item.png` | `.view-switch__item` | `EditorPane.vue:1389` | 5 → **4**（外层 6 − 内距 2 = 4，同心） |
| 04 | `04-components-menu-item.png` | `.components-menu__item` | `ComponentsMenu.vue:222` | `calc(8px·s)` → **`calc(6px·s)`** |
| 05 | `05-components-menu-tile.png` | `.components-menu__tile` | `ComponentsMenu.vue:242` | `calc(12px·s)` → **`calc(10px·s)`** |
| 06 | `06-components-menu-tag.png` | `.components-menu__tag` | `ComponentsMenu.vue:255` | 999 → **`calc(4px·s)`**（胶囊改圆角矩形） |
| 07 | `07-theme-card.png` | `.theme-card` | `EditorSettingsPanel.vue:3550` | 8 → **6** |
| 08 | `08-theme-card-preview.png` | `.theme-card__preview` | `EditorSettingsPanel.vue:3572` | 5 → **4** |
| 09 | `09-engine-list.png` | `.engine-list` | `EngineSettingsPanel.vue:143` | 8 → **6** |
| 10 | `10-hotkey.png` | `.hotkey` | `HotkeyRecorder.vue:162` | 5 → **4** |
| 11 | `11-runtime-row-icon.png` | `.runtime-row__icon` | `EditorSettingsPanel.vue:3764` | 8 → **6** |
| 12 | `12-runtime-row-tag.png` | `.runtime-row__tag` | `EditorSettingsPanel.vue:3778` | 999 → **4** |
| 13 | `13-setting-row-tag.png` | `.setting-row__tag` | `EditorSettingsPanel.vue:3452` | 999 → **4** |
| 14 | `14-cloud-account.png` | `.cloud-account` | `EditorSettingsPanel.vue:4046` | 8 → **6** |
| 15 | `15-danger-zone.png` | `.danger-zone` | `EditorSettingsPanel.vue:4320` | 8 → **6** |
| 16 | `16-help-item.png` | `.help-item` | `HelpPanel.vue:154` | 8 → **6** |
| 17 | `17-cd-icon.png` | `.cd-icon` | `CountdownCard.vue:734` | 7 → **6** |
| 18 | `18-cf-handle-btn.png` | `.cf-handle__btn` | `CfCodeforcesPanel.vue:493` | 8 → **6** |
| 19 | `19-tab-group-card-name.png` | `.tab-group-card__name` | `TabGroupCard.vue:153` | `calc(8px·s)` → **`calc(4px·s)`**（原来是「外 6 内 8」，内外反了） |

`s` = `var(--menu-scale)`。

## 改了但没截到图的（6 处，值同上表一律改小）

| 选择器 | 位置 | 旧 → 新 | 为什么没图 |
|---|---|---|---|
| `.cloud-flow` | `EditorSettingsPanel.vue:4126` | 8 → **6** | 只在「取到验证码」那一相出现，要联网走一遍 Codeforces 登录 |
| `.shortcut-key.is-fixed` | `EditorSettingsPanel.vue:3991` | 5 → **4** | 三条 `fixed` 都 `hideInSettings`，现在没有任何渲染对象 |
| `.md-preview__action` | `MarkdownPreview.vue:272` | 5 → **4** | 只在 Markdown 渲染器「没就绪 / 下载失败」的门里出现 |
| `.gate__action` | `ToolchainGate.vue:158` | 5 → **4** | 只在 Android 壳里渲染（`IS_ANDROID`），网页版永远不出现 |
| `.cf-live-badge` | `styles/cf-console.css:251` | 5 → **4** | 要有「正在进行的比赛」才画 |
| `.cf-list__row` | `styles/cf-console.css:400` | 8 → **6** | 列表要 Codeforces 数据，本机接口没返回 |

## 没动的 6 处（太接近 / 发丝装饰，改了看不出差别）

| 选择器 | 现值 | 理由 |
|---|---|---|
| `.cf-schedule__row--running::after` | 2px | 宽 2px 的竖发丝，圆角已等于短边一半，改 4 会被浏览器按比例夹回去 |
| `.theme-card__accent` | 2px | 高 4px 的强调色条，同上 |
| `.theme-card__line` | 2px | 高 3px 的文字条，同上 |
| `.editor-tabs__close` | 3px | 15px 的关闭框，3 → 4 只差 1px，且比改动前往大走 |
| `.settings-menu__step` | `calc(3px·s)` | 18px 步进器，同上 |
| `.settings-menu__seg` | `calc(3px·s)` | 行尾两档切换钮，同上 |

`npm run lint:css` 现在只剩上表这 6 条提示（都是有意留的），没有阻断错误。

## 后悔了怎么回

```
git checkout -- src/components/<文件>     # 单文件回退
```

或者按上表把新值改回旧的；`HANDOFF.md` §1.A 里的存量清单没动，改回来不会影响别处。
