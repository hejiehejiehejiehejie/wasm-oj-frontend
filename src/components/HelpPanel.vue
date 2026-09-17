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
        role: '首次最慢、之后只付运行开销；卡片上的耗时只算程序运行那一段，不含编译和排队。',
        points: [
          '耗时口径：卡片耗时和页头的时限同一口径，只计「程序运行」段，不含编译与排队；页头显示的是当轮最慢用例的耗时',
          '首次运行要先下载约 50MB 的本地工具链，只下一次；下载后常驻浏览器缓存，断网也能继续编译运行',
          '同一份代码连续跑多个用例只编译一次，第 2 个起只付运行开销——所以改完代码的第一枪会明显慢一些，属正常',
          '后台自动生成一份 STL 预编译头并存在本机，省掉每次编译反复解析标准库头的开销；生成安排在首次运行之后的空闲时间，不阻塞操作，失败也不影响正常编译',
          '工具链与预编译头都从本机缓存直接复用，于是每次编译只剩 WASI 启动、链接这类固定成本；这部分受本机性能影响，不承诺固定倍率',
          '以上只发生在本地沙箱；切到 Piston / Judge0 时速度取决于所连服务与网络',
        ],
      },
    ],
  },
]

function onKeydown(event) {
  if (event.key === 'Escape') close()
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      window.addEventListener('keydown', onKeydown)
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
                  <li v-for="point in item.points" :key="point">{{ point }}</li>
                </ul>
              </li>
            </ul>
          </section>
        </div>

        <footer class="panel-drawer__footer">
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

.panel-drawer__footer {
  flex: 0 0 auto;
  display: flex;
  justify-content: flex-end;
  padding: 12px 16px;
  border-top: 1px solid var(--border-soft);
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