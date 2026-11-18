<template lang="pug">
div.aw-card(:style="style")
  div.aw-card-header(v-if="title || $slots.actions")
    h2.aw-card-title(v-if="title") {{ title }}
    div.aw-card-actions(v-if="$slots.actions")
      slot(name="actions")
  div.aw-card-body
    slot
</template>

<script lang="ts">
export default {
  name: 'Card',
  props: {
    title: { type: String, default: '' },
    padding: { type: String, default: '16px' },
  },
  computed: {
    style() {
      return { '--card-padding': this.padding };
    },
  },
};
</script>

<style scoped>
.aw-card {
  background: var(--surface);
  border: var(--border-width) solid var(--border);
  border-radius: var(--radius-card);
  color: var(--fg);
}

.aw-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--card-padding) var(--card-padding) 0;
}

.aw-card-title {
  font-size: var(--font-size-13);
  font-weight: 600;
  color: var(--muted-fg);
  margin: 0 0 var(--space-12) 0;
}

.aw-card-body {
  padding: var(--card-padding);
}

.aw-card-header + .aw-card-body {
  padding-top: 0;
}
</style>
