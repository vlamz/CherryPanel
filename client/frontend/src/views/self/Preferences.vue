<script setup>
import { ref, inject, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { updateLocale, locales } from '@/plugins/i18n'
import Btn from '@/components/ui/Btn.vue'
import Dropdown from '@/components/ui/Dropdown.vue'
import Icon from '@/components/ui/Icon.vue'
import Loader from '@/components/ui/Loader.vue'
import ThemeSetting from '@/components/ui/ThemeSetting.vue'

const { t, locale } = useI18n()
const toast = inject('toast')
const themeApi = inject('theme')

const loading = ref(false)
const theme = ref(themeApi.getActiveTheme())
const themeSettings = ref({})
const selectedLocale = ref(locale.value)

const PRESETS = [
  {
    id: 'light-classic',
    label: 'Classic',
    colors: ['#eee', '#fff', '#07a7e3'],
    settings: { mode: 'mode-light', color: '#07a7e3', surfaceOverride: '' }
  },
  {
    id: 'dark-standard',
    label: 'Dark',
    colors: ['#292929', '#333', '#07a7e3'],
    settings: { mode: 'mode-dark', color: '#07a7e3', surfaceOverride: '' }
  },
  {
    id: 'dark-modern',
    label: 'Dark Modern',
    colors: ['#0d0d17', '#17172a', '#6366f1'],
    settings: {
      mode: 'mode-dark',
      color: '#6366f1',
      surfaceOverride: '#app{--backdrop:#0d0d17;--background:#17172a;--border-radius:12px}'
    }
  }
]

const activePreset = ref(null)

function detectActivePreset() {
  const current = themeSettings.value
  for (const p of PRESETS) {
    if (
      current.mode?.current === p.settings.mode &&
      current.color?.current === p.settings.color &&
      (current.surfaceOverride?.current ?? '') === p.settings.surfaceOverride
    ) {
      activePreset.value = p.id
      return
    }
  }
  activePreset.value = null
}

onMounted(async () => {
  loading.value = true
  themeSettings.value = await themeApi.getThemeSettings()
  detectActivePreset()
  loading.value = false
})

async function themeChanged() {
  themeSettings.value = await themeApi.getThemeSettings(theme.value)
  detectActivePreset()
}

function applyPreset(preset) {
  activePreset.value = preset.id
  Object.keys(preset.settings).forEach(key => {
    if (themeSettings.value[key]) {
      themeSettings.value[key] = { ...themeSettings.value[key], current: preset.settings[key] }
    }
  })
  const settings = {}
  Object.keys(themeSettings.value).map(key => {
    settings[key] = themeSettings.value[key].current
  })
  themeApi.setTheme(theme.value, settings)
  toast.success(t('users.PreferencesUpdated'))
}

function savePreferences() {
  if (locale.value !== selectedLocale.value) {
    updateLocale(selectedLocale.value)
  }

  const settings = {}
  Object.keys(themeSettings.value).map(key => {
    settings[key] = themeSettings.value[key].current
  })

  themeApi.setTheme(theme.value, settings)
  detectActivePreset()
  toast.success(t('users.PreferencesUpdated'))
}

function updateThemeSetting(name, newSetting) {
  themeSettings.value[name] = newSetting
  detectActivePreset()
}
</script>

<template>
  <div v-if="loading" class="preferences loading"><loader /></div>
  <div v-else class="preferences">
    <h1 v-text="t('users.Preferences')" />

    <div class="preset-section">
      <div class="preset-section__label">Hızlı Temalar</div>
      <div class="preset-grid">
        <button
          v-for="preset in PRESETS"
          :key="preset.id"
          class="preset-card"
          :class="{ 'preset-card--active': activePreset === preset.id }"
          @click="applyPreset(preset)"
        >
          <div class="preset-card__swatches">
            <span v-for="c in preset.colors" :key="c" class="preset-swatch" :style="{ background: c }" />
          </div>
          <span class="preset-card__label">{{ preset.label }}</span>
          <icon v-if="activePreset === preset.id" name="check" class="preset-card__check" />
        </button>
      </div>
    </div>

    <dropdown v-model="selectedLocale" class="locale-select" :options="locales" :label="t('common.Language')" :hint="`[${t('common.HelpTranslate')}](https://translate.pufferpanel.com)`">
      <template #singlelabel="{ value }">
        <div class="multiselect-single-label">
          <span :data-locale="value.value" /> {{ value.label }}
        </div>
      </template>

      <template #option="{ option }">
        <span :data-locale="option.value" /> {{ option.label }}
      </template>
    </dropdown>
    <dropdown v-model="theme" :options="$theme.getThemes()" :label="t('common.theme.Theme')" @change="themeChanged()" />
    <theme-setting v-for="(setting, name) in themeSettings" :key="name" :model-value="setting" @update:modelValue="updateThemeSetting(name, $event)" />
    <btn color="primary" @click="savePreferences()"><icon name="save" />{{ t('users.SavePreferences') }}</btn>
  </div>
</template>

<style scoped>
.preset-section {
  margin-bottom: 1.2em;
}

.preset-section__label {
  font-size: 0.85em;
  font-weight: 600;
  opacity: 0.6;
  margin-bottom: 0.5em;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.preset-grid {
  display: flex;
  gap: 0.8em;
  flex-wrap: wrap;
}

.preset-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4em;
  padding: 0.7em 1em;
  background: var(--background);
  border: 2px solid var(--text-disabled);
  border-radius: var(--border-radius);
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
  position: relative;
  min-width: 90px;
}

.preset-card:hover {
  border-color: var(--primary);
}

.preset-card--active {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 30%, transparent);
}

.preset-card__swatches {
  display: flex;
  gap: 3px;
}

.preset-swatch {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1px solid rgba(0,0,0,0.1);
}

.preset-card__label {
  font-size: 0.78em;
  white-space: nowrap;
}

.preset-card__check {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 0.75em;
  color: var(--primary);
}
</style>
