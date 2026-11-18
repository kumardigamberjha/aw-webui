<template lang="pug">
div
  svg(:viewBox="`0 0 ${width} ${height}`" preserveAspectRatio="xMidYMid meet" style="width: 100%")
    g(v-for="domain in domainNodes" :key="domain.name")
      rect(
        :x="domain.x0" :y="domain.y0"
        :width="domain.x1 - domain.x0" :height="domain.y1 - domain.y0"
        :fill="domain.color" fill-opacity="0.15"
        :stroke="domain.color" stroke-width="1"
      )
      text.domain-label(
        v-if="domain.x1 - domain.x0 > 60"
        :x="domain.x0 + 4" :y="domain.y0 + 13"
      ) {{ domain.name }}
      title {{ domain.name }} — {{ formatDuration(domain.value) }}
    g(v-for="leaf in leafNodes" :key="leaf.id")
      rect(
        :x="leaf.x0" :y="leaf.y0"
        :width="Math.max(0, leaf.x1 - leaf.x0)" :height="Math.max(0, leaf.y1 - leaf.y0)"
        :fill="leaf.color" rx="2"
        stroke="#fff" stroke-width="2"
      )
      text.leaf-label(
        v-if="leaf.x1 - leaf.x0 > 70 && leaf.y1 - leaf.y0 > 16"
        :x="leaf.x0 + 4" :y="leaf.y0 + 13"
        :fill="leaf.textColor"
      ) {{ truncate(leaf.name, (leaf.x1 - leaf.x0) / 7) }}
      title {{ leaf.domain }} — {{ leaf.name }} — {{ formatDuration(leaf.value) }}
</template>

<script lang="ts">
import * as d3 from 'd3';
import { SinkholeNode } from '~/util/metrics';
import { seconds_to_duration } from '~/util/time';
import { SEQUENTIAL_BLUES } from './colors';

export default {
  name: 'SinkholeTreemap',
  props: {
    root: {
      type: Object as () => SinkholeNode,
      required: true,
    },
  },
  data() {
    return {
      width: 900,
      height: 380,
    };
  },
  computed: {
    layoutRoot() {
      const h = d3
        .hierarchy(this.root)
        .sum((d: SinkholeNode) => d.value || 0)
        .sort((a, b) => (b.value || 0) - (a.value || 0));
      d3.treemap().size([this.width, this.height]).paddingInner(2).paddingOuter(3).paddingTop(18)(
        h
      );
      return h;
    },
    // Darker blue = more time (sequential magnitude encoding per domain)
    domainColor() {
      const domains = (this.layoutRoot.children || []).slice();
      const max = Math.max(...domains.map(d => d.value || 0), 1);
      return (value: number) => {
        const t = Math.sqrt(value / max); // sqrt to spread small domains
        const idx = Math.min(
          SEQUENTIAL_BLUES.length - 1,
          Math.max(3, Math.floor(t * (SEQUENTIAL_BLUES.length - 1)))
        );
        return SEQUENTIAL_BLUES[idx];
      };
    },
    domainNodes() {
      return (this.layoutRoot.children || []).map(d => ({
        name: d.data.name,
        value: d.value || 0,
        x0: d.x0,
        y0: d.y0,
        x1: d.x1,
        y1: d.y1,
        color: this.domainColor(d.value || 0),
      }));
    },
    leafNodes() {
      return this.layoutRoot.leaves().map((leaf, i) => {
        const domain = leaf.parent ? leaf.parent.data.name : '';
        const color = this.domainColor(leaf.parent ? leaf.parent.value || 0 : 0);
        // Dark ramp steps need light text
        const dark = SEQUENTIAL_BLUES.indexOf(color) >= 6;
        return {
          id: `${domain}/${leaf.data.name}/${i}`,
          name: leaf.data.name,
          domain,
          value: leaf.value || 0,
          x0: leaf.x0,
          y0: leaf.y0,
          x1: leaf.x1,
          y1: leaf.y1,
          color,
          textColor: dark ? '#fff' : '#0b0b0b',
        };
      });
    },
  },
  methods: {
    formatDuration(seconds: number): string {
      return seconds_to_duration(seconds);
    },
    truncate(s: string, maxChars: number): string {
      return s.length > maxChars ? s.slice(0, Math.max(1, Math.floor(maxChars) - 1)) + '…' : s;
    },
  },
};
</script>

<style scoped>
.domain-label {
  font-size: 11px;
  font-weight: 600;
  fill: #52514e;
}
.leaf-label {
  font-size: 11px;
}
</style>
