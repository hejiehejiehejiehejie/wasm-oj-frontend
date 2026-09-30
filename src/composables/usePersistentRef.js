import { onMounted, ref, watch } from 'vue'

function availableStorage() {
  try {
    const probeKey = '__cp_probe__'
    window.localStorage.setItem(probeKey, '1')
    window.localStorage.removeItem(probeKey)
    return window.localStorage
  } catch {
    return undefined
  }
}

const storage = availableStorage()

function hydrate(value, reviveFn) {
  return reviveFn ? reviveFn(value) : value
}

/**
 * A `ref` mirrored into localStorage: written once when the component mounts (so
 * a first visit persists the defaults) and again on every change afterwards.
 *
 * `serialize` trims what goes to disk, `revive` rebuilds richer records on read.
 */
export function usePersistentRef(key, initial, options = {}) {
  const { deep = true, serialize = (value) => value, revive = null } = options

  function read() {
    if (!storage) return hydrate(initial, revive)
    try {
      const raw = storage.getItem(key)
      if (raw === null || raw === undefined) return hydrate(initial, revive)
      return hydrate(JSON.parse(raw), revive)
    } catch {
      return hydrate(initial, revive)
    }
  }

  function write() {
    if (!storage) return
    try {
      storage.setItem(key, JSON.stringify(serialize(state.value)))
    } catch {
      /* 隐私模式或配额已满：只在内存里工作 */
    }
  }

  const state = ref(read())

  onMounted(write)
  watch(state, write, { deep })

  return state
}
