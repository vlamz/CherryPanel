<script setup>
import { ref, inject, onMounted, onUnmounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/components/ui/Icon.vue'
import TextField from '@/components/ui/TextField.vue'
import PlayerCount from '@/components/server/PlayerCount.vue'

import ConsoleWorker from '@/utils/consoleWorker.js?worker&inline'
const worker = new ConsoleWorker()
let lastElem = null

const { t } = useI18n()
const config = inject('config')
const panelName = config.branding.name

const command = ref('')
const consoleEl = ref(null)
let lastMessageTime = 0

const props = defineProps({
  server: { type: Object, required: true }
})

// ── Font size & bold ──────────────────────────────────────────
const MIN_SIZE = 10
const MAX_SIZE = 20
const fontSize = ref(parseInt(localStorage.getItem('console.fontSize') || '13'))
const boldMode = ref(localStorage.getItem('console.bold') === 'true')

function increaseFontSize() {
  if (fontSize.value < MAX_SIZE) {
    fontSize.value++
    localStorage.setItem('console.fontSize', fontSize.value)
  }
}
function decreaseFontSize() {
  if (fontSize.value > MIN_SIZE) {
    fontSize.value--
    localStorage.setItem('console.fontSize', fontSize.value)
  }
}
function toggleBold() {
  boldMode.value = !boldMode.value
  localStorage.setItem('console.bold', boldMode.value)
}

const consoleStyle = computed(() => ({
  fontSize: fontSize.value + 'px',
}))

// ── Link confirmation ─────────────────────────────────────────
const pendingLink = ref(null)

function onConsoleClick(e) {
  const target = e.target.closest('.console-link')
  if (!target) return
  e.preventDefault()
  pendingLink.value = target.dataset.href
}

function openLink() {
  if (pendingLink.value) {
    window.open(pendingLink.value, '_blank', 'noopener,noreferrer')
  }
  pendingLink.value = null
}

// ── Console logic ─────────────────────────────────────────────
let unbindEvent = null
let task = null
onMounted(async () => {
  worker.addEventListener('message', onWorkerMessage)
  unbindEvent = props.server.on('console', onMessage)
  onMessage(await props.server.getConsole())
  task = props.server.startTask(async () => {
    if (props.server.needsPolling() && props.server.hasScope('server.console')) {
      onMessage(await props.server.getConsole(lastMessageTime))
    }
  }, 5000)
})

onUnmounted(() => {
  if (unbindEvent) unbindEvent()
  if (task) props.server.stopTask(task)
  clearConsole()
})

function onMessage(e) {
  if ('epoch' in e) {
    lastMessageTime = e.epoch
  } else {
    lastMessageTime = Date.now()
  }
  worker.postMessage({ ...e, panelName })
}

function onWorkerMessage(e) {
  const newElems = []
  e.data.map(update => {
    if (update.op === 'update' && lastElem) {
      lastElem.innerHTML = update.content
    } else {
      const el = document.createElement('div')
      el.innerHTML = update.content
      newElems.push(el)
      lastElem = el
    }
  })
  if (newElems + consoleEl.value.children.length > 1200) {
    let elems = consoleEl.value.children.concat(newElems)
    elems = elems.slice(elems.length - 1000, elems.length)
    consoleEl.value.replaceChildren(elems)
  } else {
    consoleEl.value.append(...newElems)
  }
}

function clearConsole() {
  if (consoleEl.value) consoleEl.value.replaceChildren([])
}

// ── Command history ───────────────────────────────────────────
const history = ref([])
const historyIndex = ref(-1)
const temporaryCommand = ref('')

function sendCommand() {
  if (historyIndex.value !== -1) history.value.splice(historyIndex.value, 1)
  if (history.value.length === 0 || history.value[history.value.length - 1] !== command.value)
    history.value.push(command.value)
  historyIndex.value = -1
  temporaryCommand.value = ''
  if (history.value.length > 100) history.value.splice(0, 1)
  props.server.sendCommand(command.value)
  command.value = ''
}

function previousCommand() {
  if (historyIndex.value === -1 && history.value.length > 0) {
    historyIndex.value = history.value.length - 1
    temporaryCommand.value = command.value
  } else if (historyIndex.value > 0) {
    historyIndex.value--
  } else return
  command.value = history.value[historyIndex.value]
}

function nextCommand() {
  if (historyIndex.value === -1) return
  historyIndex.value++
  if (historyIndex.value >= history.value.length) {
    historyIndex.value = -1
    command.value = temporaryCommand.value
  } else {
    command.value = history.value[historyIndex.value]
  }
}
</script>

<template>
  <div>
    <div class="console-topbar">
      <h2 v-text="t('servers.Console')" />

      <div class="console-controls">
        <!-- Font size -->
        <button
          class="cc-btn"
          :disabled="fontSize <= 10"
          title="Yazıyı küçült"
          @click="decreaseFontSize">
          A<sup>-</sup>
        </button>
        <span class="cc-size">{{ fontSize }}px</span>
        <button
          class="cc-btn"
          :disabled="fontSize >= 20"
          title="Yazıyı büyüt"
          @click="increaseFontSize">
          A<sup>+</sup>
        </button>

        <!-- Divider -->
        <span class="cc-divider" />

        <!-- Bold toggle -->
        <button
          :class="['cc-btn', 'cc-btn--bold', boldMode ? 'cc-btn--active' : '']"
          title="Kalın yazı modu"
          @click="toggleBold">
          <b>B</b>
        </button>

        <!-- Clear -->
        <button
          v-if="server.hasScope('server.console')"
          v-hotkey="'c x'"
          class="cc-btn cc-btn--clear"
          title="Konsolu temizle"
          @click="clearConsole()">
          <icon name="clear-console" />
        </button>

        <!-- Player count + management -->
        <span class="cc-divider" />
        <player-count :server="server" />
      </div>
    </div>

    <div
      v-if="server.hasScope('server.console')"
      dir="ltr"
      :class="['console-wrapper', boldMode && 'console--bold']"
      :style="consoleStyle"
      @click="onConsoleClick">
      <div ref="consoleEl" class="console" />
    </div>

    <div v-if="server.hasScope('server.console.send')" dir="ltr" class="command">
      <text-field
        v-model="command"
        v-hotkey="'c c'"
        :label="t('servers.Command')"
        @keyup.enter="sendCommand()"
        @keydown.up.prevent="previousCommand()"
        @keydown.down.prevent="nextCommand()"
      />
      <icon name="send" @click="sendCommand()" />
    </div>

    <!-- Link confirmation modal -->
    <Teleport to="body">
      <div v-if="pendingLink" class="link-confirm-bg" @click.self="pendingLink = null">
        <div class="link-confirm">
          <div class="link-confirm__icon">🔗</div>
          <div class="link-confirm__title">Harici Bağlantı</div>
          <div class="link-confirm__body">
            Bu bağlantıyı tarayıcıda açmak istediğinden emin misin?
          </div>
          <div class="link-confirm__url">{{ pendingLink }}</div>
          <div class="link-confirm__actions">
            <button class="link-confirm__btn" @click="pendingLink = null">
              İptal
            </button>
            <button class="link-confirm__btn link-confirm__btn--yes" @click="openLink">
              Güveniyorum, Aç
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* ── Topbar ── */
.console-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1em;
  margin-bottom: 0.4em;
  flex-wrap: wrap;
}
.console-topbar h2 { margin: 0; }

