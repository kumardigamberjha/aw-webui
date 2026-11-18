<template lang="pug">
div.aw-stat
  div.aw-stat-label {{ label }}
  div.aw-stat-value.tnum
    | {{ value }}
    span.aw-stat-unit(v-if="unit") {{ unit }}
  div.aw-stat-delta(v-if="delta" :class="deltaClass")
    span.aw-stat-arrow(v-if="deltaDirection !== 'flat'") {{ deltaDirection === 'up' ? '↑' : '↓' }}
    span.tnum {{ delta }}
</template>

<script lang="ts">
// Encodes the "delta color only when semantically good/bad" rule at the
// primitive level: callers pass what happened (direction) and what it means
// (semantic) separately, so a naive "up = green" mistake can't slip through.
export default {
  name: 'Stat',
  props: {
    label: { type: String, required: true },
    value: { type: [String, Number], required: true },
    unit: { type: String, default: '' },
    delta: { type: String, default: '' },
    deltaDirection: {
      type: String,
      default: 'flat',
      validator: (v: string) => ['up', 'down', 'flat'].includes(v),
    },
    deltaSemantic: {
      type: String,
      default: 'neutral',
      validator: (v: string) => ['good', 'bad', 'neutral'].includes(v),
    },
  },
  computed: {
    deltaClass() {
      return `is-${this.deltaSemantic}`;
    },
  },
};
</script>

<style scoped>
.aw-stat-label {
  font-size: var(--font-size-11);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted-fg);
  margin-bottom: var(--space-8);
}

.aw-stat-value {
  font-size: var(--font-size-36);
  font-weight: 600;
  line-height: 1.1;
  color: var(--fg);
}

.aw-stat-unit {
  font-size: var(--font-size-16);
  font-weight: 500;
  color: var(--muted-fg);
  margin-left: var(--space-4);
}

.aw-stat-delta {
  font-size: var(--font-size-12);
  margin-top: var(--space-8);
  color: var(--delta-neutral);
}

.aw-stat-delta.is-good {
  color: var(--delta-good);
}

.aw-stat-delta.is-bad {
  color: var(--delta-bad);
}

.aw-stat-arrow {
  margin-right: var(--space-4);
}
</style>
