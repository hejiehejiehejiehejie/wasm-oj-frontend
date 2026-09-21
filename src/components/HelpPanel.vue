<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  open: Boolean,
})

const emit = defineEmits(['update:open'])

// 帮助抽屉的全部内容。每条 = 问题名称 / 核心答案 / 操作要点。
// 文案与界面上的措辞保持一致（按钮 title、面板标签都按实际 UI 抄），
// 改动 UI 文案时这里要跟着改；同一份内容也写在仓库 docs/使用手册.md 里。
// 另外根目录的 guide.html 是它的「完整版」，改这里要检查那一页是否还说得通。
const GROUPS = [
  {
    title: '常见操作',
    items: [
      {
        name: '如何在本地运行 C++',
        role: '把编译与运行搬到本机浏览器里：代码不出本机，断网也能跑。',
        points: [
          '点顶栏的「本地运行环境」图标，在 C++ 那行点「下载」，等按钮变成「已就绪」（约 50MB，只下一次）',
          '点顶栏的「评测引擎设置」，引擎选「本地 WASM 沙箱」——它不需要填服务地址',
          '点顶栏 ▶「运行全部测试」，或按 ⌘/Ctrl + Enter',
          '只支持 C++；Python 3 那行写着「暂未接入本地运行时」',
        ],
      },
      {
        name: '如何展开 / 折叠样例栏',
        role: '样例栏（测试面板）可以收起，把空间让给编辑器；收起后一样能展开回来。',
        points: [
          '双击两栏中间的分隔条：收起 / 展开',
          '按住分隔条往边缘拖，拖到贴边即自动收起；收起后往外拖出展开',
          '用 Tab 聚焦分隔条后按 ← / → 微调宽度',
        ],
      },
      {
        name: '本地运行代码性能的说明',
        role: '首次最慢，之后只付运行开销；耗时只计「程序运行」那一段，不含编译与排队，页头取当轮最慢用例。',
        points: [
          '首次运行先下载约 50MB 工具链，只下一次；之后常驻本机，断网也能编译运行',
          '同一份代码跑多个用例只编译一次，第 2 个起只付运行开销；改完代码的第一枪会明显慢些，属正常。**这部分受本机性能影响，不承诺固定倍率**',
          '预编译头（PCH）开销：后台把最常用的 5 个 STL 头预先编译好，省掉每次编译重复解析它们的时间。生成排在首次运行之后的空闲时间，且等当前编译跑完才开工，会额外占用十几 MB 内存和一份约 9MB 的系统头文件副本',
          'PCH 生成预算 3 分钟；机器扛不住（内存不足 / cc1 卡死）会在本机记为不支持、此后不再尝试，用例照常走普通编译',
          'PCH 存在本机（约 10–20MB）；与当前编译选项对不上时自动退回普通编译、不会报错；换工具链版本后旧存档自动作废并重新生成',
          '以上只发生在本地沙箱；切到 Piston / Judge0 时速度取决于所连服务与网络',
        ],
      },
    ],
  },
]

// 正文里用 **…** 标记加粗。不走 v-html：文案里会出现 <vector> 这类头文件名，
// 交给 HTML 解析会被当成标签吃掉。
function segments(point) {
  return String(point)
    .split(/\*\*(.+?)\*\*/g)
    .map((text, index) => ({ text, bold: index % 2 === 1 }))
    .filter((part) => part.text !== '')
}

function onKeydown(event) {
  if (event.key === 'Escape') close()
}

// 设备诊断（临时）：iPad 独立窗口底部白条排查用。在真机上直接读出安全区、
// 视口高度与底色，不用连 Mac 的网页检查器。定位完会整块撤掉。
const diag = ref('')

function collectDiag() {
  try {
    const probe = document.createElement('div')
    probe.style.cssText =
      'position:fixed;left:-9999px;top:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'
    document.body.appendChild(probe)
    const s = getComputedStyle(probe)
    const insets = [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft]
    probe.remove()

    const app = document.querySelector('.app')
    const appStyle = app ? getComputedStyle(app) : null
    const vv = window.visualViewport
    diag.value = JSON.stringify(
      {
        mode: window.navigator.standalone
          ? 'standalone(navigator)'
          : matchMedia('(display-mode: standalone)').matches
            ? 'standalone(media)'
            : 'browser',
        ua: window.navigator.userAgent,
        uaData: window.navigator.userAgentData
          ? {
              brands: window.navigator.userAgentData.brands,
              mobile: window.navigator.userAgentData.mobile,
              platform: window.navigator.userAgentData.platform,
            }
          : null,
        viewport: document.querySelector('meta[name=viewport]')?.content ?? null,
        css: [...document.querySelectorAll('link[rel=stylesheet]')].map((l) =>
          (l.getAttribute('href') ?? '').split('/').pop(),
        ),
        colorScheme: getComputedStyle(document.documentElement).colorScheme,
        bg: {
          html: getComputedStyle(document.documentElement).backgroundColor,
          body: getComputedStyle(document.body).backgroundColor,
          app: appStyle?.backgroundColor ?? null,
        },
        insets: { top: insets[0], right: insets[1], bottom: insets[2], left: insets[3] },
        appPadding: appStyle
          ? [appStyle.paddingTop, appStyle.paddingRight, appStyle.paddingBottom, appStyle.paddingLeft]
          : null,
        inner: [window.innerWidth, window.innerHeight],
        visual: vv ? [Math.round(vv.width), Math.round(vv.height), Math.round(vv.offsetTop)] : null,
        screen: [window.screen.width, window.screen.height],
        dpr: window.devicePixelRatio,
      },
      null,
      1,
    )
  } catch (error) {
    diag.value = `诊断失败：${error?.message ?? error}`
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      window.addEventListener('keydown', onKeydown)
      collectDiag()
      return
    }
    window.removeEventListener('keydown', onKeydown)
  },
)

