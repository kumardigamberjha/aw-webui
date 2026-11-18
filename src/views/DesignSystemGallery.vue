<template lang="pug">
dashboard-shell(:theme-override="previewTheme")
  template(#title) Design System
  template(#actions)
    range-toggle(
      v-model="previewTheme"
      :options="[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]"
      aria-label="Preview theme"
    )

  div.gallery

    section.gallery-section
      h2.gallery-heading Stat
      div.gallery-stats
        card
          stat(
            label="Focus Time"
            value="3h 42m"
            delta="+12% vs prior 1d"
            delta-direction="up"
            delta-semantic="good"
          )
        card
          stat(
            label="Distraction Time"
            value="45m"
            delta="+8% vs prior 1d"
            delta-direction="up"
            delta-semantic="bad"
          )
        card
          stat(
            label="Context Switches"
            value="128"
            delta="-5% vs prior 1d"
            delta-direction="down"
            delta-semantic="good"
          )
        card
          stat(
            label="Uncategorized"
            value="1h 10m"
            delta="+0% vs prior 1d"
            delta-direction="flat"
            delta-semantic="neutral"
          )

    section.gallery-section
      h2.gallery-heading Badge
      card
        div.gallery-row
          badge(variant="focus") Focus
          badge(variant="operational") Operational
          badge(variant="distraction") Distraction
          badge(variant="idle") Idle
          badge(variant="neutral") Uncategorized

    section.gallery-section
      h2.gallery-heading Button
      card
        div.gallery-row
          app-button(variant="primary") Primary
          app-button(variant="secondary") Secondary
          app-button(variant="ghost") Ghost
          app-button(variant="secondary" disabled) Disabled

    section.gallery-section
      h2.gallery-heading Select
      card
        app-select(v-model="selectValue" :options="selectOptions")

    section.gallery-section
      h2.gallery-heading RangeToggle
      card
        range-toggle(v-model="rangeValue" :options="rangeOptions" aria-label="Time range")
        p.gallery-hint Selected: {{ rangeValue }}. Arrow keys / Home / End move focus and selection.

    section.gallery-section
      h2.gallery-heading Table
      card
        app-table(:columns="tableColumns" :sort-by="sortBy" :sort-desc="sortDesc" @sort="onSort")
          tr(v-for="row in sortedRows" :key="row.app")
            td {{ row.rank }}
            td {{ row.app }}
            td.is-right.tnum {{ row.total }}
            td.is-right.tnum {{ row.visits }}
            td.is-right.tnum {{ row.avgStay }}

    section.gallery-section
      h2.gallery-heading Tooltip
      card
        div.gallery-row
          tooltip(label="Refresh data")
            app-button(variant="ghost")
              icon(name="sync")
          tooltip(label="Export (not wired up)" placement="top")
            app-button(variant="ghost") Export
          tooltip(label="Settings" placement="bottom")
            app-button(variant="ghost")
              icon(name="cog")

    section.gallery-section
      h2.gallery-heading EmptyState
      card
        empty-state(
          title="No browsing activity in this range"
          description="Content Sinkhole needs a browser watcher bucket to populate. Try a longer range or check your watcher config."
        )

    section.gallery-section
      h2.gallery-heading Skeleton
      card
        div.gallery-skeletons
          div.gallery-skeleton-col
            p.gallery-hint text
            skeleton(variant="text")
          div.gallery-skeleton-col
            p.gallery-hint card
            skeleton(variant="card")
          div.gallery-skeleton-col
            p.gallery-hint chart
            skeleton(variant="chart")
          div.gallery-skeleton-col
            p.gallery-hint table-row
            skeleton(variant="table-row")
</template>

<script lang="ts">
import DashboardShell from '~/design/primitives/DashboardShell.vue';
import Card from '~/design/primitives/Card.vue';
import Stat from '~/design/primitives/Stat.vue';
import Badge from '~/design/primitives/Badge.vue';
import AppButton from '~/design/primitives/Button.vue';
import AppSelect from '~/design/primitives/Select.vue';
import RangeToggle from '~/design/primitives/RangeToggle.vue';
import AppTable, { TableColumn } from '~/design/primitives/Table.vue';
import Tooltip from '~/design/primitives/Tooltip.vue';
import EmptyState from '~/design/primitives/EmptyState.vue';
import Skeleton from '~/design/primitives/Skeleton.vue';

import 'vue-awesome/icons/sync';
import 'vue-awesome/icons/cog';

interface DrainerRow {
  rank: number;
  app: string;
  total: string;
  totalSeconds: number;
  visits: number;
  avgStay: string;
}

const MOCK_ROWS: DrainerRow[] = [
  { rank: 1, app: 'google-chrome', total: '1m 44s', totalSeconds: 104, visits: 7, avgStay: '14s' },
  { rank: 2, app: 'brave', total: '11s', totalSeconds: 11, visits: 3, avgStay: '3s' },
  { rank: 3, app: 'slack', total: '2m 05s', totalSeconds: 125, visits: 4, avgStay: '31s' },
];

export default {
  name: 'DesignSystemGallery',
  components: {
    DashboardShell,
    Card,
    Stat,
    Badge,
    AppButton,
    AppSelect,
    RangeToggle,
    AppTable,
    Tooltip,
    EmptyState,
    Skeleton,
  },
  data() {
    return {
      previewTheme: 'dark',
      selectValue: 'metric-focus',
      selectOptions: [
        { value: 'metric-focus', label: 'Focus Time' },
        { value: 'metric-distraction', label: 'Distraction Time' },
        { value: 'metric-switches', label: 'Context Switches' },
      ],
      rangeValue: '1d',
      rangeOptions: [
        { value: '1h', label: '1h' },
        { value: '4h', label: '4h' },
        { value: '12h', label: '12h' },
        { value: '1d', label: '1d' },
        { value: '7d', label: '7d' },
        { value: '30d', label: '30d' },
        { value: 'custom', label: 'Custom' },
      ],
      tableColumns: [
        { key: 'rank', label: 'Rank' },
        { key: 'app', label: 'App' },
        { key: 'total', label: 'Total', align: 'right', sortable: true },
        { key: 'visits', label: 'Visits', align: 'right', sortable: true },
        { key: 'avgStay', label: 'Avg Stay', align: 'right' },
      ] as TableColumn[],
      sortBy: 'total',
      sortDesc: true,
      rows: MOCK_ROWS,
    };
  },
  computed: {
    sortedRows(): DrainerRow[] {
      if (this.sortBy === 'total') {
        const sorted = [...this.rows].sort((a, b) => a.totalSeconds - b.totalSeconds);
        return this.sortDesc ? sorted.reverse() : sorted;
      }
      if (this.sortBy === 'visits') {
        const sorted = [...this.rows].sort((a, b) => a.visits - b.visits);
        return this.sortDesc ? sorted.reverse() : sorted;
      }
      return this.rows;
    },
  },
  methods: {
    onSort(key: string) {
      if (this.sortBy === key) {
        this.sortDesc = !this.sortDesc;
      } else {
        this.sortBy = key;
        this.sortDesc = true;
      }
    },
  },
};
</script>

<style scoped lang="scss">
.gallery {
  display: flex;
  flex-direction: column;
  gap: var(--space-32);
  max-width: 1100px;
}

.gallery-section {
  display: flex;
  flex-direction: column;
}

.gallery-heading {
  font-size: var(--font-size-13);
  font-weight: 600;
  color: var(--muted-fg);
  margin: 0 0 var(--space-12) 0;
}

.gallery-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-16);
}

@media (max-width: 1024px) {
  .gallery-stats {
    grid-template-columns: repeat(2, 1fr);
  }
}

.gallery-row {
  display: flex;
  align-items: center;
  gap: var(--space-12);
  flex-wrap: wrap;
}

.gallery-hint {
  font-size: var(--font-size-12);
  color: var(--muted-fg);
  margin: var(--space-8) 0 0 0;
}

.gallery-skeletons {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-16);
}

@media (max-width: 1024px) {
  .gallery-skeletons {
    grid-template-columns: repeat(2, 1fr);
  }
}

.gallery-skeleton-col .gallery-hint {
  margin: 0 0 var(--space-8) 0;
}
</style>
