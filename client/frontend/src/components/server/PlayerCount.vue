<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { decodeLogs, parseConsoleLine, getCommandTemplate } from '@/utils/consolePlayerParser.js'

const props = defineProps({
  server: { type: Object, required: true }
})

const players    = ref([])
const maxPlayers = ref(0)
const loading    = ref(true)
const open       = ref(false)
const panelEl    = ref(null)

const cmdTpl = computed(() => getCommandTemplate(props.server.type))

function applyEvent(ev) {
  if (!ev) return
  if (ev.type === 'join') {
    if (!players.value.includes(ev.name)) players.value = [...players.value, ev.name]
    loading.value = false
  } else if (ev.type === 'leave') {
    players.value = players.value.filter(p => p !== ev.name)
  } else if (ev.type === 'list') {
    players.value = ev.names
    if (ev.max > 0) maxPlayers.value = ev.max
    loading.value = false
  }
}

function handleConsoleEvent(data) {
  if (!data || !data.logs || !data.logs.length) return
  const text = decodeLogs(data.logs)
  for (const line of text.split('\n')) applyEvent(parseConsoleLine(line, props.server.type))
}

let unbind = null

onMounted(() => {
  unbind = props.server.on('console', handleConsoleEvent)
  const isMc = !props.server.type || props.server.type.startsWith('minecraft')
  if (isMc && props.server.hasScope('server.console.send')) {
    // Only Minecraft supports the 'list' command; we wait for its response
    // to populate initial player count. Other games can't be queried this way.
    props.server.sendCommand('list')
  } else {
    // Non-Minecraft servers: show 0 immediately, update in real-time via console events
    loading.value = false
  }
  document.addEventListener('mousedown', onOutsideClick)
})

onUnmounted(() => {
  if (unbind) unbind()
  document.removeEventListener('mousedown', onOutsideClick)
})

function onOutsideClick(e) {
  if (panelEl.value && !panelEl.value.contains(e.target)) open.value = false
}

function kick(name) {
  if (!cmdTpl.value?.kick) return
  props.server.sendCommand(cmdTpl.value.kick.replace('{name}', name))
  players.value = players.value.filter(p => p !== name)
}

function ban(name) {
  if (!cmdTpl.value?.ban) return
  props.server.sendCommand(cmdTpl.value.ban.replace('{name}', name))
  players.value = players.value.filter(p => p !== name)
}
</script>

<template>
  <div ref="panelEl" class="pc-root">
    <button
      class="pc-btn"
      :class="{ 'pc-btn--active': open }"
      title="Online oyuncular"
      @click="open = !open">
      <span class="pc-icon">&#x1F464;</span>
      <span v-if="loading" class="pc-count pc-count--loading">&middot;&middot;&middot;</span>
      <span v-else class="pc-count">
        {{ players.length }}<span v-if="maxPlayers > 0">/{{ maxPlayers }}</span>
      </span>
    </button>

    <div v-if="open" class="pc-panel">
      <div class="pc-panel__header">
        <span>Online Oyuncular</span>
        <span class="pc-panel__sub">
          {{ players.length }}<span v-if="maxPlayers > 0">/{{ maxPlayers }}</span>
        </span>
      </div>
      <div v-if="loading" class="pc-panel__empty">Yükleniyor&hellip;</div>
      <div v-else-if="players.length === 0" class="pc-panel__empty">Şu an kimse yok</div>
      <ul v-else class="pc-panel__list">
        <li v-for="p in players" :key="p" class="pc-panel__row">
          <span class="pc-panel__name">{{ p }}</span>
          <div class="pc-panel__actions">
            <button v-if="cmdTpl?.kick" class="pc-action pc-action--kick" @click="kick(p)">Kick</button>
            <button v-if="cmdTpl?.ban" class="pc-action pc-action--ban" @click="ban(p)">Ban</button>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.pc-root { position: relative; }

.pc-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3em;
  height: 2em;
  padding: 0 0.55em;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.05);
  color: rgba(205,217,229,0.75);
  font-size: 0.82em;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  user-select: none;
}
.pc-btn:hover, .pc-btn--active {
  background: rgba(255,255,255,0.1);
  color: #cdd9e5;
  border-color: rgba(255,255,255,0.2);
}
.pc-icon { font-size: 0.85em; }
.pc-count { font-variant-numeric: tabular-nums; }
.pc-count--loading { opacity: 0.5; letter-spacing: 0.1em; }

.pc-panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 220px;
  background: #161b22;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px;
  padding: 0.5em 0;
  z-index: 200;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  animation: pc-in 0.12s ease;
}
@keyframes pc-in {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}

.pc-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.35em 0.85em 0.5em;
  font-size: 0.8em;
  font-weight: 600;
  color: rgba(205,217,229,0.5);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  margin-bottom: 0.25em;
}
.pc-panel__sub { font-weight: 400; color: rgba(205,217,229,0.35); }

.pc-panel__empty {
  padding: 0.6em 0.85em;
  font-size: 0.85em;
  color: rgba(205,217,229,0.4);
  text-align: center;
}

.pc-panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 240px;
  overflow-y: auto;
}

.pc-panel__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.3em 0.6em 0.3em 0.85em;
  gap: 0.5em;
  transition: background 0.1s;
}
.pc-panel__row:hover { background: rgba(255,255,255,0.04); }

.pc-panel__name {
  font-size: 0.88em;
  color: #cdd9e5;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pc-panel__actions { display: flex; gap: 0.3em; flex-shrink: 0; }

.pc-action {
  padding: 0.15em 0.55em;
  border-radius: 5px;
  border: 1px solid transparent;
  font-size: 0.75em;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.pc-action--kick {
  background: rgba(234,179,8,0.12);
  border-color: rgba(234,179,8,0.25);
  color: #fbbf24;
}
.pc-action--kick:hover { background: rgba(234,179,8,0.25); color: #fde68a; }
.pc-action--ban {
  background: rgba(239,68,68,0.12);
  border-color: rgba(239,68,68,0.25);
  color: #f87171;
}
.pc-action--ban:hover { background: rgba(239,68,68,0.25); color: #fca5a5; }
</style>