onMounted(() => {
  if (props.open) window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})

function toggle() {
  emit('update:open', !props.open)
}

function close() {
  emit('update:open', false)
}
</script>

<template>
  <button
    class="help-button"
    :class="{ 'is-active': open }"
    title="使用帮助"
    aria-label="使用帮助"
    :aria-expanded="open"
    @click="toggle"
  >
    <AppIcon name="help" />
  </button>

  <!-- 与其它抽屉同款：只有抽屉需要 Teleport，按钮必须留在顶栏内，否则会脱离 flex 布局被挤出视口 -->
  <Teleport to="body">
    <Transition name="help-fade">
      <div v-if="open" class="panel-backdrop" @click.self="close"></div>
    </Transition>

    <Transition name="help-slide">
      <aside v-if="open" class="panel-drawer" role="dialog" aria-modal="true" aria-label="使用帮助">
        <header class="panel-drawer__header">
          <h2>使用帮助</h2>
          <button class="icon-button" title="关闭" aria-label="关闭使用帮助" @click="close">
            <AppIcon name="close" :size="16" />
          </button>
        </header>

        <div class="panel-drawer__body">
          <section v-for="group in GROUPS" :key="group.title" class="help-group">
            <h3 class="help-group__title">{{ group.title }}</h3>

            <ul class="help-list">
              <li v-for="item in group.items" :key="item.name" class="help-item">
                <p class="help-item__name">{{ item.name }}</p>
                <p class="help-item__role">{{ item.role }}</p>
                <ul class="help-item__points">
                  <li v-for="point in item.points" :key="point">
                    <span
                      v-for="(part, index) in segments(point)"
                      :key="index"
                      :class="{ 'is-bold': part.bold }"
                    >{{ part.text }}</span>
                  </li>
                </ul>
              </li>
            </ul>
          </section>

          <!-- 临时诊断块：白条问题定位完会移除 -->
          <section class="help-group help-diag-group">
            <h3 class="help-group__title">设备诊断（排查白条用，截图发我即可）</h3>
            <pre class="help-diag">{{ diag }}</pre>
          </section>
        </div>

        <footer class="panel-drawer__footer">
          <a class="guide-link" href="/guide.html">完整使用指南</a>
          <button class="done-button" @click="close">完成</button>
        </footer>
      </aside>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 与顶栏其它图标按钮同尺寸（28px 高、9px 内边距），放在换边图标右边 */
.help-button {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 9px;
  border-radius: 5px;
  border: 1px solid transparent;
  color: var(--text);
  font-size: 12.5px;
  transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.help-button:hover,
.help-button.is-active {
  background: var(--bg-hover);
  border-color: var(--border);
}

.panel-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(0, 0, 0, 0.48);
}

.panel-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 61;
  display: flex;
  flex-direction: column;
  width: min(360px, 92vw);
  background: var(--bg-raised);
  border-left: 1px solid var(--border);
  box-shadow: -18px 0 46px -22px rgba(0, 0, 0, 0.8);
}

.panel-drawer__header {
  flex: 0 0 50px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px 0 18px;
  border-bottom: 1px solid var(--border-soft);
}

.panel-drawer__header h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.icon-button {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 5px;
  color: var(--text-dim);
  transition: background-color 0.15s ease, color 0.15s ease;
}

.icon-button:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.panel-drawer__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 18px;
}

.help-group + .help-group {
  margin-top: 16px;
}

.help-group__title {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--text-dim);
}

.help-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* 每条功能一张卡：名称 / 作用 / 操作要点，三层信息靠字号与颜色拉开层次 */
.help-item {
  padding: 9px 11px;
  border: 1px solid var(--border-soft);
  border-radius: 7px;
  background: var(--bg-panel);
}

.help-item__name {
  margin: 0 0 3px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
}

.help-item__role {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--text-dim);
}

.help-item__points {
  margin: 6px 0 0;
  padding-left: 15px;
  list-style: disc;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-faint);
}

.help-item__points li + li {
  margin-top: 2px;
}

.help-item__points .is-bold {
  font-weight: 700;
  color: var(--text-dim);
}

/* 临时诊断块：等宽小字直接铺 JSON，方便截图 */
.help-diag-group {
  user-select: all;
}

.help-diag {
  margin: 0;
  padding: 10px;
  border: 1px solid var(--border-soft);
  border-radius: 7px;
  background: var(--bg-input);
  color: var(--text-dim);
  font-family: var(--mono-font);
  font-size: 10px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}

.panel-drawer__footer {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-top: 1px solid var(--border-soft);
}

/* 指向根目录 guide.html：抽屉里只放精简版，完整版是那一页 */
.guide-link {
  font-size: 12.5px;
  color: var(--accent);
  text-decoration: none;
}

.guide-link:hover {
  color: var(--accent-hover);
  text-decoration: underline;
}

.done-button {
  height: 30px;
  padding: 0 16px;
  border-radius: 5px;
  font-size: 12.5px;
  font-weight: 550;
  color: var(--text-on-accent);
  background: var(--run-green);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.done-button:hover {
  background: var(--run-green-hover);
}

.help-fade-enter-active,
.help-fade-leave-active {
  transition: opacity 0.2s ease;
}

.help-fade-enter-from,
.help-fade-leave-to {
  opacity: 0;
}

.help-slide-enter-active,
.help-slide-leave-active {
  transition: transform 0.24s cubic-bezier(0.22, 0.61, 0.36, 1);
}

.help-slide-enter-from,
.help-slide-leave-to {
  transform: translateX(100%);
}
</style>