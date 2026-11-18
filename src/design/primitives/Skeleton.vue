<template lang="pug">
div.aw-skeleton(:class="`is-${variant}`" :style="style")
</template>

<script lang="ts">
// Explicit width/height so Phase-3 skeletons can be sized to match the exact
// final layout dimensions of the card/chart/row they stand in for — the
// point is zero layout shift when real content arrives, not a generic shimmer.
export default {
  name: 'Skeleton',
  props: {
    variant: {
      type: String,
      default: 'text',
      validator: (v: string) => ['text', 'card', 'chart', 'table-row'].includes(v),
    },
    width: { type: String, default: '' },
    height: { type: String, default: '' },
  },
  computed: {
    style() {
      const style: Record<string, string> = {};
      if (this.width) style.width = this.width;
      if (this.height) style.height = this.height;
      return style;
    },
  },
};
</script>

<style scoped>
/* Static block, not a shimmer sweep — the hard rule bans animated gradients
   and motion beyond hover/draw-in, so loading state is conveyed by shape
   and muted tone alone. */
.aw-skeleton {
  background: var(--border);
  border-radius: var(--radius-input);
}

.aw-skeleton.is-text {
  width: 100%;
  height: 1em;
}

.aw-skeleton.is-card {
  width: 100%;
  height: 96px;
  border-radius: var(--radius-card);
}

.aw-skeleton.is-chart {
  width: 100%;
  height: 240px;
  border-radius: var(--radius-card);
}

.aw-skeleton.is-table-row {
  width: 100%;
  height: 32px;
}
</style>
