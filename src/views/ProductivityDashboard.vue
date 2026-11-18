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
      div.col-6.col-md-3.col-xl-2.px-1.mb-2
        metric-card(
          v-if="metrics.dataQuality.sufficientForScore"
          label="Focus Score"
          :value="metrics.normalizedFocusScore.toFixed(1) + ' / 10'"
          sublabel="heuristic"
        )
        div.card.h-100(v-else style="cursor: pointer" @click="scrollToUnclassified")
          div.card-body.py-2.px-3
            div.metric-label.text-muted FOCUS SCORE
            div.insufficient-data
              icon.mr-1(name="exclamation-triangle")
              | Not enough categorized data
            div.metric-sub.text-muted
              | {{ Math.round(metrics.dataQuality.uncategorizedRatio * 100) }}% uncategorized — classify apps below ↓
      div.col-6.col-md-3.col-xl-2.px-1.mb-2(v-for="card in summaryCards" :key="card.label")
        metric-card(:label="card.label" :value="card.value" :sublabel="card.sublabel")

    //- Unclassified time review — the actual point of this whole feature.
    div.card.mb-3(ref="unclassifiedPanel")
      div.card-body
        h5.card-title Unclassified time this week
        small.text-muted.d-block.mb-2 Top apps/domains counting as Uncategorized — classify them to sharpen every metric above
        div(v-if="unclassifiedEntries.length === 0" class="text-muted") Nothing uncategorized in this range — nice.
        table.table.table-sm.mb-0(v-else)
          tbody
            tr(v-for="entry in unclassifiedEntries" :key="entry.kind + ':' + entry.name")
              td
                icon.mr-1.text-muted(:name="entry.kind === 'domain' ? 'globe' : 'desktop'")
                | {{ entry.name }}
              td.text-right.text-nowrap {{ entry.totalDuration | friendlyduration }}
              td.text-right.text-nowrap
                b-btn.mr-1(size="sm" variant="outline-success" @click="classifyEntry(entry, 'focus')")
                  icon(name="bullseye")
                  |  Focus
                b-btn.mr-1(size="sm" variant="outline-warning" @click="classifyEntry(entry, 'operational')")
                  icon(name="handshake")
                  |  Operational
                b-btn(size="sm" variant="outline-danger" @click="classifyEntry(entry, 'distraction')")
                  icon(name="film")
                  |  Distraction

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
            div.text-muted(v-if="!metrics.dataQuality.sufficientForScore")
              icon.mr-1(name="exclamation-triangle")
              | Not enough categorized data to show a reliable trend.
              a.ml-1(href="#" @click.prevent="scrollToUnclassified") Classify more apps
            degradation-trend-chart(v-else :trend="metrics.focusDegradationTrend")

      //- Value drainers
      div.col-lg-6.mb-3
        div.card.h-100
          div.card-body
            h5.card-title Value Drainers
            small.text-muted.d-block.mb-2 Distraction apps by total time
            value-drainers-table(:drainers="metrics.valueDrainers")

    //- Golden hours
    div.card.mb-3(v-if="metrics.cognitiveGoldenHours.length > 0 && metrics.dataQuality.sufficientForScore")
      div.card-body
        h5.card-title Cognitive Golden Hours
        small.text-muted.d-block.mb-2 Best hours for deep work: most focus time, fewest context switches
        div.d-flex.flex-wrap
          div.golden-hour.mr-3.mb-2(v-for="(gh, i) in metrics.cognitiveGoldenHours" :key="gh.hour")
            span.rank \#{{ i + 1 }}
            span.hour {{ gh.hour }}:00–{{ (gh.hour + 1) % 24 }}:00
            span.detail {{ gh.focusSeconds | friendlyduration }} focus, {{ gh.switches }} switches
    div.card.mb-3(v-else-if="!metrics.dataQuality.sufficientForScore")
      div.card-body
        h5.card-title Cognitive Golden Hours
        div.text-muted
          icon.mr-1(name="exclamation-triangle")
          | Not enough categorized data to rank golden hours.
          a.ml-1(href="#" @click.prevent="scrollToUnclassified") Classify more apps

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
import {
  Metrics,
  NormalizedEvent,
  UnclassifiedEntry,
  computeMetrics,
  computeUnclassifiedSummary,
  normalizeEvents,
} from '~/util/metrics';
import { makeClassifier } from '~/util/metricsClassifier';
import { seconds_to_duration } from '~/util/time';
import { IEvent } from '~/util/interfaces';
import 'vue-awesome/icons/bullseye';
import 'vue-awesome/icons/handshake';
import 'vue-awesome/icons/exclamation-triangle';
import 'vue-awesome/icons/film';
import 'vue-awesome/icons/globe';
import 'vue-awesome/icons/desktop';

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
      // Kept from the last fetch so the Unclassified panel can recompute
      // instantly (and, once wired, react live to new rules) without refetching.
      normalizedActive: [] as NormalizedEvent[],
      normalizedWeb: [] as NormalizedEvent[],
    };
  },
  computed: {
    // Vue's computed caching is the memoization the classifier needs: it's only
    // rebuilt (regexes recompiled) when categoryStore.classes actually changes,
    // not on every range change / recompute.
    classifier() {
      return makeClassifier(this.categoryStore.classes);
    },
    unclassifiedEntries(): UnclassifiedEntry[] {
      return computeUnclassifiedSummary(this.normalizedActive, this.normalizedWeb, this.classifier);
    },
    summaryCards() {
      const m: Metrics = this.metrics;
      if (!m) return [];
      return [
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
    await this.categoryStore.load();
    await this.categoryStore.ensureLeafClassMigration();
    await this.bucketsStore.ensureLoaded();
    // RangeSelector emits the default range on mount (before or after this hook,
    // depending on child/parent mount order), which triggers the `range` watcher.
    // Force one more refresh here so it never runs against pre-migration classes.
    if (this.range) {
      await this.refresh();
    }
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
        this.normalizedActive = normalizeEvents(concat('active_events'));
        this.normalizedWeb = normalizeEvents(concat('web_events'));
        this.metrics = computeMetrics(
          this.normalizedActive,
          normalizeEvents(concat('afk_events')),
          this.normalizedWeb,
          this.classifier,
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
    // STUB — not wired to create a rule + save + recompute yet. Intentionally
    // left as a no-op beyond logging so the UI/interaction can be reviewed
    // before wiring it up (see task tracker).
    classifyEntry(entry: UnclassifiedEntry, cls: 'focus' | 'operational' | 'distraction') {
      console.log('[stub] would classify', entry.kind, entry.name, 'as', cls);
    },
    scrollToUnclassified() {
      const el = this.$refs.unclassifiedPanel as HTMLElement | undefined;
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

.metric-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.metric-sub {
  font-size: 0.75rem;
}
.insufficient-data {
  font-size: 1.1rem;
  font-weight: 600;
  color: #b8860b;
  line-height: 1.3;
  margin-top: 0.25rem;
}
</style>
