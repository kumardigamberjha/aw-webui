<template lang="pug">
button.aw-btn(:class="`is-${variant}`" :disabled="disabled" type="button" @click="$emit('click', $event)")
  slot
</template>

<script lang="ts">
export default {
  name: 'Button',
  props: {
    variant: {
      type: String,
      default: 'secondary',
      validator: (v: string) => ['primary', 'secondary', 'ghost'].includes(v),
    },
    disabled: { type: Boolean, default: false },
  },
};
</script>

<style scoped>
.aw-btn {
  font-family: var(--font-sans);
  font-size: var(--font-size-13);
  font-weight: 500;
  padding: var(--space-8) var(--space-12);
  border-radius: var(--radius-input);
  border: var(--border-width) solid transparent;
  cursor: pointer;
  transition: background-color var(--transition-fast), border-color var(--transition-fast);
}

.aw-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.aw-btn:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.aw-btn.is-primary {
  background: var(--accent);
  color: var(--accent-fg);
}

.aw-btn.is-primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 88%, black);
}

.aw-btn.is-secondary {
  background: var(--surface);
  border-color: var(--border);
  color: var(--fg);
}

.aw-btn.is-secondary:hover:not(:disabled) {
  background: var(--bg);
}

.aw-btn.is-ghost {
  background: transparent;
  color: var(--muted-fg);
}

.aw-btn.is-ghost:hover:not(:disabled) {
  background: var(--bg);
  color: var(--fg);
}
</style>
