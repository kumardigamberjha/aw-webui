<template lang="pug">
div
  h3.mb-2 Productivity Dashboard

  range-selector(v-model="range")

  div.aw-loading.mt-4(v-if="loading")
    b-spinner.mr-2(small)
    | Computing metrics...

  b-alert(v-else-if="error" show variant="danger") {{ error }}

  div.mt-3(v-else-if="metrics && metrics.totalActiveDuration === 0")
    b-alert(show variant="secondary")
      | No activity found in the selected range.
      br
      small.text-muted Try a longer range, or check that aw-watcher-window and aw-watcher-afk are running.

  div.mt-3(v-else-if="metrics")
    //- Summary metric cards
    div.row.no-gutters.mx-n1
      div.col-6.col-md-3.col-xl-2.px-1.mb-2(v-for="card in summaryCards" :key="card.label")
        metric-card(:label="card.label" :value="card.value" :sublabel="card.sublabel")

    //- Chrono-timeline
    div.card.mb-3
      div.card-body
        h5.card-title Chrono-Timeline
        small.text-muted.d-block.mb-2 Time per hour of day, split by class; idle is watcher-covered time without activity
        chrono-timeline-chart(:timeline="metrics.chronoTimeline")

    div.row
      //- Degradation trend
      div.col-lg-6.mb-3
        div.card.h-100
          div.card-body
            h5.card-title Focus Degradation Trend
            degradation-trend-chart(:trend="metrics.focusDegradationTrend")

      //- Value drainers
      div.col-lg-6.mb-3
        div.card.h-100
          div.card-body
            h5.card-title Value Drainers
            small.text-muted.d-block.mb-2 Distraction apps by total time
            value-drainers-table(:drainers="metrics.valueDrainers")

    //- Golden hours
    div.card.mb-3(v-if="metrics.cognitiveGoldenHours.length > 0")
      div.card-body
        h5.card-title Cognitive Golden Hours
        small.text-muted.d-block.mb-2 Best hours for deep work: most focus time, fewest context switches
        div.d-flex.flex-wrap
          div.golden-hour.mr-3.mb-2(v-for="(gh, i) in metrics.cognitiveGoldenHours" :key="gh.hour")
            span.rank \#{{ i + 1 }}
            span.hour {{ gh.hour }}:00–{{ (gh.hour + 1) % 24 }}:00
            span.detail {{ gh.focusSeconds | friendlyduration }} focus, {{ gh.switches }} switches

    //- Content sinkhole
    div.card.mb-3
      div.card-body
        h5.card-title Content Sinkhole
        small.text-muted.d-block.mb-2 Web time by domain and page title
        sinkhole-treemap(
          v-if="metrics.contentSinkhole.children && metrics.contentSinkhole.children.length > 0"
          :root="metrics.contentSinkhole"
        )
        div.text-muted(v-else) No web browsing events in this range (is a browser watcher installed?)
</template>

<script lang="ts">
import { getClient } from '~/util/awclient';
import { useBucketsStore } from '~/stores/buckets';
import { useCategoryStore } from '~/stores/categories';
import { dashboardQuery } from '~/queries';
import { Metrics, computeMetrics, normalizeEvents } from '~/util/metrics';
import { makeClassifier } from '~/util/metricsClassifier';
import { seconds_to_duration } from '~/util/time';
import { IEvent } from '~/util/interfaces';

import RangeSelector from '~/components/RangeSelector.vue';
import MetricCard from '~/visualizations/dashboard/MetricCard.vue';
import ChronoTimelineChart from '~/visualizations/dashboard/ChronoTimelineChart.vue';
import DegradationTrendChart from '~/visualizations/dashboard/DegradationTrendChart.vue';
import ValueDrainersTable from '~/visualizations/dashboard/ValueDrainersTable.vue';
import SinkholeTreemap from '~/visualizations/dashboard/SinkholeTreemap.vue';

interface DashboardQueryResult {
  active_events: IEvent[];
  afk_events: IEvent[];
  web_events: IEvent[];
}

