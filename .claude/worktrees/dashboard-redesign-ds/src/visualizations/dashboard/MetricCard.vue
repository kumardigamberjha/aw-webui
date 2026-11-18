<template lang="pug">
div.card.h-100
  div.card-body.py-2.px-3
    div.metric-label.text-muted {{ label }}
    div.metric-value {{ value }}
    div.metric-sub.text-muted(v-if="sublabel") {{ sublabel }}
</template>

<script lang="ts">
export default {
  name: 'MetricCard',
  props: {
    label: { type: String, required: true },
    value: { type: [String, Number], required: true },
    sublabel: { type: String, default: '' },
  },
};
</script>

<style scoped lang="scss">
.metric-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.metric-value {
  font-size: 1.4rem;
  font-weight: 600;
  line-height: 1.2;
}
.metric-sub {
  font-size: 0.75rem;
}
</style>
