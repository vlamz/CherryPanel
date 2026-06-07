<script setup>
import { ref, inject } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { List, ListItem, ListItemContent, ListItemIcon } from '@/components/ui/list'

const props = defineProps({
  right: { type: Boolean, default: () => false },
  closed: { type: Boolean, default: () => false }
})

const api = inject('api')
const events = inject('events')
const { t } = useI18n()
const router = useRouter()

// Get scopes directly without relying on isLoggedIn()
// (ServerCookieSessionStore uses httpOnly token so isLoggedIn() may be false
// even when authenticated via server-side session cookie)
const userScopes = api.auth.getScopes()
const isAdmin = userScopes.includes('admin')

function canSeeRoute(permission) {
  if (permission === true) return true
  if (!permission) return false
  return isAdmin || userScopes.includes(permission)
}

const allRoutes = router.getRoutes().filter(e => e.meta.permission && canSeeRoute(e.meta.permission))

// Split into "general" (permission: true) and "admin" (specific scope) groups
const generalRoutes = allRoutes.filter(e => e.meta.permission === true)
const adminRoutes = allRoutes.filter(e => e.meta.permission !== true)

const mini = ref(localStorage.getItem('sidebar.mini') === 'true')

async function logout() {
  await api.auth.logout()
  router.push({ name: 'Login' })
  events.emit('logout')
}

function toggleMini() {
  mini.value = !mini.value
  localStorage.setItem('sidebar.mini', mini.value ? 'true' : 'false')
}
</script>

<template>
  <nav :class="['sidebar', props.right ? 'right' : 'left', mini ? 'mini' : '', closed ? 'closed' : 'open']">
    <div tabindex="-1" class="sidebar-content-top">
      <list>
        <li v-if="generalRoutes.length" class="sidebar-section-label">
          <span>{{ mini ? '' : t('common.navigation.Main') }}</span>
        </li>
        <list-item
          v-for="route in generalRoutes"
          :key="route.name"
          v-hotkey="route.meta.hotkey"
          :to="route"
        >
          <list-item-icon v-if="route.meta.icon" :icon="route.meta.icon" />
          <list-item-content v-text="t(route.meta.tkey ? route.meta.tkey : 'common.navigation.' + route.name)" />
        </list-item>

        <template v-if="adminRoutes.length">
          <li class="sidebar-section-label sidebar-section-divider">
            <span>{{ mini ? '' : t('common.navigation.Admin') }}</span>
          </li>
          <list-item
            v-for="route in adminRoutes"
            :key="route.name"
            v-hotkey="route.meta.hotkey"
            :to="route"
          >
            <list-item-icon v-if="route.meta.icon" :icon="route.meta.icon" />
            <list-item-content v-text="t(route.meta.tkey ? route.meta.tkey : 'common.navigation.' + route.name)" />
          </list-item>
        </template>
      </list>
    </div>
    <div tabindex="-1" class="sidebar-content-bottom">
      <list>
        <list-item tabindex="0" class="collapse-toggle" @click="toggleMini()">
          <list-item-icon :icon="mini ? 'chevron-right' : 'chevron-left'" />
          <list-item-content v-text="t('common.' + (mini ? 'Expand' : 'Collapse'))" />
        </list-item>
        <list-item tabindex="0" @click="logout()">
          <list-item-icon icon="logout" />
          <list-item-content v-text="t('users.Logout')" />
        </list-item>
      </list>
    </div>
  </nav>
</template>
