<template lang="pug">
div.d-flex.flex-wrap.align-items-center
  b-button-group.mr-3.mb-2
    b-button(
      v-for="preset in presets"
      :key="preset.label"
      size="sm"
      :variant="activePreset === preset.label ? 'primary' : 'outline-secondary'"
      @click="selectPreset(preset)"
    ) {{ preset.label }}
    b-button(
      size="sm"
      :variant="activePreset === 'custom' ? 'primary' : 'outline-secondary'"
      @click="activePreset = 'custom'"
    ) Custom

  div.d-flex.align-items-center.mb-2(v-if="activePreset === 'custom'")
    input.form-control.form-control-sm(type="datetime-local" v-model="customStart" style="width: auto")
    span.mx-2 to
    input.form-control.form-control-sm(type="datetime-local" v-model="customEnd" style="width: auto")
    b-button.ml-2(size="sm" variant="primary" :disabled="!customValid" @click="applyCustom") Apply
</template>

<script lang="ts">
import moment from 'moment';

interface Preset {
  label: string;
  hours: number;
}

const PRESETS: Preset[] = [
  { label: '1h', hours: 1 },
  { label: '4h', hours: 4 },
  { label: '12h', hours: 12 },
  { label: '1d', hours: 24 },
  { label: '7d', hours: 24 * 7 },
  { label: '30d', hours: 24 * 30 },
];

export default {
  name: 'RangeSelector',
  props: {
    // v-model: { start: Date, end: Date }
    value: {
      type: Object,
      default: null,
    },
  },
  data() {
    return {
      presets: PRESETS,
      activePreset: '1d',
      customStart: moment().subtract(1, 'day').format('YYYY-MM-DDTHH:mm'),
      customEnd: moment().format('YYYY-MM-DDTHH:mm'),
    };
  },
  computed: {
    customValid(): boolean {
      const start = new Date(this.customStart);
      const end = new Date(this.customEnd);
      return !isNaN(start.valueOf()) && !isNaN(end.valueOf()) && end > start;
    },
  },
  mounted() {
    // Emit the default range so the parent can do its initial load
    this.selectPreset(PRESETS[3]);
  },
  methods: {
    selectPreset(preset: Preset) {
      this.activePreset = preset.label;
      const end = new Date();
      const start = new Date(end.valueOf() - preset.hours * 3600 * 1000);
      this.$emit('input', { start, end });
    },
    applyCustom() {
      if (!this.customValid) return;
      this.$emit('input', {
        start: new Date(this.customStart),
        end: new Date(this.customEnd),
      });
    },
  },
};
</script>
