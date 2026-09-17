<script setup>
// Small inline icon set (lucide-shaped 24x24 strokes) so the tool ships with no
// icon dependency.
const PATHS = {
  play: ['M7 4.5 19.5 12 7 19.5z'],
  stop: ['M7 7h10v10H7z'],
  swap: ['M16 3.5 20 7.5l-4 4', 'M20 7.5H4', 'M8 20.5l-4-4 4-4', 'M4 16.5h16'],
  trash: [
    'M4 7h16',
    'M19 7l-.9 12.1A2 2 0 0 1 16.1 21H7.9a2 2 0 0 1-2-1.9L5 7',
    'M10 11.5v5.5',
    'M14 11.5v5.5',
    'M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2',
  ],
  plus: ['M12 5v14', 'M5 12h14'],
  code: ['m16 18 6-6-6-6', 'm8 6-6 6 6 6'],
  sliders: [
    'M4 6h9',
    'M17 6h3',
    'M4 12h3',
    'M11 12h9',
    'M4 18h9',
    'M17 18h3',
    'M15 6a2 2 0 1 0 4 0 2 2 0 0 0-4 0z',
    'M9 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0z',
    'M15 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0z',
  ],
  gear: [
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
    'M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.03 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.08a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03z',
  ],
  check: ['M20 6.5 9.5 17 4.5 12'],
  close: ['M18 6 6 18', 'm6 6 12 12'],
  alert: ['m10.3 3.9-8.5 14.1A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', 'M12 9v4.5', 'M12 17h.01'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7.5V12l3 2'],
  reset: ['M3 12a9 9 0 1 0 2.6-6.4L3 8', 'M3 3v5h5'],
  copy: ['M9 9h9.5a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H9a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 9 9z', 'M5.5 15H5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 5 3h9A1.5 1.5 0 0 1 15.5 4.5V5'],
  chevron: ['m6 9 6 6 6-6'],
  // 本地运行环境（浏览器内的沙箱），用芯片图形表示「跑在本机」
  cpu: [
    'M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
    'M10 9h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z',
    'M9 2v2',
    'M15 2v2',
    'M9 20v2',
    'M15 20v2',
    'M2 9h2',
    'M2 15h2',
    'M20 9h2',
    'M20 15h2',
  ],
  download: ['M12 3.5v11.5', 'm7.5 10.5 4.5 4.5 4.5-4.5', 'M4.5 20.5h15'],
}

defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 15 },
  strokeWidth: { type: [Number, String], default: 1.9 },
})

function inner(name) {
  return (PATHS[name] ?? [])
    .map((d) => `<path d="${d}"/>`)
    .join('')
}
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
    v-html="inner(name)"
  ></svg>
</template>
