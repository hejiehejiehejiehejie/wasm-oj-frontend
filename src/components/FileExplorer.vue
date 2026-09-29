<script setup>
/**
 * FileExplorer —— 资源管理器面板：头部操作（新建文件 / 文件夹）+ 树容器 + 右键菜单（打开题目链接 / 题目信息 / 新建 / 重命名 / 删除）。
 *
 * 「资源管理器」这个标题由统一侧边栏的页签承担（见 Sidebar.vue），这里头部只留操作按钮。
 * 新建的目标目录可以是任意已存在目录：页头按钮跟随树内聚焦的目录（没聚焦时回落根目录），
 * 右键目录则显式指定该目录。名字仍是单级（assertName 拒绝 /），嵌套路径留待后续。
 *
 * 通过 provide 向递归树项提供能力：右键菜单、删除确认、根 DOM、重命名目标、焦点管理，
 * 以及内联新建的状态与提交入口。输入行由 InlineCreateRow 渲染：根目录这份在本组件，
 * 建在某个目录里的那份在 FileTreeItem 的 role="group" 里。
 */
import { computed, nextTick, provide, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import ContextMenu from './ContextMenu.vue'
import FileTreeItem from './FileTreeItem.vue'
import InlineCreateRow from './InlineCreateRow.vue'
import SidebarSwitcher from './SidebarSwitcher.vue'
import { t } from '../i18n/index.js'
import {
  activeLanguage,
  createDirectory,
  createFile,
  deleteNode,
  getNodeById,
  toggleExpand,
  updateFileMeta,
  workspace,
} from '../services/vfs/workspaceStore.js'
import { assertName, basename, join } from '../services/vfs/paths.js'
import {
  OJ_LIST,
  difficultyOptionsFor,
  difficultySystemFor,
  emptyMeta,
  normalizeMeta,
  todayISO,
} from '../services/problemMeta.js'

const rootEl = ref(null)

/** 内联新建状态：{ type:'file'|'directory', targetId, targetPath, value, error } | null
 *  targetId 为 'root' 或目标目录的节点 id；targetPath 是它的绝对路径（根为 '/'）。 */
const creating = ref(null)
/** 内联新建输入行的句柄（InlineCreateRow 挂载时注册）；同一时刻只有一行 */
const creatingRow = ref(null)
/** 右键菜单状态：{ x, y, node, items } | null */
const menu = ref(null)
/** 需要进入重命名的节点 id */
const renameTarget = ref(null)
/** 树内最近获得焦点的 id（roving tabindex） */
const focusedId = ref(null)
/** 待确认删除的节点；null = 没有待确认的删除 */
const pendingDelete = ref(null)
/** 确认弹窗里的「删除」按钮：弹窗打开时把焦点送进去 */
const confirmBtn = ref(null)

/** 正在编辑题目信息的节点；null = 弹窗关闭 */
const metaTarget = ref(null)
/** 题目信息表单的绑定值 */
const metaForm = ref(emptyMeta())
/** 保存失败的提示 */
const metaError = ref('')
/** 弹窗里的「OJ」下拉：出现后把焦点送进去 */
const metaFirstField = ref(null)

// ------------------------------------------------------------ 内联新建

/**
 * 新建时的默认名字：文件跟着当前判题语言给 new.cpp / new.py，目录给「新建文件夹」；
 * 与目标目录下已有名字撞了就往后排 new-2、new-3……——预填的名字不该让用户敲下回车先吃一个「已存在」。
 * @param {'file'|'directory'} type
 * @param {string} targetId 'root' 或目标目录的节点 id
 * @returns {string}
 */
function defaultName(type, targetId) {
  const siblings =
    targetId === 'root' ? workspace.tree : (getNodeById(targetId)?.children ?? [])
  const taken = new Set(siblings.map((node) => basename(node.path)))
  const labelOf = (item) => (item.labelKey ? t(item.labelKey) : (item.label ?? ''))
  if (type !== 'file') return uniqueName(taken, t('explorer.defaultFolderName'))
  return uniqueName(taken, 'new', activeLanguage.value === 'python' ? '.py' : '.cpp')
}

/**
 * @param {Set<string>} taken
 * @param {string} base
 * @param {string} [ext] 目录留空
 * @returns {string}
 */
function uniqueName(taken, base, ext = '') {
  if (!taken.has(base + ext)) return base + ext
  let index = 2
  while (taken.has(`${base}-${index}${ext}`)) index += 1
  return `${base}-${index}${ext}`
}

/**
 * 页头按钮的目标目录：跟随树内聚焦的节点（目录就是它自己，文件取其父目录），
 * 没有聚焦 / 索引未就绪时回落根目录。
 * @returns {object|null}
 */
function headerCreateTarget() {
  const node = focusedId.value ? getNodeById(focusedId.value) : null
  if (!node) return null
  if (node.type === 'directory') return node
  return getNodeById(node.parentId) ?? null
}

/**
 * @param {'file'|'directory'} type
 * @param {object|null} target 目标目录节点；null = 根目录
 */
function startCreate(type, target = null) {
  menu.value = null
  const targetId = target ? target.id : 'root'
  // 输入行渲染在目标目录的 role="group" 里，而那个 div 挂着 v-if="expanded"——
  // 目标目录折叠时行根本不存在，得先展开（沿用 expandedIds，会一起被持久化）。
  if (target && !workspace.expandedIds.includes(targetId)) toggleExpand(targetId)
  creating.value = {
    type,
    targetId,
    targetPath: target ? target.path : '/',
    value: defaultName(type, targetId),
    error: '',
  }
  // autofocus 属性对动态插入的节点不生效（浏览器只在解析 HTML 时认它），得自己把焦点送进去。
  // 与 FileTreeItem 的重命名同款：聚焦 + 只选中主干（后缀留在选中区外），
  // 默认名字可以直接敲回车接受，也可以直接打字替换主干。选中范围在 InlineCreateRow.focus() 里定。
  nextTick(focusCreateInput)
}

function focusCreateInput() {
  creatingRow.value?.focus()
}

/**
 * 在途的创建轮次（= 已经交给 VFS、还没回来的那些 state 对象）。
 * 用来区分「用户离开输入框」和「我们自己把焦点弄丢了」，见 onCreateBlur。
 * @type {Set<object>}
 */
const createFlights = new Set()

function cancelCreate() {
  creating.value = null
}

/**
 * 输入框失焦。正常情况（用户点到别处）就提交；但有一类**程序性**失焦必须挡掉：
 * 创建完成后会自动打开新文件，Monaco 顺势 focus() 把焦点抢走（EditorPane 里换 model 后
 * 的那行 instance.focus()）。那不是用户要离开输入框 —— 照常提交的话，会凭空多出一个
 * 用默认名建出来的文件（连点两次「新建文件」时最明显：第二轮输入框刚聚焦就被提交掉）。
 * 触屏上抢不走：那行 focus() 被 isTouchPointer() 挡了（见 HANDOFF 第 3 节触摸屏那节），
 * 所以这条只对鼠标设备生效；触屏下要提交得按回车或真的点到别处去。
 *
 * 分两种：
 * - 屏幕上这个输入框自己就在提交中：这次失焦正来自「打开刚建好的文件」，跳过重复提交，
 *   也不去抢焦点 —— 它马上就会被移除，焦点留给 Monaco 正合适。
 * - 在途的是上一轮（连点两次「新建文件」）：这个刚聚焦的输入框是被误伤的，把焦点要回来
 *   （Monaco 的 focus 在 pre-flush watcher 里，nextTick 抢得赢），并放弃这次提交。
 */
function onCreateBlur() {
  if (!createFlights.size) {
    commitCreate()
    return
  }
  if (!createFlights.has(creating.value)) nextTick(focusCreateInput)
}

async function commitCreate() {
  const state = creating.value
  if (!state) return
  const name = state.value.trim()
  if (!name) {
    cancelCreate()
    return
  }
  createFlights.add(state)
  try {
    assertName(name)
    const path = join(state.targetPath, name)
    if (state.type === 'file') await createFile(path)
    else await createDirectory(path)
    // 只关掉自己这一轮：创建是异步的，等它回来的这段时间里用户可能又点了一次「新建文件」
    // （blur 会先提交上一轮），无条件清空会把刚打开的新输入框一起抹掉。
    if (creating.value === state) creating.value = null
  } catch (error) {
    state.error = error.message || t('explorer.createFailed')
  } finally {
    createFlights.delete(state)
  }
}

// ------------------------------------------------------------ 右键菜单

function openContextMenu(event, node) {
  if (!node) return // 索引尚未就绪等情况：静默，不弹菜单
  focusedId.value = node.id
  menu.value = { x: event.clientX, y: event.clientY, node, items: buildMenuItems(node) }
}

/**
 * 取出可安全打开的题目链接，拿不到就返回空串。
 *
 * `meta.url` 是不可信输入（一半来自扩展解析结果、一半来自用户手输），`javascript:` 这类
 * 伪协议会被 window.open 当代码执行，所以只放行 http / https，且返回归一化后的 href。
 * 菜单项与开链接共用这一个判据：拿不到链接就不给这一项，免得出现点了没反应的菜单。
 */
function problemUrl(node) {
  const raw = node?.meta?.url
  if (!raw) return ''
  try {
    const target = new URL(raw)
    return target.protocol === 'http:' || target.protocol === 'https:' ? target.href : ''
  } catch {
    return ''
  }
}

/**
 * 题目信息只对文件有意义；新建只对目录有意义——目标就是被右键的那个目录。
 * （页头按钮那条路只能跟随聚焦节点，表达不了「建在哪个目录」。）
 */
function buildMenuItems(node) {
  const items = []
  if (node?.type === 'file') {
    if (problemUrl(node)) items.push({ id: 'open-url', label: t('explorer.menu.openUrl') })
    items.push({ id: 'meta', label: t('explorer.menu.meta') })
  } else if (node?.type === 'directory') {
    items.push({ id: 'new-file', label: t('explorer.menu.newFile') })
    items.push({ id: 'new-folder', label: t('explorer.menu.newFolder') })
  }
  items.push({ id: 'rename', label: t('explorer.menu.rename') })
  items.push({ id: 'delete', label: t('explorer.menu.delete') })
  return items
}

async function onMenuSelect(id) {
  const node = menu.value?.node
  menu.value = null
  if (!node) return
  if (id === 'meta') beginEditMeta(node)
  else if (id === 'open-url') {
    const url = problemUrl(node)
    if (url) window.open(url, '_blank', 'noopener')
  } else if (id === 'new-file') startCreate('file', node)
  else if (id === 'new-folder') startCreate('directory', node)
  else if (id === 'rename') beginRename(node.id)
  else if (id === 'delete') requestDelete(node)
}

function beginRename(id) {
  renameTarget.value = null
  // 先清空再置位：同一节点连续触发也能被 watch 感知
  nextTick(() => {
    renameTarget.value = id
  })
}

function onRenameDone() {
  renameTarget.value = null
}

/**
 * 删除入口：先把待删节点记下来、弹确认框，**点「删除」之后**才动 VFS。
 *
 * 这里不用 window.confirm：原生弹窗的返回值在 webview / 装成应用窗口打开时不由我们
 * 掌控（被浏览器抑制时它自己直接返回一个值），出现过「弹窗上点了取消，文件还是没了」。
 * 自己画的弹窗没有这层不确定性，取消就是取消。
 */
function requestDelete(node) {
  if (node) pendingDelete.value = node
}

function cancelDelete() {
  pendingDelete.value = null
}

async function confirmDelete() {
  const node = pendingDelete.value
  // 先关弹窗再动 VFS：删除过程中（可能要等 VFS 的异步事件）不该再留一个可点的按钮
  pendingDelete.value = null
  if (node) await deleteNode(node.path)
}

// 弹窗一出现就把焦点放到「删除」上：Enter 确认、Esc 取消都能纯键盘走完
watch(pendingDelete, (node) => {
  if (node) nextTick(() => confirmBtn.value?.focus())
})

// ------------------------------------------------------------ 题目信息弹窗

/** 当前 OJ 对应的难度口径：rating / luogu / free / null（未选 OJ） */
const metaSystem = computed(() => difficultySystemFor(metaForm.value.oj))
/** 难度下拉选项；自由文本 / 未选 OJ 时为 null（模板据此换成文本框） */
const metaDifficultyOptions = computed(() => difficultyOptionsFor(metaForm.value.oj))

/** 打开弹窗：有元数据就回填，日期留空则预填今天。timeLimit 以秒回填（ms → s 字符串） */
function beginEditMeta(node) {
  const saved = node.meta ?? {}
  metaForm.value = {
    url: saved.url ?? '',
    oj: saved.oj ?? '',
    difficulty: saved.difficulty ?? '',
    date: saved.date || todayISO(),
    timeLimit: saved.timeLimit ? String(saved.timeLimit / 1000) : '',
  }
  metaError.value = ''
  metaTarget.value = node
}

function cancelMeta() {
  metaTarget.value = null
  metaError.value = ''
}

/** 换 OJ 就必须清掉难度：两套口径的 id 互不相通，留着会存进一个对不上的值 */
function onOjChange() {
  metaForm.value.difficulty = ''
}

async function confirmMeta() {
  const node = metaTarget.value
  if (!node) return
  try {
    // normalizeMeta 全空时给 null，setMeta 会把节点上的 meta 整个摘掉
    // timeLimit：表单里是秒字符串，这里换算回 ms；留空 = 0（= 清除）
    const form = {
      ...metaForm.value,
      timeLimit: metaForm.value.timeLimit ? Math.round(Number(metaForm.value.timeLimit) * 1000) : 0,
    }
    await updateFileMeta(node.path, normalizeMeta(form))
    metaTarget.value = null
  } catch (error) {
    metaError.value = error.message || t('explorer.saveFailed')
  }
}

// 弹窗一出现就把焦点放到第一个字段上
watch(metaTarget, (node) => {
  if (node) nextTick(() => metaFirstField.value?.focus())
})

// 在树空白处右键：只屏蔽浏览器原生菜单（没有针对「整个工作区」的操作）
function onTreeContextMenu(event) {
  event.preventDefault()
}

// ------------------------------------------------------------ 焦点（roving tabindex）

function isTabbable(id) {
  if (focusedId.value) return focusedId.value === id
  if (workspace.activeId) return workspace.activeId === id
  return workspace.tree[0]?.id === id
}

function setFocusedId(id) {
  focusedId.value = id
}

function onTreeFocus(event) {
  const row = event.target.closest('[data-tree-id]')
  if (row) setFocusedId(row.dataset.treeId)
}

provide('openContextMenu', openContextMenu)
provide('requestDelete', requestDelete)
provide('treeRootEl', rootEl)
provide('renameTarget', renameTarget)
provide('isTabbable', isTabbable)
provide('setFocusedId', setFocusedId)
provide('creating', creating)
provide('creatingRow', creatingRow)
provide('commitCreate', commitCreate)
provide('cancelCreate', cancelCreate)
provide('onCreateBlur', onCreateBlur)
</script>

<template>
  <section class="explorer">
    <header class="explorer__head">
      <SidebarSwitcher />
      <span class="explorer__actions">
        <button
          type="button"
          class="explorer__btn"
          :title="t('explorer.menu.newFile')"
          @click="startCreate('file', headerCreateTarget())"
        >
          <AppIcon name="file-plus" :size="14" />
        </button>
        <button
          type="button"
          class="explorer__btn"
          :title="t('explorer.menu.newFolder')"
          @click="startCreate('directory', headerCreateTarget())"
        >
          <AppIcon name="folder-plus" :size="14" />
        </button>
      </span>
    </header>

    <div ref="rootEl" class="explorer__tree" role="tree" @contextmenu="onTreeContextMenu" @focusin="onTreeFocus">
      <!-- 建在根目录的输入行；建在某个目录里的那份由 FileTreeItem 渲染（同一个组件） -->
      <InlineCreateRow v-if="creating && creating.targetId === 'root'" :state="creating" :depth="0" />

      <FileTreeItem
        v-for="node in workspace.tree"
        :key="node.id"
        :node="node"
        :depth="0"
        @rename-done="onRenameDone"
      />

      <p v-if="!workspace.tree.length && !creating" class="explorer__empty">
        {{ t('explorer.emptyTree') }}
      </p>
    </div>

    <ContextMenu
      v-if="menu"
      :x="menu.x"
      :y="menu.y"
      :items="menu.items"
      @select="onMenuSelect"
      @close="menu = null"
    />

    <!-- 删除确认：自己实现的弹窗（不用 window.confirm，见 requestDelete 的注释）。
         点遮罩 / Esc = 取消，只有点「删除」才会真的动文件。 -->
    <Teleport to="body">
      <div v-if="pendingDelete" class="confirm" @pointerdown.self="cancelDelete">
        <div
          class="confirm__card"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          aria-describedby="confirm-desc"
          @keydown.esc.stop.prevent="cancelDelete"
        >
          <p id="confirm-title" class="confirm__title">{{ t('explorer.deleteConfirm.title') }}</p>
          <p id="confirm-desc" class="confirm__desc">
            <span class="confirm__path">{{ pendingDelete.path }}</span>
            <template v-if="pendingDelete.type === 'directory'">
              {{ t('explorer.deleteConfirm.directoryNote') }}
            </template>
          </p>
          <div class="confirm__actions">
            <button type="button" class="confirm__btn" @click="cancelDelete">
              {{ t('app.cancel') }}
            </button>
            <button
              ref="confirmBtn"
              type="button"
              class="confirm__btn confirm__btn--danger"
              @click="confirmDelete"
            >
              {{ t('explorer.menu.delete') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 题目信息：与删除确认同款自绘弹窗。难度控件跟着 OJ 走（见 problemMeta.js）。 -->
    <Teleport to="body">
      <div v-if="metaTarget" class="meta" @pointerdown.self="cancelMeta">
        <div
          class="meta__card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="meta-title"
          @keydown.esc.stop.prevent="cancelMeta"
        >
          <p id="meta-title" class="meta__title">{{ t('explorer.meta.title') }}</p>
          <p class="meta__file">{{ metaTarget.path }}</p>

          <label class="meta__field">
            <span class="meta__label">{{ t('explorer.meta.url') }}</span>
            <input v-model="metaForm.url" class="meta__input" type="url" placeholder="https://…" />
          </label>

          <label class="meta__field">
            <span class="meta__label">OJ</span>
            <select ref="metaFirstField" v-model="metaForm.oj" class="meta__input" @change="onOjChange">
              <option value="">{{ t('explorer.meta.ojUnset') }}</option>
              <option v-for="item in OJ_LIST" :key="item.id" :value="item.id">
                {{ labelOf(item) }}
              </option>
            </select>
          </label>

          <label class="meta__field">
            <span class="meta__label">{{ t('explorer.meta.difficulty') }}</span>
            <select v-if="metaDifficultyOptions" v-model="metaForm.difficulty" class="meta__input">
              <option value="">{{ t('explorer.meta.difficultyUnset') }}</option>
              <option v-for="item in metaDifficultyOptions" :key="item.id" :value="item.id">
                {{ labelOf(item) }}
              </option>
            </select>
            <input
              v-else-if="metaSystem === 'free'"
              v-model="metaForm.difficulty"
              class="meta__input"
              type="text"
              :placeholder="t('explorer.meta.difficultyCustom')"
            />
            <input
              v-else
              class="meta__input"
              type="text"
              disabled
              :placeholder="t('explorer.meta.difficultyPickOj')"
            />
          </label>

          <label class="meta__field">
            <span class="meta__label">{{ t('explorer.meta.date') }}</span>
            <input v-model="metaForm.date" class="meta__input" type="date" />
          </label>

          <label class="meta__field">
            <span class="meta__label">{{ t('explorer.meta.timeLimit') }}</span>
            <input
              v-model="metaForm.timeLimit"
              class="meta__input"
              type="number"
              min="0.1"
              step="0.5"
              :placeholder="t('explorer.meta.timeLimitPlaceholder')"
              inputmode="decimal"
            />
          </label>

          <p v-if="metaError" class="meta__error">{{ metaError }}</p>

          <div class="meta__actions">
            <button type="button" class="meta__btn" @click="cancelMeta">
              {{ t('app.cancel') }}
            </button>
            <button type="button" class="meta__btn meta__btn--primary" @click="confirmMeta">
              {{ t('app.save') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.explorer {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1 1 auto;
}

/* ---------------------------------------------------------------- 删除确认
   Teleport 到 body，所以这里的定位与色值都只依赖主题变量，不依赖侧边栏的容器 */
.confirm {
  position: fixed;
  inset: 0;
  /* 高于右键菜单（120），低于顶栏下拉之类的系统级浮层 */
  z-index: 130;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.32);
}

.confirm__card {
  width: min(340px, 100%);
  padding: 14px;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  background: var(--bg-raised);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.34);
}

.confirm__title {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 650;
  color: var(--text);
}

.confirm__desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-dim);
  /* 长路径要能换行，别把卡片撑破 */
  overflow-wrap: anywhere;
}

.confirm__path {
  color: var(--text);
}

.confirm__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}

