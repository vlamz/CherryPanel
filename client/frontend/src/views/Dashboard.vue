<script setup>
import { ref, inject, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Icon from '@/components/ui/Icon.vue'
import Loader from '@/components/ui/Loader.vue'
import Chart from 'chart.js/auto'
import 'chartjs-adapter-date-fns'
import { decodeLogs, parseConsoleLine } from '@/utils/consolePlayerParser.js'

const api = inject('api')
const { t } = useI18n()

// ─── Dashboard settings (localStorage) ───────────────────────
const LS_REFRESH   = 'pp_dashboard_refresh_ms'
const LS_CPU_COUNT = 'pp_dashboard_cpu_count'

const refreshInterval = ref(parseInt(localStorage.getItem(LS_REFRESH)  || '15000'))
const cpuLogicalCount = ref(parseInt(localStorage.getItem(LS_CPU_COUNT) || '12'))
const showSettings    = ref(false)
// Temporary values while settings modal is open
const tmpRefresh  = ref(refreshInterval.value)
const tmpCpuCount = ref(cpuLogicalCount.value)

const REFRESH_OPTIONS = [5000, 10000, 15000, 30000, 60000]

function openSettings() {
  tmpRefresh.value  = refreshInterval.value
  tmpCpuCount.value = cpuLogicalCount.value
  showSettings.value = true
}

function saveSettings() {
  refreshInterval.value = tmpRefresh.value
  cpuLogicalCount.value = tmpCpuCount.value
  localStorage.setItem(LS_REFRESH,   refreshInterval.value)
  localStorage.setItem(LS_CPU_COUNT, cpuLogicalCount.value)
  showSettings.value = false
  restartStatsTask()
}

function restartStatsTask() {
  clearInterval(statsTask)
  statsTask = setInterval(async () => {
    await refreshStatuses()
    await refreshServerStats()
    await fetchAllMemoryMaxes()
  }, refreshInterval.value)
}

// ─── Helpers ──────────────────────────────────────────────────
function formatBytes(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
}

// ─── History storage ──────────────────────────────────────────
const LS_HISTORY = 'pp_host_stats_v1'
const MAX_AGE_MS = 30 * 24 * 3600 * 1000

function loadHistory() {
  try {
    const raw = localStorage.getItem(LS_HISTORY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore parse error */ }
  return { t: [], cpu: [], ram: [], disk: [] }
}

function pruneHistory(h) {
  const cutoff = Date.now() - MAX_AGE_MS
  let i = 0
  while (i < h.t.length && h.t[i] < cutoff) i++
  if (i > 0) {
    h.t = h.t.slice(i); h.cpu = h.cpu.slice(i)
    h.ram = h.ram.slice(i); h.disk = h.disk.slice(i)
  }
  return h
}

function saveHistory(h) {
  try { localStorage.setItem(LS_HISTORY, JSON.stringify(h)) } catch { /* quota exceeded */ }
}

const history = ref(pruneHistory(loadHistory()))

// ─── System stats ─────────────────────────────────────────────
const systemStats = ref(null)
const systemStatsError = ref(false)
let systemStatsTask = null
let histSaveCounter = 0

async function fetchSystemStats() {
  try {
    const data = await api.node.getSystemStats()
    systemStats.value = data
    systemStatsError.value = false

    const now = Date.now()
    history.value.t.push(now)
    history.value.cpu.push(data.cpu)
    history.value.ram.push(data.memory.percent)
    history.value.disk.push(data.disk.percent)

    histSaveCounter++
    if (histSaveCounter % 12 === 0) {   // save every ~60s
      pruneHistory(history.value)
      saveHistory(history.value)
    }
    updateChart()
  } catch {
    systemStatsError.value = true
  }
}

// ─── Chart ────────────────────────────────────────────────────
const chartCanvas = ref(null)
const chartRange = ref('1h')
let chartInstance = null

const RANGES = computed(() => [
  { key: '1h',  label: t('dashboard.range.1h'),  ms: 3_600_000 },
  { key: '24h', label: t('dashboard.range.24h'), ms: 86_400_000 },
  { key: '1w',  label: t('dashboard.range.1w'),  ms: 7 * 86_400_000 },
  { key: '1mo', label: t('dashboard.range.1mo'), ms: 30 * 86_400_000 },
])

function getChartDataset() {
  const range = RANGES.value.find(r => r.key === chartRange.value)
  const cutoff = Date.now() - range.ms
  const h = history.value
  const startIdx = h.t.findIndex(t => t >= cutoff)
  if (startIdx === -1 || startIdx >= h.t.length) return { labels: [], cpu: [], ram: [], disk: [] }

  let ts   = h.t.slice(startIdx)
  let cpu  = h.cpu.slice(startIdx)
  let ram  = h.ram.slice(startIdx)
  let disk = h.disk.slice(startIdx)

  // downsample to max 400 points
  const MAX_PTS = 400
  if (ts.length > MAX_PTS) {
    const step = Math.ceil(ts.length / MAX_PTS)
    ts   = ts.filter((_, i) => i % step === 0)
    cpu  = cpu.filter((_, i) => i % step === 0)
    ram  = ram.filter((_, i) => i % step === 0)
    disk = disk.filter((_, i) => i % step === 0)
  }
  return { labels: ts, cpu, ram, disk }
}

function initChart() {
  if (!chartCanvas.value) return
  if (chartInstance) { chartInstance.destroy(); chartInstance = null }

  const { labels, cpu, ram, disk } = getChartDataset()

  chartInstance = new Chart(chartCanvas.value, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'CPU',
          data: cpu,
          borderColor: '#818cf8',
          backgroundColor: 'rgba(129,140,248,0.12)',
          fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2,
        },
        {
          label: 'RAM',
          data: ram,
          borderColor: '#34d399',
          backgroundColor: 'rgba(52,211,153,0.10)',
          fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2,
        },
        {
          label: 'Disk',
          data: disk,
          borderColor: '#fbbf24',
          backgroundColor: 'rgba(251,191,36,0.10)',
          fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { color: 'rgba(240,240,240,0.65)', boxWidth: 10, padding: 10, font: { size: 11 } }
        },
        tooltip: {
          backgroundColor: 'rgba(20,20,35,0.92)',
          titleColor: 'rgba(240,240,240,0.7)',
          bodyColor: 'rgba(240,240,240,0.9)',
          callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%` }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: { displayFormats: { second: 'HH:mm:ss', minute: 'HH:mm', hour: 'HH:mm', day: 'dd.MM' } },
          ticks: { color: 'rgba(240,240,240,0.35)', maxTicksLimit: 6, font: { size: 10 } },
          grid: { color: 'rgba(255,255,255,0.04)' },
          border: { display: false }
        },
        y: {
          min: 0, max: 100,
          ticks: { color: 'rgba(240,240,240,0.35)', callback: v => v + '%', stepSize: 25, font: { size: 10 } },
          grid: { color: 'rgba(255,255,255,0.04)' },
          border: { display: false }
        }
      }
    }
  })
}

function updateChart() {
  if (!chartInstance) return
  const { labels, cpu, ram, disk } = getChartDataset()
  chartInstance.data.labels = labels
  chartInstance.data.datasets[0].data = cpu
  chartInstance.data.datasets[1].data = ram
  chartInstance.data.datasets[2].data = disk
  chartInstance.update('none')
}

watch(chartRange, () => {
  if (!chartInstance) return
  const { labels, cpu, ram, disk } = getChartDataset()
  chartInstance.data.labels = labels
  chartInstance.data.datasets[0].data = cpu
  chartInstance.data.datasets[1].data = ram
  chartInstance.data.datasets[2].data = disk
  chartInstance.update()
})

// ─── Servers ──────────────────────────────────────────────────
const servers       = ref([])
const loadingServers = ref(true)
const serverStats      = ref({})
const serverMemoryMax  = ref({})   // { serverId: maxBytes } — fetched once from server config
const memMaxFetched    = new Set() // ids that have been successfully fetched (or permanently unavailable)
const playerCounts     = ref({})   // { serverId: { current, max } }
let   statsTask        = null

// ─── Real-time player counts via WebSocket ─────────────────────
const serverConnections = new Map() // serverId → { server, unbind }

async function connectForPlayerCount(serverId) {
  if (serverConnections.has(serverId)) return
  const serverType = servers.value.find(s => s.id === serverId)?.type || 'minecraft'
  try {
    const server = await api.server.get(serverId)
    const unbind = server.on('console', (data) => {
      if (!data?.logs?.length) return
      const text = decodeLogs(data.logs)
      for (const raw of text.split('\n')) {
        const ev = parseConsoleLine(raw, serverType)
        if (!ev) continue
        const cur = playerCounts.value[serverId] || { current: 0, max: 0 }
        if (ev.type === 'join') {
          playerCounts.value = { ...playerCounts.value, [serverId]: { current: cur.current + 1, max: cur.max } }
        } else if (ev.type === 'leave') {
          playerCounts.value = { ...playerCounts.value, [serverId]: { current: Math.max(0, cur.current - 1), max: cur.max } }
        } else if (ev.type === 'list') {
          playerCounts.value = { ...playerCounts.value, [serverId]: { current: ev.names.length, max: ev.max } }
        }
      }
    })
    serverConnections.set(serverId, { server, unbind })
  } catch { /* permission denied or server unavailable */ }
}

function disconnectServer(serverId) {
  const conn = serverConnections.get(serverId)
  if (!conn) return
  try { conn.unbind() } catch (_) { /* listener already removed */ }
  try { conn.server.closeSocket() } catch (_) { /* socket already closed */ }
  serverConnections.delete(serverId)
}

function disconnectAll() {
  for (const id of serverConnections.keys()) disconnectServer(id)
}

// ─── Server start / stop from Dashboard card ──────────────────
const actionLoading = ref(new Set())

async function serverAction(serverId, action) {
  if (actionLoading.value.has(serverId)) return
  actionLoading.value = new Set([...actionLoading.value, serverId])
  try {
    if (action === 'start') await api.server.start(serverId)
    else if (action === 'stop') await api.server.stop(serverId)
  } catch (_) { /* 403 or other error — silently ignored */ }
  finally {
    // Give PufferPanel ~1.2s to process the action, then refresh status
    setTimeout(async () => {
      await refreshStatuses()
      const next = new Set(actionLoading.value)
      next.delete(serverId)
      actionLoading.value = next
    }, 1200)
  }
}

async function loadAllServers() {
  let page = 1, allLoaded = false
  while (!allLoaded) {
    const data = await api.server.list(page, 50)
    data.servers.forEach(s => servers.value.push(s))
    allLoaded = data.paging.page * data.paging.pageSize >= (data.paging.total || 0)
    page++
  }
}

// Fetch max RAM from server definition for all servers (once per server, independent of online status)
// Uses getDefinition (returns ALL variables regardless of userEdit) instead of getData (only userEdit=true)
async function fetchAllMemoryMaxes() {
  await Promise.all(
    servers.value.map(async s => {
      if (memMaxFetched.has(s.id)) return
      try {
        const def = await api.server.getDefinition(s.id)
        // Definition returns full server JSON: { data: { memory: { value: <MB> }, ... }, ... }
        const memMB = def?.data?.memory?.value ?? null
        if (memMB && memMB > 0) {
          serverMemoryMax.value[s.id] = memMB * 1024 * 1024
        }
        memMaxFetched.add(s.id)
      } catch { /* permission denied — try again next cycle */ }
    })
  )
}

async function refreshStatuses() {
  await Promise.all(servers.value.map(async s => {
    if (s.canGetStatus) {
      const prevOnline = s.online
      try { s.online = await api.server.getStatus(s.id) }
      catch { s.online = 'offline' }
      if (s.online === 'online') {
        connectForPlayerCount(s.id) // no-op if already connected
      } else if (prevOnline === 'online') {
        disconnectServer(s.id) // server just went offline — close socket
      }
    }
  }))
}

async function refreshServerStats() {
  await Promise.all(
    servers.value.filter(s => s.online === 'online').map(async s => {
      try { serverStats.value[s.id] = await api.server.getStats(s.id) }
      catch { serverStats.value[s.id] = null }
      try {
        const q = await api.server.getQuery(s.id)
        if (q?.minecraft) {
          playerCounts.value[s.id] = { current: q.minecraft.numPlayers, max: q.minecraft.maxPlayers }
        }
      } catch { /* query not supported or server offline */ }
    })
  )
}

const totalOnline = computed(() => servers.value.filter(s => s.online === 'online').length)

// ─── Sort ────────────────────────────────────────────────────
const sortKey = ref('status')
const SORT_OPTIONS = computed(() => [
  { key: 'status',  label: t('dashboard.sort.ByStatus') },
  { key: 'name',    label: t('dashboard.sort.ByName') },
  { key: 'players', label: t('dashboard.sort.ByPlayers') },
  { key: 'node',    label: t('dashboard.sort.ByNode') },
])

function sortedList(list) {
  return [...list].sort((a, b) => {
    if (sortKey.value === 'name') return a.name.localeCompare(b.name)
    if (sortKey.value === 'players') {
      const aP = playerCounts.value[a.id]?.current ?? -1
      const bP = playerCounts.value[b.id]?.current ?? -1
      if (bP !== aP) return bP - aP
      return a.name.localeCompare(b.name)
    }
    if (sortKey.value === 'node') return (a.node?.name || '').localeCompare(b.node?.name || '')
    // default: status
    const order = { online: 0, installing: 1, offline: 2 }
    const aS = order[a.online] ?? 3, bS = order[b.online] ?? 3
    if (aS !== bS) return aS - bS
    return a.name.localeCompare(b.name)
  })
}

// ─── Groups ──────────────────────────────────────────────────
const LS_GROUPS = 'pp_server_groups_v1'

function loadGroups() {
  try { const r = localStorage.getItem(LS_GROUPS); return r ? JSON.parse(r) : {} }
  catch { return {} }
}
function saveGroups(g) {
  try { localStorage.setItem(LS_GROUPS, JSON.stringify(g)) } catch { /* quota exceeded */ }
}

const groups      = ref(loadGroups())    // { groupName: [serverId, ...] }
const activeGroup = ref('all')           // 'all' | 'ungrouped' | groupName
const showModal   = ref(false)
const newGrpName  = ref('')

const groupNames = computed(() => Object.keys(groups.value))

function getServerGroup(sid) {
  for (const [name, ids] of Object.entries(groups.value))
    if (ids.includes(sid)) return name
  return null
}

function createGroup() {
  const name = newGrpName.value.trim()
  if (!name || groups.value[name]) return
  groups.value[name] = []
  saveGroups(groups.value)
  newGrpName.value = ''
  showModal.value = false
}

function deleteGroup(name) {
  delete groups.value[name]
  groups.value = { ...groups.value }
  if (activeGroup.value === name) activeGroup.value = 'all'
  saveGroups(groups.value)
}

function setServerGroup(sid, groupName) {
  // Remove from all groups
  for (const k of Object.keys(groups.value))
    groups.value[k] = groups.value[k].filter(id => id !== sid)
  // Add to selected group
  if (groupName && groups.value[groupName]) groups.value[groupName].push(sid)
  groups.value = { ...groups.value }
  saveGroups(groups.value)
}

const hasUngrouped = computed(() => servers.value.some(s => !getServerGroup(s.id)))

const displayedServers = computed(() => {
  let list = servers.value
  if (activeGroup.value === 'ungrouped') {
    list = list.filter(s => !getServerGroup(s.id))
  } else if (activeGroup.value !== 'all') {
    const ids = groups.value[activeGroup.value] || []
    list = list.filter(s => ids.includes(s.id))
  }
  return sortedList(list)
})

// ─── Lifecycle ────────────────────────────────────────────────
onMounted(async () => {
  fetchSystemStats()
  systemStatsTask = setInterval(fetchSystemStats, 5000)

  await nextTick()
  initChart()

  try {
    await loadAllServers()
    await refreshStatuses()
    // Fetch max RAM for all servers in parallel with stats
    await Promise.all([
      refreshServerStats(),
      fetchAllMemoryMaxes(),
    ])
  } finally {
    loadingServers.value = false
  }

  statsTask = setInterval(async () => {
    await refreshStatuses()
    await refreshServerStats()
    await fetchAllMemoryMaxes()
  }, refreshInterval.value)
})

onUnmounted(() => {
  clearInterval(systemStatsTask)
  clearInterval(statsTask)
  disconnectAll()
  chartInstance?.destroy()
  pruneHistory(history.value)
  saveHistory(history.value)
})
</script>

<template>
  <div class="dashboard">

    <!-- ═══ TOP SECTION ═══ -->
    <div class="top-grid">

      <!-- System stats -->
      <div class="panel stats-panel">
        <div class="panel__head">
          <icon name="monitor" />
          <span>{{ t('dashboard.SystemMonitor') }}</span>
          <div v-if="systemStats" class="panel__live-dot" :title="t('dashboard.LiveDot')" />
        </div>

        <div v-if="systemStatsError" class="stats-error">
          <icon name="alert" /> {{ t('dashboard.StatsError') }}
        </div>
        <template v-else-if="systemStats">
          <div class="stat-row">
            <span class="stat-row__label">CPU</span>
            <div class="stat-row__track">
              <div class="stat-row__fill" :data-lvl="systemStats.cpu > 80 ? 'h' : systemStats.cpu > 50 ? 'm' : 'l'"
                :style="{ width: systemStats.cpu.toFixed(1) + '%' }" />
            </div>
            <span class="stat-row__val">{{ systemStats.cpu.toFixed(1) }}%</span>
          </div>
          <div class="stat-row">
            <span class="stat-row__label">RAM</span>
            <div class="stat-row__track">
              <div class="stat-row__fill" :data-lvl="systemStats.memory.percent > 80 ? 'h' : systemStats.memory.percent > 50 ? 'm' : 'l'"
                :style="{ width: systemStats.memory.percent.toFixed(1) + '%' }" />
            </div>
            <span class="stat-row__val">{{ formatBytes(systemStats.memory.used) }} / {{ formatBytes(systemStats.memory.total) }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-row__label">Disk</span>
            <div class="stat-row__track">
              <div class="stat-row__fill" :data-lvl="systemStats.disk.percent > 80 ? 'h' : systemStats.disk.percent > 50 ? 'm' : 'l'"
                :style="{ width: systemStats.disk.percent.toFixed(1) + '%' }" />
            </div>
            <span class="stat-row__val">{{ formatBytes(systemStats.disk.used) }} / {{ formatBytes(systemStats.disk.total) }}</span>
          </div>

          <div class="summary-chips">
            <div class="s-chip">
              <span class="s-chip__num">{{ servers.length }}</span>
              <span class="s-chip__lbl">{{ t('dashboard.Servers') }}</span>
            </div>
            <div class="s-chip s-chip--online">
              <span class="s-chip__num">{{ totalOnline }}</span>
              <span class="s-chip__lbl">{{ t('common.Online') }}</span>
            </div>
          </div>
        </template>
        <div v-else class="stats-loading"><loader small /></div>
      </div>

      <!-- Historical chart -->
      <div class="panel chart-panel">
        <div class="chart-header">
          <div class="panel__head">
            <icon name="stats" />
            <span>{{ t('dashboard.PerformanceHistory') }}</span>
          </div>
          <div class="range-btns">
            <button v-for="r in RANGES" :key="r.key"
              :class="['rbtn', chartRange === r.key ? 'rbtn--on' : '']"
              @click="chartRange = r.key">{{ r.label }}</button>
          </div>
        </div>
        <div class="chart-wrap">
          <canvas ref="chartCanvas" />
          <div v-if="history.t.length < 2" class="chart-empty">
            <icon name="stats" />
            <span>{{ t('dashboard.CollectingData') }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ SERVER TOOLBAR ═══ -->
    <div class="server-toolbar">
      <!-- Group tabs -->
      <div class="group-tabs" role="tablist">
        <button role="tab" :class="['gtab', activeGroup === 'all' ? 'gtab--on' : '']"
          @click="activeGroup = 'all'">
          {{ t('dashboard.All') }} <span class="gtab__cnt">{{ servers.length }}</span>
        </button>
        <button v-for="g in groupNames" :key="g" role="tab"
          :class="['gtab', activeGroup === g ? 'gtab--on' : '']"
          @click="activeGroup = g">
          {{ g }}
          <span class="gtab__cnt">{{ (groups[g] || []).length }}</span>
          <span class="gtab__del" @click.stop="deleteGroup(g)" :title="t('dashboard.DeleteGroup')">×</span>
        </button>
        <button v-if="hasUngrouped" role="tab"
          :class="['gtab gtab--muted', activeGroup === 'ungrouped' ? 'gtab--on' : '']"
          @click="activeGroup = 'ungrouped'">
          {{ t('dashboard.Ungrouped') }}
        </button>
      </div>

      <div class="toolbar-right">
        <div class="sort-wrap">
          <icon name="sort" />
          <select v-model="sortKey" class="sort-select">
            <option v-for="o in SORT_OPTIONS" :key="o.key" :value="o.key">{{ o.label }}</option>
          </select>
        </div>
        <button class="add-group-btn" @click="showModal = true">
          <icon name="layers" /> {{ t('dashboard.AddGroup') }}
        </button>
        <button class="add-group-btn" :title="t('dashboard.settings.Title')" @click="openSettings">
          ⚙
        </button>
      </div>
    </div>

    <!-- ═══ SERVER GRID ═══ -->
    <div v-if="loadingServers" class="loading-wrap"><loader /></div>
    <div v-else class="server-grid">
      <router-link
        v-for="server in displayedServers"
        :key="server.id"
        :to="{ name: 'ServerView', params: { id: server.id } }"
        class="sc"
        :data-status="server.online || 'unknown'">

        <!-- Group assign select (stop propagation so click doesn't navigate) -->
        <div v-if="groupNames.length > 0" class="sc__group-row" @click.prevent.stop>
          <select class="sc__group-select"
            :value="getServerGroup(server.id) || ''"
            @change="setServerGroup(server.id, $event.target.value)">
            <option value="">{{ t('dashboard.NoGroup') }}</option>
            <option v-for="g in groupNames" :key="g" :value="g">{{ g }}</option>
          </select>
        </div>

        <div class="sc__header">
          <span class="sc__dot" />
          <span class="sc__name">{{ server.name }}</span>
        </div>
        <div class="sc__type">{{ server.type }}</div>
        <div v-if="server.node" class="sc__node">
          <icon name="node" />{{ server.node?.name || server.node }}
        </div>

        <div v-if="playerCounts[server.id]" class="sc__players">
          &#x1F464; {{ playerCounts[server.id].current }}/{{ playerCounts[server.id].max }}
        </div>

        <template v-if="server.online === 'online' && serverStats[server.id]">
          <div class="sc__minibar">
            <span class="sc__mb-lbl">CPU</span>
            <div class="sc__mb-track">
              <div class="sc__mb-fill" :style="{ width: Math.min((serverStats[server.id].cpu || 0) / cpuLogicalCount, 100).toFixed(1) + '%' }" />
            </div>
            <span class="sc__mb-val">{{ ((serverStats[server.id].cpu || 0) / cpuLogicalCount).toFixed(0) }}%</span>
          </div>
          <div class="sc__minibar sc__minibar--ram">
            <span class="sc__mb-lbl">RAM</span>
            <span class="sc__mb-bytes">
              {{ formatBytes(serverStats[server.id].memory || 0) }}
              <template v-if="serverMemoryMax[server.id]">
                <span class="sc__mb-sep">/</span>
                {{ formatBytes(serverMemoryMax[server.id]) }}
              </template>
            </span>
          </div>
        </template>
        <div v-else-if="server.online === 'offline'" class="sc__offline">{{ t('common.Offline') }}</div>
        <div v-else-if="server.online === 'installing'" class="sc__installing">{{ t('dashboard.InstallingDots') }}</div>

        <!-- Start / Stop quick-action button (bottom-right of card) -->
        <div v-if="server.online !== 'installing'" class="sc__actions" @click.prevent.stop>
          <button v-if="server.online === 'offline'"
            class="sc__act sc__act--start"
            :disabled="actionLoading.has(server.id)"
            :title="t('servers.Start')"
            @click.prevent.stop="serverAction(server.id, 'start')">
            <icon name="play" />
          </button>
          <button v-else-if="server.online === 'online'"
            class="sc__act sc__act--stop"
            :disabled="actionLoading.has(server.id)"
            :title="t('servers.Stop')"
            @click.prevent.stop="serverAction(server.id, 'stop')">
            <icon name="stop" />
          </button>
        </div>
      </router-link>

      <router-link v-if="api.auth.hasScope('server.create')" :to="{ name: 'ServerCreate' }" class="sc sc--add">
        <icon name="plus" /><span>{{ t('servers.Add') }}</span>
      </router-link>
    </div>

    <!-- ═══ ADD GROUP MODAL ═══ -->
    <Teleport to="body">
      <div v-if="showModal" class="modal-bg" @click.self="showModal = false">
        <div class="modal">
          <h3 class="modal__title">{{ t('dashboard.NewGroup') }}</h3>
          <input v-model="newGrpName" class="modal__input" :placeholder="t('dashboard.GroupNamePlaceholder')" autofocus
            @keydown.enter="createGroup" @keydown.esc="showModal = false" />
          <div class="modal__actions">
            <button class="modal__btn" @click="showModal = false">{{ t('common.Cancel') }}</button>
            <button class="modal__btn modal__btn--primary" @click="createGroup">{{ t('dashboard.Create') }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ═══ DASHBOARD SETTINGS MODAL ═══ -->
    <Teleport to="body">
      <div v-if="showSettings" class="modal-bg" @click.self="showSettings = false">
        <div class="modal">
          <h3 class="modal__title">{{ t('dashboard.settings.Title') }}</h3>

          <div class="ds-field">
            <label class="ds-label">{{ t('dashboard.settings.RefreshInterval') }}</label>
            <div class="ds-radio-group">
              <label v-for="ms in REFRESH_OPTIONS" :key="ms" class="ds-radio">
                <input type="radio" :value="ms" v-model="tmpRefresh" />
                {{ ms / 1000 }}s
              </label>
            </div>
          </div>

          <div class="ds-field">
            <label class="ds-label">{{ t('dashboard.settings.CpuCount') }}</label>
            <input type="number" v-model.number="tmpCpuCount" min="1" max="512" class="modal__input ds-number" />
            <span class="ds-hint">{{ t('dashboard.settings.CpuCountHint') }}</span>
          </div>

          <div class="modal__actions">
            <button class="modal__btn" @click="showSettings = false">{{ t('common.Cancel') }}</button>
            <button class="modal__btn modal__btn--primary" @click="saveSettings">{{ t('dashboard.settings.Save') }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* ── Layout ── */
.dashboard {
  grid-column: 1 / -1;   /* span all 12 columns of .main grid */
  padding: 1.5em;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 1.2em;
}

/* ── Top two-column grid ── */
.top-grid {
  display: grid;
  grid-template-columns: 280px 1fr;
  align-items: start;
  gap: 1em;
  width: 100%;
}

@media (max-width: 760px) {
  .top-grid { grid-template-columns: 1fr; }
}

/* ── Generic panel ── */
.panel {
  background: var(--background);
  border: 1px solid rgba(128,128,128,0.18);
  border-radius: 10px;
  padding: 1.1em 1.3em;
  display: flex;
  flex-direction: column;
  gap: 0.8em;
}

.panel__head {
  display: flex;
  align-items: center;
  gap: 0.5em;
  font-size: 0.88em;
  font-weight: 600;
  opacity: 0.75;
}

.panel__live-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 6px #22c55e;
  animation: pulse 2s infinite;
  margin-left: auto;
}

@keyframes pulse {
  0%, 100% { opacity: 1 }
  50% { opacity: 0.4 }
}

/* ── Stat bars ── */
.stat-row {
  display: grid;
  grid-template-columns: 2.8em 1fr 9em;
  align-items: center;
  gap: 0.7em;
}

.stat-row__label {
  font-size: 0.82em;
  font-weight: 600;
  opacity: 0.6;
  text-align: right;
}

.stat-row__track {
  height: 7px;
  background: color-mix(in srgb, var(--text-disabled) 25%, transparent);
  border-radius: 4px;
  overflow: hidden;
}

.stat-row__fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.45s ease;
  background: var(--primary);
}

.stat-row__fill[data-lvl="m"] { background: #f59e0b; }
.stat-row__fill[data-lvl="h"] { background: #ef4444; }

.stat-row__val {
  font-size: 0.79em;
  opacity: 0.65;
  white-space: nowrap;
}

.stats-error, .stats-loading {
  text-align: center;
  padding: 1em;
  opacity: 0.5;
}

/* ── Summary chips ── */
.summary-chips {
  display: flex;
  gap: 0.7em;
  margin-top: 0.3em;
  flex-wrap: wrap;
}

.s-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.5em 1em;
  background: color-mix(in srgb, var(--text-disabled) 10%, transparent);
  border-radius: 8px;
  border: 1px solid rgba(128,128,128,0.12);
  min-width: 74px;
}

.s-chip--online .s-chip__num { color: #22c55e; }
.s-chip__num { font-size: 1.6em; font-weight: 700; line-height: 1.1; }
.s-chip__lbl { font-size: 0.72em; opacity: 0.55; margin-top: 0.15em; }

/* ── Chart panel ── */
.chart-panel { /* height controlled by chart-wrap */ }

.chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5em;
  flex-wrap: wrap;
}

.chart-header .panel__head {
  margin-bottom: 0;
}

.range-btns {
  display: flex;
  gap: 0.3em;
  flex-shrink: 0;
}

.rbtn {
  padding: 0.2em 0.7em;
  border-radius: 5px;
  border: 1px solid rgba(128,128,128,0.25);
  background: transparent;
  color: var(--text);
  cursor: pointer;
  font-size: 0.78em;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s;
}

.rbtn:hover { background: rgba(128,128,128,0.15); }
.rbtn--on {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.chart-wrap {
  position: relative;
  height: 200px;
  width: 100%;
  overflow: hidden;
}

.chart-wrap canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100% !important;
  height: 100% !important;
}

.chart-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5em;
  opacity: 0.35;
  font-size: 0.85em;
}

/* ── Server toolbar ── */
.server-toolbar {
  display: flex;
  align-items: center;
  gap: 0.8em;
  flex-wrap: wrap;
  background: var(--background);
  border: 1px solid rgba(128,128,128,0.15);
  border-radius: 10px;
  padding: 0.6em 1em;
}

.group-tabs {
  display: flex;
  gap: 0.35em;
  flex-wrap: wrap;
  flex: 1;
  align-items: center;
}

.gtab {
  display: inline-flex;
  align-items: center;
  gap: 0.35em;
  padding: 0.3em 0.75em;
  border-radius: 6px;
  border: 1px solid rgba(128,128,128,0.2);
  background: transparent;
  color: var(--text);
  cursor: pointer;
  font-size: 0.83em;
  transition: background 0.15s, border-color 0.15s;
  white-space: nowrap;
}

.gtab:hover { background: rgba(128,128,128,0.12); }
.gtab--on { background: var(--primary); border-color: var(--primary); color: #fff; }
.gtab--muted { opacity: 0.6; }

.gtab__cnt {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(128,128,128,0.25);
  border-radius: 10px;
  padding: 0 0.45em;
  font-size: 0.85em;
  min-width: 1.4em;
}

.gtab--on .gtab__cnt { background: rgba(255,255,255,0.25); }

.gtab__del {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px; height: 16px;
  border-radius: 50%;
  font-size: 1em;
  line-height: 1;
  opacity: 0.7;
  transition: background 0.12s, opacity 0.12s;
  cursor: pointer;
}
.gtab__del:hover { background: rgba(255,255,255,0.2); opacity: 1; }

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 0.6em;
  margin-left: auto;
  flex-shrink: 0;
}

.sort-wrap {
  display: flex;
  align-items: center;
  gap: 0.35em;
  font-size: 0.85em;
  opacity: 0.8;
}

.sort-select {
  background: #1e2330;
  border: 1px solid rgba(128,128,128,0.3);
  border-radius: 6px;
  color: #cdd9e5;
  padding: 0.25em 0.5em;
  font-size: 0.85em;
  cursor: pointer;
}
.sort-select option {
  background: #1e2330;
  color: #cdd9e5;
}

.add-group-btn {
  display: flex;
  align-items: center;
  gap: 0.3em;
  padding: 0.3em 0.75em;
  border-radius: 6px;
  border: 1px solid rgba(128,128,128,0.25);
  background: transparent;
  color: var(--text);
  font-size: 0.83em;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
}
.add-group-btn:hover { background: rgba(128,128,128,0.15); }

/* ── Server grid ── */
.loading-wrap { text-align: center; padding: 3em; }

.server-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 0.85em;
  width: 100%;
}

/* ── Server card ── */
.sc {
  display: flex;
  flex-direction: column;
  gap: 0.45em;
  padding: 0.9em 1.1em;
  background: var(--background);
  border: 1px solid rgba(128,128,128,0.18);
  border-radius: 10px;
  text-decoration: none;
  transition: border-color 0.18s, box-shadow 0.18s, transform 0.14s;
  position: relative;
}

.sc:hover {
  border-color: var(--primary);
  box-shadow: 0 6px 24px rgba(0,0,0,0.18);
  transform: translateY(-2px);
}

.sc[data-status="online"]    { border-left: 3px solid #22c55e; }
.sc[data-status="offline"]   { border-left: 3px solid rgba(128,128,128,0.3); opacity: 0.72; }
.sc[data-status="installing"] { border-left: 3px solid #f59e0b; }

.sc--add {
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 0.4em;
  border-style: dashed;
  opacity: 0.5;
  min-height: 80px;
}
.sc--add:hover { opacity: 1; transform: none; }

/* Group assignment row */
.sc__group-row {
  position: absolute;
  top: 0.5em; right: 0.5em;
}

.sc__group-select {
  font-size: 0.68em;
  padding: 0.15em 0.3em;
  border-radius: 5px;
  border: 1px solid rgba(128,128,128,0.2);
  background: #1e2330;
  color: #cdd9e5;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
  max-width: 90px;
}
.sc__group-select option {
  background: #1e2330;
  color: #cdd9e5;
}
.sc:hover .sc__group-select { opacity: 1; }

.sc__header {
  display: flex;
  align-items: center;
  gap: 0.4em;
  padding-right: 1em;  /* room for group select */
}

.sc__dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: rgba(128,128,128,0.4);
  flex-shrink: 0;
}
[data-status="online"]    .sc__dot { background: #22c55e; box-shadow: 0 0 5px #22c55e80; }
[data-status="installing"] .sc__dot { background: #f59e0b; }

.sc__name {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.95em;
}

.sc__type {
  font-size: 0.72em;
  opacity: 0.45;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.sc__node {
  display: flex;
  align-items: center;
  gap: 0.25em;
  font-size: 0.72em;
  opacity: 0.5;
}

.sc__players { font-size: 0.88em; }

.sc__offline, .sc__installing { font-size: 0.8em; opacity: 0.45; }
.sc__installing { color: #f59e0b; opacity: 0.7; }

/* Start / Stop action button */
.sc__actions {
  position: absolute;
  bottom: 0.5rem;
  right: 0.5rem;
  z-index: 2;
}
.sc__act {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.06);
  color: rgba(205,217,229,0.65);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.78rem;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  padding: 0;
}
.sc__act--start:hover:not(:disabled) { background: rgba(34,197,94,0.18); color: #4ade80; border-color: rgba(34,197,94,0.35); }
.sc__act--stop:hover:not(:disabled)  { background: rgba(239,68,68,0.18);  color: #f87171; border-color: rgba(239,68,68,0.35); }
.sc__act:disabled { opacity: 0.35; cursor: not-allowed; }

/* Mini bars */
.sc__minibar {
  display: grid;
  grid-template-columns: 2.2em 1fr 2.8em;
  align-items: center;
  gap: 0.35em;
}
.sc__minibar--ram {
  grid-template-columns: 2.2em 1fr;
}
.sc__mb-lbl { font-size: 0.7em; opacity: 0.5; text-align: right; }
.sc__mb-track {
  height: 3px;
  background: color-mix(in srgb, var(--text-disabled) 25%, transparent);
  border-radius: 2px;
  overflow: hidden;
}
.sc__mb-fill {
  height: 100%;
  background: var(--primary);
  border-radius: 2px;
  transition: width 0.4s ease;
}
.sc__mb-val { font-size: 0.7em; opacity: 0.5; }
.sc__mb-bytes { font-size: 0.7em; opacity: 0.55; }
.sc__mb-sep   { opacity: 0.35; margin: 0 0.2em; }

/* ── Modal ── */
.modal-bg {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.modal {
  background: #161b22;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 12px;
  padding: 1.5em;
  min-width: 300px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.6);
  display: flex;
  flex-direction: column;
  gap: 1em;
}

.modal__title { margin: 0; font-size: 1.1em; color: #cdd9e5; }

.modal__input {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 7px;
  color: #cdd9e5;
  padding: 0.6em 0.85em;
  font-size: 0.95em;
  width: 100%;
  box-sizing: border-box;
  outline: none;
}
.modal__input::placeholder { color: rgba(205,217,229,0.35); }
.modal__input:focus { border-color: var(--primary); }

.modal__actions {
  display: flex;
  gap: 0.6em;
  justify-content: flex-end;
}

.modal__btn {
  padding: 0.45em 1em;
  border-radius: 7px;
  border: 1px solid rgba(255,255,255,0.15);
  background: rgba(255,255,255,0.07);
  color: #cdd9e5;
  cursor: pointer;
  font-size: 0.9em;
  transition: background 0.15s;
}
.modal__btn:hover { background: rgba(255,255,255,0.14); }
.modal__btn--primary {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}
.modal__btn--primary:hover { filter: brightness(1.1); }

/* ── Dashboard settings modal fields ── */
.ds-field {
  display: flex;
  flex-direction: column;
  gap: 0.4em;
}

.ds-label {
  font-size: 0.85em;
  font-weight: 600;
  color: rgba(205,217,229,0.7);
}

.ds-radio-group {
  display: flex;
  gap: 0.5em;
  flex-wrap: wrap;
}

.ds-radio {
  display: inline-flex;
  align-items: center;
  gap: 0.3em;
  font-size: 0.88em;
  color: #cdd9e5;
  cursor: pointer;
  padding: 0.3em 0.7em;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.05);
  transition: background 0.15s, border-color 0.15s;
}
.ds-radio:hover { background: rgba(255,255,255,0.1); }
.ds-radio input[type="radio"] { accent-color: var(--primary); }

.ds-number {
  max-width: 100px;
}

.ds-hint {
  font-size: 0.76em;
  color: rgba(205,217,229,0.4);
  line-height: 1.4;
}
</style>
