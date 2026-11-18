<template lang="pug">
div.aw-shell(:data-theme="theme")
  nav.aw-rail
    tooltip(v-for="item in railItems" :key="item.to" :label="item.label" placement="right")
      router-link.aw-rail-item(:to="item.to" :class="{ 'is-active': $route.path === item.to }")
        icon(:name="item.icon")
  div.aw-shell-main
    header.aw-topbar
      h1.aw-topbar-title
        slot(name="title")
      div.aw-topbar-actions
        slot(name="actions")
    div.aw-shell-content
      slot
</template>

<script lang="ts">
// Local to /dashboard and /design-system only — does not touch Header.vue or
// global app chrome. Resolves theme the same way App.vue does (same store,
// same helper) so it tracks the user's actual setting instead of drifting.
import { useSettingsStore } from '~/stores/settings';
import { detectPreferredTheme } from '~/util/theme';
import Tooltip from './Tooltip.vue';

import '../tokens.css';

import 'vue-awesome/icons/home';
import 'vue-awesome/icons/chart-line';
import 'vue-awesome/icons/code';
import 'vue-awesome/icons/cog';

export default {
  name: 'DashboardShell',
  components: { Tooltip },
  props: {
    // Gallery-only escape hatch to preview both themes side by side without
    // touching the user's real setting. Leave unset in the real dashboard.
    themeOverride: {
      type: String,
      default: '',
      validator: (v: string) => ['', 'light', 'dark'].includes(v),
    },
  },
  data() {
    return {
      resolvedTheme: 'light' as 'light' | 'dark',
      railItems: [
        { to: '/home', icon: 'home', label: 'Home' },
        { to: '/dashboard', icon: 'chart-line', label: 'Focus Insights' },
        { to: '/design-system', icon: 'code', label: 'Design System' },
        { to: '/settings', icon: 'cog', label: 'Settings' },
      ],
    };
  },
  computed: {
    theme(): 'light' | 'dark' {
      return (this.themeOverride as 'light' | 'dark') || this.resolvedTheme;
    },
  },
  async created() {
    const settingsStore = useSettingsStore();
    await settingsStore.ensureLoaded();
    const setting = settingsStore.theme;
    this.resolvedTheme =
      setting === 'auto' ? detectPreferredTheme() : (setting as 'light' | 'dark');
  },
};
</script>

<style scoped>
.aw-shell {
  display: flex;
  min-height: 100vh;
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-sans);
}

.aw-rail {
  width: var(--space-48);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-8);
  padding: var(--space-12) 0;
  background: var(--surface);
  border-right: var(--border-width) solid var(--border);
}

.aw-rail-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-input);
  color: var(--muted-fg);
  transition: background-color var(--transition-fast), color var(--transition-fast);
}

.aw-rail-item:hover {
  background: var(--bg);
  color: var(--fg);
}

.aw-rail-item.is-active {
  background: var(--bg);
  color: var(--accent);
}

.aw-rail-item:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.aw-shell-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.aw-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-24);
  height: var(--space-48);
  flex-shrink: 0;
  border-bottom: var(--border-width) solid var(--border);
}

.aw-topbar-title {
  font-size: var(--font-size-16);
  font-weight: 600;
  margin: 0;
}

.aw-topbar-actions {
  display: flex;
  align-items: center;
  gap: var(--space-8);
}

.aw-shell-content {
  flex: 1;
  padding: var(--space-24);
  overflow-y: auto;
}
</style>