/* ── Controls ── */
.console-controls {
  display: flex;
  align-items: center;
  gap: 0.35em;
}

.cc-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2em;
  height: 2em;
  padding: 0 0.45em;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.05);
  color: rgba(205,217,229,0.7);
  font-size: 0.82em;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  line-height: 1;
  user-select: none;
}
.cc-btn:hover:not(:disabled) {
  background: rgba(255,255,255,0.1);
  color: #cdd9e5;
  border-color: rgba(255,255,255,0.2);
}
.cc-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.cc-btn--active {
  background: rgba(99,102,241,0.25);
  border-color: rgba(99,102,241,0.5);
  color: #a5b4fc;
}
.cc-btn--bold b { font-size: 1.1em; }

.cc-size {
  font-size: 0.75em;
  opacity: 0.45;
  min-width: 3em;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.cc-divider {
  width: 1px;
  height: 1.4em;
  background: rgba(255,255,255,0.1);
  margin: 0 0.15em;
}

.cc-btn--clear {
  color: rgba(205,217,229,0.5);
  font-size: 1.1em;
  line-height: 1;
}
.cc-btn--clear:hover { color: #f87171; }

/* ── Link modal ── */
.link-confirm-bg {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  backdrop-filter: blur(6px);
}

.link-confirm {
  background: #161b22;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 14px;
  padding: 1.8em 2em;
  max-width: 440px;
  width: 90%;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75em;
  animation: modal-in 0.18s ease;
}

@keyframes modal-in {
  from { transform: scale(0.93); opacity: 0; }
  to   { transform: scale(1);    opacity: 1; }
}

.link-confirm__icon { font-size: 2.2em; line-height: 1; }

.link-confirm__title {
  font-size: 1.05em;
  font-weight: 600;
  color: #cdd9e5;
}

.link-confirm__body {
  font-size: 0.88em;
  color: rgba(205,217,229,0.6);
  text-align: center;
}

.link-confirm__url {
  background: rgba(13,17,23,0.8);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px;
  padding: 0.5em 0.75em;
  font-family: var(--monospace-font);
  font-size: 0.78em;
  color: #60a5fa;
  word-break: break-all;
  width: 100%;
  box-sizing: border-box;
  text-align: center;
}

.link-confirm__actions {
  display: flex;
  gap: 0.6em;
  margin-top: 0.3em;
}

.link-confirm__btn {
  padding: 0.5em 1.2em;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.06);
  color: #cdd9e5;
  font-size: 0.88em;
  cursor: pointer;
  transition: background 0.15s;
}
.link-confirm__btn:hover { background: rgba(255,255,255,0.12); }

.link-confirm__btn--yes {
  background: rgba(99,102,241,0.2);
  border-color: rgba(99,102,241,0.5);
  color: #a5b4fc;
}
.link-confirm__btn--yes:hover {
  background: rgba(99,102,241,0.35);
  color: #c7d2fe;
}
</style>
