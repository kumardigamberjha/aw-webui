<template lang="pug">
span.aw-tooltip-wrap(:class="`is-${placement}`")
  slot
  span.aw-tooltip-bubble(role="tooltip") {{ label }}
</template>

<script lang="ts">
// CSS-only hover/focus tooltip — no positioning library. Meant for short
// labels on small fixed-position triggers (e.g. the icon rail), where a
// simple offset in one direction is enough and JS-computed placement would
// be overkill.
export default {
  name: 'Tooltip',
  props: {
    label: { type: String, required: true },
    placement: {
      type: String,
      default: 'right',
      validator: (v: string) => ['right', 'top', 'bottom'].includes(v),
    },
  },
};
</script>

<style scoped>
.aw-tooltip-wrap {
  position: relative;
  display: inline-flex;
}

.aw-tooltip-bubble {
  position: absolute;
  z-index: 20;
  background: var(--fg);
  color: var(--bg);
  font-family: var(--font-sans);
  font-size: var(--font-size-12);
  font-weight: 500;
  white-space: nowrap;
  padding: var(--space-4) var(--space-8);
  border-radius: var(--radius-input);
  pointer-events: none;
  opacity: 0;
  transform: translateY(2px);
  transition: opacity var(--transition-fast), transform var(--transition-fast);
}

.aw-tooltip-wrap:hover .aw-tooltip-bubble,
.aw-tooltip-wrap:focus-within .aw-tooltip-bubble {
  opacity: 1;
  transform: translateY(0);
}

.is-right .aw-tooltip-bubble {
  left: calc(100% + var(--space-8));
  top: 50%;
  transform: translateY(-50%) translateX(-2px);
}

.is-right:hover .aw-tooltip-bubble,
.is-right:focus-within .aw-tooltip-bubble {
  transform: translateY(-50%) translateX(0);
}

.is-top .aw-tooltip-bubble {
  bottom: calc(100% + var(--space-8));
  left: 50%;
  transform: translateX(-50%) translateY(2px);
}

.is-top:hover .aw-tooltip-bubble,
.is-top:focus-within .aw-tooltip-bubble {
  transform: translateX(-50%) translateY(0);
}

.is-bottom .aw-tooltip-bubble {
  top: calc(100% + var(--space-8));
  left: 50%;
  transform: translateX(-50%) translateY(-2px);
}

.is-bottom:hover .aw-tooltip-bubble,
.is-bottom:focus-within .aw-tooltip-bubble {
  transform: translateX(-50%) translateY(0);
}
</style>
