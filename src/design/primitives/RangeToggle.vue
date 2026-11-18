<template lang="pug">
div.aw-range-toggle(role="radiogroup" :aria-label="ariaLabel")
  button.aw-range-option(
    v-for="(opt, i) in options"
    :key="opt.value"
    :ref="`opt-${i}`"
    type="button"
    role="radio"
    :aria-checked="opt.value === value"
    :tabindex="opt.value === value ? 0 : -1"
    :class="{ 'is-active': opt.value === value }"
    @click="select(opt.value)"
    @keydown="onKeydown($event, i)"
  ) {{ opt.label }}
</template>

<script lang="ts">
// Segmented control. Arrow Left/Right move + select the adjacent option
// (roving tabindex), matching native radiogroup keyboard behavior.
export default {
  name: 'RangeToggle',
  props: {
    value: { type: String, required: true },
    options: {
      type: Array as () => { value: string; label: string }[],
      required: true,
    },
    ariaLabel: { type: String, default: 'Time range' },
  },
  methods: {
    select(value: string) {
      this.$emit('input', value);
    },
    onKeydown(event: KeyboardEvent, index: number) {
      let nextIndex: number | null = null;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        nextIndex = (index + 1) % this.options.length;
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        nextIndex = (index - 1 + this.options.length) % this.options.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = this.options.length - 1;
      } else {
        return;
      }
      event.preventDefault();
      const next = this.options[nextIndex];
      this.select(next.value);
      const refs = this.$refs[`opt-${nextIndex}`] as HTMLButtonElement[] | undefined;
      refs?.[0]?.focus();
    },
  },
};
</script>

<style scoped>
.aw-range-toggle {
  display: inline-flex;
  background: var(--bg);
  border: var(--border-width) solid var(--border);
  border-radius: var(--radius-input);
  padding: 2px;
  gap: 2px;
}

.aw-range-option {
  font-family: var(--font-sans);
  font-size: var(--font-size-12);
  font-weight: 500;
  color: var(--muted-fg);
  background: transparent;
  border: none;
  border-radius: calc(var(--radius-input) - 2px);
  padding: var(--space-4) var(--space-12);
  cursor: pointer;
  transition: background-color var(--transition-fast), color var(--transition-fast);
}

.aw-range-option:hover {
  color: var(--fg);
}

.aw-range-option.is-active {
  background: var(--surface);
  color: var(--fg);
  box-shadow: var(--shadow-1);
}

.aw-range-option:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
</style>