.confirm__btn {
  padding: 5px 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-panel);
  color: var(--text);
  font: 500 12.5px/1.5 var(--font-sans, system-ui);
  cursor: pointer;
}

.confirm__btn:hover {
  background: var(--bg-hover);
}

/* 危险动作沿用 icon-btn--danger 的配色，两套主题各自有变量 */
.confirm__btn--danger {
  border-color: transparent;
  background: var(--danger-bg);
  color: var(--danger-text);
}

.confirm__btn--danger:hover {
  background: var(--danger-bg-hover);
}

.confirm__btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}

/* ---------------------------------------------------------------- 题目信息
   与删除确认同款：Teleport 到 body，只依赖主题变量 */
.meta {
  position: fixed;
  inset: 0;
  z-index: 130;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.32);
}

.meta__card {
  width: min(360px, 100%);
  padding: 14px;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  background: var(--bg-raised);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.34);
}

.meta__title {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 650;
  color: var(--text);
}

.meta__file {
  margin: 0 0 12px;
  font: 400 11.5px/16px var(--font-mono, ui-monospace, monospace);
  color: var(--text-faint);
  overflow-wrap: anywhere;
}

.meta__field {
  display: block;
  margin-bottom: 10px;
}

.meta__label {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  color: var(--text-dim);
}

