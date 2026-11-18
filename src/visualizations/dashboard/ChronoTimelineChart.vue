<template lang="pug">
div
  bar(:chart-data="chartData" :chart-options="chartOptions" :height="300")
</template>

<script lang="ts">
import { ChartOptions } from 'chart.js';
import 'chart.js/auto';
import { Bar } from 'vue-chartjs/legacy';
import { HourBinBreakdown } from '~/util/metrics';
import { seconds_to_duration } from '~/util/time';
import { CLASS_COLORS, CLASS_LABELS, IDLE_COLOR } from './colors';

export default {
  name: 'ChronoTimelineChart',
  components: { Bar },
  props: {
    timeline: {
      type: Array as () => HourBinBreakdown[],
      required: true,
    },
  },
  computed: {
    chartData() {
      const hours = this.timeline.map(b => `${b.hour}`);
      const series: { key: keyof HourBinBreakdown; label: string; color: string }[] = [
        { key: 'focus', label: CLASS_LABELS.focus, color: CLASS_COLORS.focus },
        { key: 'operational', label: CLASS_LABELS.operational, color: CLASS_COLORS.operational },
        { key: 'distracted', label: CLASS_LABELS.distraction, color: CLASS_COLORS.distraction },
        {
          key: 'uncategorized',
          label: CLASS_LABELS.uncategorized,
          color: CLASS_COLORS.uncategorized,
        },
        { key: 'idle', label: 'Idle', color: IDLE_COLOR },
      ];
      return {
        labels: hours,
        datasets: series.map(s => ({
          label: s.label,
          backgroundColor: s.color,
          // 2px surface gap between stacked segments
          borderColor: '#fff',
          borderWidth: { top: 2, right: 0, bottom: 0, left: 0 },
          borderSkipped: false,
          data: this.timeline.map(b => (b[s.key] as number) / 3600),
        })),
      };
    },
    chartOptions(): ChartOptions {
      return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'bottom' },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: context =>
                `${context.dataset.label}: ${seconds_to_duration(context.parsed.y * 3600)}`,
              title: items => (items.length > 0 ? `Hour ${items[0].label}:00` : ''),
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            title: { display: true, text: 'Hour of day' },
          },
          y: {
            stacked: true,
            min: 0,
            title: { display: true, text: 'Hours' },
          },
        },
      };
    },
  },
};
</script>
