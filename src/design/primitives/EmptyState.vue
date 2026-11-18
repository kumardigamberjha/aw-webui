<template lang="pug">
div.aw-empty
  div.aw-empty-icon(v-if="$slots.icon")
    slot(name="icon")
  div.aw-empty-title {{ title }}
  div.aw-empty-description(v-if="description") {{ description }}
</template>

<script lang="ts">
export default {
  name: 'EmptyState',
  props: {
    title: { type: String, required: true },
    description: { type: String, default: '' },
  },
};
</script>

<style scoped>
.aw-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: var(--space-32) var(--space-16);
  color: var(--muted-fg);
}

.aw-empty-icon {
  color: var(--border-strong);
  margin-bottom: var(--space-12);
}

.aw-empty-title {
  font-size: var(--font-size-13);
  font-weight: 600;
  color: var(--fg);
}

.aw-empty-description {
  font-size: var(--font-size-12);
  margin-top: var(--space-4);
  max-width: 32ch;
}
</style>