export default {
  name: 'ProductivityDashboard',
  components: {
    RangeSelector,
    MetricCard,
    ChronoTimelineChart,
    DegradationTrendChart,
    ValueDrainersTable,
    SinkholeTreemap,
  },
  data() {
    return {
      bucketsStore: useBucketsStore(),
      categoryStore: useCategoryStore(),
      range: null as { start: Date; end: Date } | null,
      loading: true,
      error: '',
      metrics: null as Metrics | null,
    };
  },
  computed: {
    summaryCards() {
      const m: Metrics = this.metrics;
      if (!m) return [];
      return [
        {
          label: 'Focus Score',
          value: m.normalizedFocusScore.toFixed(1) + ' / 10',
          sublabel: 'heuristic',
        },
        { label: 'Active Time', value: seconds_to_duration(m.totalActiveDuration) },
        { label: 'Focus Time', value: seconds_to_duration(m.focusTime) },
        { label: 'Operational', value: seconds_to_duration(m.operationalTime) },
        { label: 'Distracted', value: seconds_to_duration(m.distractedDuration) },
        { label: 'Uncategorized', value: seconds_to_duration(m.uncategorizedLeakage) },
        { label: 'Utilization', value: m.utilizationRate.toFixed(1) + '%', sublabel: 'of range' },
        {
          label: 'Distraction Ratio',
          value: m.distractionRatio.toFixed(1) + '%',
          sublabel: 'of active time',
        },
        {
          label: 'Context Switches',
          value: m.contextSwitchCount,
          sublabel: 'class changes',
        },
        {
          label: 'Attention Span',
          value: seconds_to_duration(m.attentionSpanAverage),
          sublabel: 'avg focus streak',
        },
        { label: 'Micro-Distractions', value: m.microDistractionCount, sublabel: '< 60s streaks' },
        {
          label: 'Peak Distraction',
          value: m.peakDistractionHour !== null ? `${m.peakDistractionHour}:00` : '—',
          sublabel: 'hour of day',
        },
        {
          label: 'Fatigue Velocity',
          value: (m.fatigueVelocity >= 0 ? '+' : '') + m.fatigueVelocity.toFixed(1),
          sublabel: 'distracted s/h per hour',
        },
      ];
    },
  },
  watch: {
    range() {
      this.refresh();
    },
  },
  async mounted() {
    this.categoryStore.load();
    await this.bucketsStore.ensureLoaded();
    // RangeSelector emits the default range on mount, which triggers the first refresh
  },
  methods: {
    async refresh() {
      if (!this.range) return;
      this.loading = true;
      this.error = '';
      try {
        await this.bucketsStore.ensureLoaded();
        const hosts: string[] = this.bucketsStore.hosts.filter(
          (host: string) => host && this.bucketsStore.available(host).window
        );
        if (hosts.length === 0) {
          this.metrics = null;
          this.error = 'No hosts with window + AFK buckets found. Are the watchers running?';
          return;
        }

        const client = getClient();
        const timeperiod = [this.range.start.toISOString(), this.range.end.toISOString()].join('/');
        const results: DashboardQueryResult[] = await Promise.all(
          hosts.map(async host => {
            const query = dashboardQuery({
              bid_window: this.bucketsStore.bucketsWindow(host)[0],
              bid_afk: this.bucketsStore.bucketsAFK(host)[0],
              bid_browsers: this.bucketsStore.bucketsBrowser(host),
              categories: [],
              filter_categories: [],
              filter_afk: true,
            });
            const res = await client.query([timeperiod], query);
            return res[0] as DashboardQueryResult;
          })
        );

        const concat = (key: keyof DashboardQueryResult) =>
          results.flatMap(r => (r && r[key]) || []);
        const classifier = makeClassifier(this.categoryStore.classes);
        this.metrics = computeMetrics(
          normalizeEvents(concat('active_events')),
          normalizeEvents(concat('afk_events')),
          normalizeEvents(concat('web_events')),
          classifier,
          this.range
        );
      } catch (e) {
        console.error('Failed to compute dashboard metrics:', e);
        this.error = 'Failed to load data: ' + (e && e.message ? e.message : e);
        this.metrics = null;
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped lang="scss">
.golden-hour {
  border: 1px solid #dee2e6;
  border-radius: 0.25rem;
  padding: 0.4rem 0.8rem;
  .rank {
    font-weight: 700;
    margin-right: 0.5rem;
    color: #2a78d6;
  }
  .hour {
    font-weight: 600;
    margin-right: 0.5rem;
  }
  .detail {
    color: #6c757d;
    font-size: 0.85rem;
  }
}
</style>
