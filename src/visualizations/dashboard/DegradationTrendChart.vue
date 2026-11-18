<template lang="pug">
//- Two aligned panels sharing the hour axis instead of a dual-axis chart:
//- the two measures (count vs. duration) have incomparable scales.
div
  div.small.font-weight-bold.text-muted.mb-1 Context switches per hour
  line-chart(:chart-data="switchesData" :chart-options="switchesOptions" :height="130")
  div.small.font-weight-bold.text-muted.mb-1.mt-3 Average attention span (minutes)
  line-chart(:chart-data="spanData" :chart-options="spanOptions" :height="130")
</template>

<script lang="ts">
import { ChartOptions } from 'chart.js';
import 'chart.js/auto';
import { Line as LineChart } from 'vue-chartjs/legacy';
import { DegradationPoint } from '~/util/metrics';
import { CLASS_COLORS } from './colors';

function baseOptions(yTitle: string): ChartOptions {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { mode: 'index', intersect: false },
    },
    scales: {
      x: { grid: { display: false }, title: { display: false } },
      y: { min: 0, title: { display: true, text: yTitle } },
    },
    elements: {
      line: { borderWidth: 2, tension: 0.2 },
      point: { radius: 2, hoverRadius: 5 },
    },
  };
}

export default {
  name: 'DegradationTrendChart',
  components: { LineChart },
  props: {
    trend: {
      type: Array as () => DegradationPoint[],
      required: true,
    },
  },
  computed: {
    labels() {
      return this.trend.map(p => `${p.hour}`);
    },
    switchesData() {
      return {
        labels: this.labels,
        datasets: [
          {
            label: 'Context switches',
            borderColor: CLASS_COLORS.distraction,
            backgroundColor: CLASS_COLORS.distraction,
            data: this.trend.map(p => p.contextSwitches),
          },
        ],
      };
    },
    spanData() {
      return {
        labels: this.labels,
        datasets: [
          {
            label: 'Attention span (min)',
            borderColor: CLASS_COLORS.focus,
            backgroundColor: CLASS_COLORS.focus,
            data: this.trend.map(p => p.attentionSpanAvg / 60),
          },
        ],
      };
    },
    switchesOptions(): ChartOptions {
      return baseOptions('Switches');
    },
    spanOptions(): ChartOptions {
      return baseOptions('Minutes');
    },
  },
};
</script>
