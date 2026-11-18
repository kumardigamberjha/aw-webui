<template lang="pug">
div.aw-select-wrap
  select.aw-select(:value="value" @change="$emit('input', $event.target.value)")
    option(v-for="opt in options" :key="opt.value" :value="opt.value") {{ opt.label }}
</template>

<script lang="ts">
export default {
  name: 'Select',
  props: {
    value: { type: String, default: '' },
    options: {
      type: Array as () => { value: string; label: string }[],
      required: true,
    },
  },
};
</script>

<style scoped>
.aw-select-wrap {
  position: relative;
  display: inline-block;
}

.aw-select {
  font-family: var(--font-sans);
  font-size: var(--font-size-13);
  color: var(--fg);
  background: var(--surface);
  border: var(--border-width) solid var(--border);
  border-radius: var(--radius-input);
  padding: var(--space-8) var(--space-24) var(--space-8) var(--space-12);
  appearance: none;
  cursor: pointer;
  background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3e%3cpath fill='none' stroke='%2371717a' stroke-width='1.5' d='M2.5 4.5L6 8l3.5-3.5'/%3e%3c/svg%3e");
  background-repeat: no-repeat;
  background-position: right var(--space-8) center;
}

.aw-select:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
</style>
