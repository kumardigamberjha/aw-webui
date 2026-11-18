<template lang="pug">
span.aw-badge(:class="`is-${variant}`")
  slot
</template>

<script lang="ts">
export default {
  name: 'Badge',
  props: {
    variant: {
      type: String,
      default: 'neutral',
      validator: (v: string) =>
        ['focus', 'operational', 'distraction', 'idle', 'neutral'].includes(v),
    },
  },
};
</script>

<style scoped>
.aw-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-4);
  padding: 2px var(--space-8);
  border-radius: var(--radius-pill);
  font-size: var(--font-size-12);
  font-weight: 500;
  line-height: 1.4;
}

.aw-badge::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.aw-badge.is-focus {
  color: var(--state-focus);
  background: color-mix(in srgb, var(--state-focus) 14%, transparent);
}

.aw-badge.is-operational {
  color: var(--state-operational);
  background: color-mix(in srgb, var(--state-operational) 14%, transparent);
}

.aw-badge.is-distraction {
  color: var(--state-distraction);
  background: color-mix(in srgb, var(--state-distraction) 14%, transparent);
}

.aw-badge.is-idle {
  color: var(--state-idle);
  background: color-mix(in srgb, var(--state-idle) 20%, transparent);
}

.aw-badge.is-neutral {
  color: var(--muted-fg);
  background: color-mix(in srgb, var(--muted-fg) 14%, transparent);
}
</style>