.meta__input {
  width: 100%;
  height: 28px;
  padding: 0 8px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font: 400 13px/26px var(--font-sans, system-ui);
}

.meta__input:focus {
  outline: none;
  border-color: var(--accent);
}

.meta__input:disabled {
  opacity: 0.5;
}

.meta__error {
  margin: 0 0 8px;
  color: var(--danger-text);
  font-size: 11.5px;
  line-height: 16px;
}

.meta__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}

.meta__btn {
  padding: 5px 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-panel);
  color: var(--text);
  font: 500 12.5px/1.5 var(--font-sans, system-ui);
  cursor: pointer;
}

.meta__btn:hover {
  background: var(--bg-hover);
}

.meta__btn--primary {
  border-color: transparent;
  background: var(--accent);
  color: var(--text-on-accent);
}

.meta__btn--primary:hover {
  background: var(--accent-hover);
}

.meta__btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}

.explorer__head {
  display: flex;
  align-items: center;
  /* 左侧是「资源管理器 / 评测样例」切换入口（两个 logo），右侧是两颗操作按钮；
     两边加起来也远比面板下限窄，所以不折行（折行只留给评测样例页头） */
  justify-content: space-between;
  gap: 8px;
  /* 与评测样例页头同高 */
  height: 35px;
  padding: 0 8px 0 4px;
  border-bottom: 1px solid var(--border-soft);
  background: var(--bg-panel-head);
}

.explorer__actions {
  display: inline-flex;
  flex: 0 0 auto;
  /* 折到第二行时仍然贴右 */
  margin-left: auto;
  gap: 2px;
}

.explorer__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 5px;
  color: var(--text-dim);
  cursor: pointer;
}

.explorer__btn:hover {
  background: var(--bg-control-hover);
  color: var(--text);
}

.explorer__tree {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 0;
}

.explorer__empty {
  margin: 8px 12px;
  color: var(--text-faint);
  font-size: 12px;
  line-height: 18px;
}
</style>
