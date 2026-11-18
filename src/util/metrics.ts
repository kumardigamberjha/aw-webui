// Pure metric computation for the productivity dashboard.
// This module MUST NOT import anything from Vue, Pinia stores, or the API client —
// it operates on normalized event arrays and is unit-tested in isolation
// (test/unit/metrics.test.node.ts).

import { IEvent } from '~/util/interfaces';

// --- HEURISTIC TUNING CONSTANTS -------------------------------------------
// Metrics 12/13/14 are heuristics; these constants define their shape and are
// meant to be tuned. Tests assert the formulas, not psychological validity.
export const EPSILON = 1e-9;
/** Maximal distraction streaks shorter than this (seconds) count as micro-distractions. */
export const MICRO_DISTRACTION_MAX_SEC = 60;
/** How many top hour-of-day bins Cognitive Golden Hours returns. */
export const GOLDEN_HOURS_TOP_N = 3;
/** Normalized Focus Score weights: raw = W1*focusRatio - W2*distractionRatio - W3*min(switchRate/S_NORM, 1) */
export const FOCUS_SCORE_W1 = 1.0;
export const FOCUS_SCORE_W2 = 0.6;
export const FOCUS_SCORE_W3 = 0.3;
/** Switch rate (context switches per active hour) considered "maximal" for the focus score. */
export const SWITCH_RATE_NORM = 30;
/** Max title children per domain in the Content Sinkhole treemap (remainder folded into "(other)"). */
export const SINKHOLE_TOP_TITLES_PER_DOMAIN = 8;
/** Above this fraction of active time being uncategorized, class-derived metrics (Focus Score,
 * Focus Degradation Trend, Cognitive Golden Hours) are too noisy to present as real numbers. */
export const MAX_UNCATEGORIZED_RATIO_FOR_SCORE = 0.4;
/** How many entries computeUnclassifiedSummary returns. */
export const UNCLASSIFIED_TOP_N = 10;
// ---------------------------------------------------------------------------

export type EventClass = 'focus' | 'operational' | 'distraction' | 'uncategorized';

export interface NormalizedEvent {
  /** ms epoch */
  start: number;
  /** ms epoch */
  end: number;
  /** seconds */
  duration: number;
  app: string;
  title: string;
  url?: string;
}

export type Classifier = (event: NormalizedEvent) => EventClass;

export interface MetricsRange {
  start: Date;
  end: Date;
}

export interface ComputeOptions {
  /** Fixed UTC offset (minutes) for hour-of-day binning. Defaults to the runtime's local offset per timestamp. */
  utcOffsetMinutes?: number;
}

export interface HourBinBreakdown {
  hour: number;
  focus: number;
  operational: number;
  distracted: number;
  uncategorized: number;
  idle: number;
}

export interface GoldenHour {
  hour: number;
  score: number;
  focusSeconds: number;
  switches: number;
}

export interface DegradationPoint {
  hour: number;
  contextSwitches: number;
  attentionSpanAvg: number;
}

export interface ValueDrainer {
  app: string;
  totalDuration: number;
  visitCount: number;
  avgStay: number;
}

export interface SinkholeNode {
  name: string;
  value?: number;
  children?: SinkholeNode[];
}

export interface DataQuality {
  uncategorizedRatio: number;
  /** False when class-derived metrics are too noisy to present as real numbers. */
  sufficientForScore: boolean;
}

export interface UnclassifiedEntry {
  /** App name, or domain for browser events. */
  name: string;
  kind: 'app' | 'domain';
  totalDuration: number;
}

export interface Metrics {
  totalActiveDuration: number;
  focusTime: number;
  operationalTime: number;
  distractedDuration: number;
  uncategorizedLeakage: number;
  utilizationRate: number;
  distractionRatio: number;
  attentionSpanAverage: number;
  contextSwitchCount: number;
  /** Context switches per hour-of-day bin [0..23]. */
  contextSwitchesPerHour: number[];
  microDistractionCount: number;
  /** Hour-of-day [0..23] with most distracted time, or null if no distraction. */
  peakDistractionHour: number | null;
  cognitiveGoldenHours: GoldenHour[];
  /** Least-squares slope of distracted sec/hour over active hours; positive = rising fatigue. */
  fatigueVelocity: number;
  /** 0–10. */
  normalizedFocusScore: number;
  chronoTimeline: HourBinBreakdown[];
  focusDegradationTrend: DegradationPoint[];
  valueDrainers: ValueDrainer[];
  contentSinkhole: SinkholeNode;
  dataQuality: DataQuality;
}

const HOUR_MS = 3600 * 1000;

/** Convert raw aw-server events ({timestamp, duration, data}) to NormalizedEvents. */
export function normalizeEvents(events: IEvent[]): NormalizedEvent[] {
  return events.map(e => {
    const start = new Date(e.timestamp).valueOf();
    const duration = e.duration || 0;
    return {
      start,
      end: start + duration * 1000,
      duration,
      app: e.data.app ?? '',
      title: e.data.title ?? '',
      url: e.data.url,
    };
  });
}

function tzOffsetMs(ms: number, utcOffsetMinutes?: number): number {
  if (utcOffsetMinutes !== undefined) {
    return utcOffsetMinutes * 60 * 1000;
  }
  return -new Date(ms).getTimezoneOffset() * 60 * 1000;
}

interface HourSlice {
  /** Absolute (local) hour index since epoch — chronological, gap-preserving. */
  hourIndex: number;
  /** Hour of day [0..23] in the configured timezone. */
  hourOfDay: number;
  seconds: number;
}

/** Split a [startMs, endMs) interval on hour boundaries in the configured timezone. */
function splitByHour(startMs: number, endMs: number, opts?: ComputeOptions): HourSlice[] {
  const slices: HourSlice[] = [];
  if (!(endMs > startMs)) {
    return slices;
  }
  const offset = tzOffsetMs(startMs, opts?.utcOffsetMinutes);
  let cur = startMs + offset;
  const end = endMs + offset;
  while (cur < end) {
    const hourIndex = Math.floor(cur / HOUR_MS);
    const next = Math.min(end, (hourIndex + 1) * HOUR_MS);
    slices.push({
      hourIndex,
      hourOfDay: ((hourIndex % 24) + 24) % 24,
      seconds: (next - cur) / 1000,
    });
    cur = next;
  }
  return slices;
}

function hourOfDay(ms: number, opts?: ComputeOptions): number {
  const shifted = ms + tzOffsetMs(ms, opts?.utcOffsetMinutes);
  const idx = Math.floor(shifted / HOUR_MS);
  return ((idx % 24) + 24) % 24;
}

/** Clip an event interval to the range; returns null when there is no overlap. */
function clipToRange(
  ev: NormalizedEvent,
  rangeStartMs: number,
  rangeEndMs: number
): { start: number; end: number } | null {
  const start = Math.max(ev.start, rangeStartMs);
  const end = Math.min(ev.end, rangeEndMs);
  return end > start ? { start, end } : null;
}

interface LabeledEvent extends NormalizedEvent {
  cls: EventClass;
}

interface Streak {
  events: LabeledEvent[];
  /** Sum of event durations (seconds). */
  duration: number;
}

/** Maximal runs of consecutive (time-ordered) events sharing the same key. */
function maximalStreaks(events: LabeledEvent[], key: (e: LabeledEvent) => string): Streak[] {
  const streaks: Streak[] = [];
  let current: Streak | null = null;
  let currentKey: string | null = null;
  for (const e of events) {
    const k = key(e);
    if (current && k === currentKey) {
      current.events.push(e);
      current.duration += e.duration;
    } else {
      current = { events: [e], duration: e.duration };
      currentKey = k;
      streaks.push(current);
    }
  }
  return streaks;
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Least-squares slope of y over x; 0 when fewer than 2 points or degenerate x. */
function leastSquaresSlope(points: { x: number; y: number }[]): number {
  const n = points.length;
  if (n < 2) {
    return 0;
  }
  const meanX = mean(points.map(p => p.x));
  const meanY = mean(points.map(p => p.y));
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY);
    den += (p.x - meanX) * (p.x - meanX);
  }
  return num / Math.max(den, EPSILON);
}

export function parseDomain(url: string | undefined): string {
  if (!url) {
    return 'unknown';
  }
  try {
    const hostname = new URL(url).hostname;
    if (hostname) {
      return hostname;
    }
  } catch (e) {
    // fall through to regex
  }
  const m = url.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/([^/?#]+)/);
  if (m) {
    // strip credentials and port
    return m[1].replace(/^[^@]*@/, '').replace(/:\d+$/, '');
  }
  return 'unknown';
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * Compute all dashboard metrics.
 *
 * @param activeEvents window events already intersected with not-afk periods
 * @param afkEvents    raw AFK-bucket events (both "afk" and "not-afk"); used to derive
 *                     wallclock coverage for idle time in the chrono-timeline
 * @param webEvents    browser events with data.url; not AFK-filtered
 * @param classifier   maps each event to exactly one EventClass
 * @param range        selected time range; its span is the Utilization denominator
 */
export function computeMetrics(
  activeEvents: NormalizedEvent[],
  afkEvents: NormalizedEvent[],
  webEvents: NormalizedEvent[],
  classifier: Classifier,
  range: MetricsRange,
  opts?: ComputeOptions
): Metrics {
  const rangeStartMs = range.start.valueOf();
  const rangeEndMs = range.end.valueOf();
  const rangeLengthSeconds = Math.max(0, (rangeEndMs - rangeStartMs) / 1000);

  // Label + time-order once; every metric below works off this.
  const labeled: LabeledEvent[] = activeEvents
    .map(e => ({ ...e, cls: classifier(e) }))
    .sort((a, b) => a.start - b.start);

  // 1–5: duration sums per class
  const totalActiveDuration = labeled.reduce((acc, e) => acc + e.duration, 0);
  const sumClass = (cls: EventClass) =>
    labeled.filter(e => e.cls === cls).reduce((acc, e) => acc + e.duration, 0);
  const focusTime = sumClass('focus');
  const operationalTime = sumClass('operational');
  const distractedDuration = sumClass('distraction');
  const uncategorizedLeakage = sumClass('uncategorized');

  // 6–7: ratios
  const utilizationRate = (100 * totalActiveDuration) / Math.max(rangeLengthSeconds, EPSILON);
  const distractionRatio = (100 * distractedDuration) / Math.max(totalActiveDuration, EPSILON);

  // Class streaks (maximal runs of consecutive events with the same class)
  const classStreaks = maximalStreaks(labeled, e => e.cls);
  const focusStreaks = classStreaks.filter(s => s.events[0].cls === 'focus');
  const distractionStreaks = classStreaks.filter(s => s.events[0].cls === 'distraction');

  // 8: Attention Span Average
  const attentionSpanAverage = mean(focusStreaks.map(s => s.duration));

  // 9: Context Switch Count + per-hour array (switch attributed to the later event's start hour)
  let contextSwitchCount = 0;
  const contextSwitchesPerHour = new Array<number>(24).fill(0);
  for (let i = 1; i < labeled.length; i++) {
    if (labeled[i].cls !== labeled[i - 1].cls) {
      contextSwitchCount++;
      contextSwitchesPerHour[hourOfDay(labeled[i].start, opts)]++;
    }
  }

  // 10: Micro-Distraction Count
  const microDistractionCount = distractionStreaks.filter(
    s => s.duration < MICRO_DISTRACTION_MAX_SEC
  ).length;

  // Hour-of-day binning of class seconds (events split on hour boundaries, clipped to range)
  const classSecondsPerHour: Record<EventClass, number[]> = {
    focus: new Array(24).fill(0),
    operational: new Array(24).fill(0),
    distraction: new Array(24).fill(0),
    uncategorized: new Array(24).fill(0),
  };
  // Chronological (absolute-hour) bins for the fatigue slope
  const activeSecPerHourIndex = new Map<number, number>();
  const distractedSecPerHourIndex = new Map<number, number>();
  for (const e of labeled) {
    const clipped = clipToRange(e, rangeStartMs, rangeEndMs);
    if (!clipped) {
      continue;
    }
    for (const slice of splitByHour(clipped.start, clipped.end, opts)) {
      classSecondsPerHour[e.cls][slice.hourOfDay] += slice.seconds;
      activeSecPerHourIndex.set(
        slice.hourIndex,
        (activeSecPerHourIndex.get(slice.hourIndex) || 0) + slice.seconds
      );
      if (e.cls === 'distraction') {
        distractedSecPerHourIndex.set(
          slice.hourIndex,
          (distractedSecPerHourIndex.get(slice.hourIndex) || 0) + slice.seconds
        );
      }
    }
  }

  // 11: Peak Distraction Hour
  let peakDistractionHour: number | null = null;
  let peakDistractionSec = 0;
  for (let h = 0; h < 24; h++) {
    if (classSecondsPerHour.distraction[h] > peakDistractionSec) {
      peakDistractionSec = classSecondsPerHour.distraction[h];
      peakDistractionHour = h;
    }
  }

  // 12: Cognitive Golden Hours — score = focusSecInBin / (1 + switchesInBin)
  const cognitiveGoldenHours: GoldenHour[] = [];
  for (let h = 0; h < 24; h++) {
    const focusSeconds = classSecondsPerHour.focus[h];
    const switches = contextSwitchesPerHour[h];
    const score = focusSeconds / (1 + switches);
    if (score > 0) {
      cognitiveGoldenHours.push({ hour: h, score, focusSeconds, switches });
    }
  }
  cognitiveGoldenHours.sort((a, b) => b.score - a.score);
  cognitiveGoldenHours.splice(GOLDEN_HOURS_TOP_N);

  // 13: Fatigue Velocity — slope of distracted sec/hour vs hour index across active hours
  const fatiguePoints = Array.from(activeSecPerHourIndex.keys())
    .sort((a, b) => a - b)
    .map(hourIndex => ({
      x: hourIndex,
      y: distractedSecPerHourIndex.get(hourIndex) || 0,
    }));
  const fatigueVelocity = leastSquaresSlope(fatiguePoints);

  // 14: Normalized Focus Score (0–10)
  const focusRatio = focusTime / Math.max(totalActiveDuration, EPSILON);
  const switchRate = contextSwitchCount / Math.max(totalActiveDuration / 3600, EPSILON);
  const rawScore =
    FOCUS_SCORE_W1 * focusRatio -
    FOCUS_SCORE_W2 * (distractionRatio / 100) -
    FOCUS_SCORE_W3 * Math.min(switchRate / SWITCH_RATE_NORM, 1);
  const normalizedFocusScore = clamp(10 * rawScore, 0, 10);

  // 15: Chrono-Timeline — idle = wallclock covered by the AFK watcher minus active time
  const wallclockSecPerHour = new Array<number>(24).fill(0);
  for (const e of afkEvents) {
    const clipped = clipToRange(e, rangeStartMs, rangeEndMs);
    if (!clipped) {
      continue;
    }
    for (const slice of splitByHour(clipped.start, clipped.end, opts)) {
      wallclockSecPerHour[slice.hourOfDay] += slice.seconds;
    }
  }
  const chronoTimeline: HourBinBreakdown[] = [];
  for (let h = 0; h < 24; h++) {
    const activeInBin =
      classSecondsPerHour.focus[h] +
      classSecondsPerHour.operational[h] +
      classSecondsPerHour.distraction[h] +
      classSecondsPerHour.uncategorized[h];
    chronoTimeline.push({
      hour: h,
      focus: classSecondsPerHour.focus[h],
      operational: classSecondsPerHour.operational[h],
      distracted: classSecondsPerHour.distraction[h],
      uncategorized: classSecondsPerHour.uncategorized[h],
      idle: Math.max(0, wallclockSecPerHour[h] - activeInBin),
    });
  }

  // 16: Focus Degradation Trend — attention span streaks attributed to their starting hour
  const spanDurationsPerHour: number[][] = Array.from({ length: 24 }, () => []);
  for (const s of focusStreaks) {
    spanDurationsPerHour[hourOfDay(s.events[0].start, opts)].push(s.duration);
  }
  const focusDegradationTrend: DegradationPoint[] = [];
  for (let h = 0; h < 24; h++) {
    focusDegradationTrend.push({
      hour: h,
      contextSwitches: contextSwitchesPerHour[h],
      attentionSpanAvg: mean(spanDurationsPerHour[h]),
    });
  }

  // 17: Value Drainers — visit = maximal run of consecutive distraction events of the same app
  const drainerMap = new Map<string, ValueDrainer>();
  const distractionEvents = labeled.filter(e => e.cls === 'distraction');
  // Runs computed within each distraction streak so a non-distraction event breaks the run
  for (const streak of distractionStreaks) {
    for (const run of maximalStreaks(streak.events, e => e.app)) {
      const app = run.events[0].app || 'unknown';
      let entry = drainerMap.get(app);
      if (!entry) {
        entry = { app, totalDuration: 0, visitCount: 0, avgStay: 0 };
        drainerMap.set(app, entry);
      }
      entry.visitCount++;
    }
  }
  for (const e of distractionEvents) {
    const entry = drainerMap.get(e.app || 'unknown');
    if (entry) {
      entry.totalDuration += e.duration;
    }
  }
  const valueDrainers = Array.from(drainerMap.values())
    .map(d => ({ ...d, avgStay: d.totalDuration / Math.max(d.visitCount, 1) }))
    .sort((a, b) => b.totalDuration - a.totalDuration);

  // 18: Content Sinkhole Hierarchy — domain -> top titles, shaped for a treemap
  const domainMap = new Map<string, Map<string, number>>();
  for (const e of webEvents) {
    const domain = parseDomain(e.url);
    let titles = domainMap.get(domain);
    if (!titles) {
      titles = new Map();
      domainMap.set(domain, titles);
    }
    const title = e.title || '(no title)';
    titles.set(title, (titles.get(title) || 0) + e.duration);
  }
  const domainNodes: SinkholeNode[] = Array.from(domainMap.entries())
    .map(([domain, titles]) => {
      const sorted = Array.from(titles.entries()).sort((a, b) => b[1] - a[1]);
      const topTitles = sorted.slice(0, SINKHOLE_TOP_TITLES_PER_DOMAIN);
      const remainder = sorted
        .slice(SINKHOLE_TOP_TITLES_PER_DOMAIN)
        .reduce((acc, [, dur]) => acc + dur, 0);
      const children: SinkholeNode[] = topTitles.map(([name, value]) => ({ name, value }));
      if (remainder > 0) {
        children.push({ name: '(other)', value: remainder });
      }
      return {
        name: domain,
        children,
        total: children.reduce((acc, c) => acc + (c.value || 0), 0),
      };
    })
    .sort((a, b) => b.total - a.total)
    .map(({ name, children }) => ({ name, children }));
  const contentSinkhole: SinkholeNode = { name: 'root', children: domainNodes };

  // Data quality guard: class-derived metrics (score, degradation trend, golden
  // hours) are all fed by the same classifier, so one ratio gates all three —
  // computed here so it's testable independent of any UI.
  const uncategorizedRatio = uncategorizedLeakage / Math.max(totalActiveDuration, EPSILON);
  const dataQuality: DataQuality = {
    uncategorizedRatio,
    sufficientForScore: uncategorizedRatio <= MAX_UNCATEGORIZED_RATIO_FOR_SCORE,
  };

  return {
    totalActiveDuration,
    focusTime,
    operationalTime,
    distractedDuration,
    uncategorizedLeakage,
    utilizationRate,
    distractionRatio,
    attentionSpanAverage,
    contextSwitchCount,
    contextSwitchesPerHour,
    microDistractionCount,
    peakDistractionHour,
    cognitiveGoldenHours,
    fatigueVelocity,
    normalizedFocusScore,
    chronoTimeline,
    focusDegradationTrend,
    valueDrainers,
    contentSinkhole,
    dataQuality,
  };
}

/**
 * Ranks apps (from active/window events) and domains (from web events) whose
 * classifier result is 'uncategorized', by total duration descending. Powers
 * the dashboard's "Unclassified time this week" review panel — apps and
 * domains share one ranking so the biggest uncategorized time sinks surface
 * first regardless of which bucket they came from.
 */
export function computeUnclassifiedSummary(
  activeEvents: NormalizedEvent[],
  webEvents: NormalizedEvent[],
  classifier: Classifier,
  topN: number = UNCLASSIFIED_TOP_N
): UnclassifiedEntry[] {
  const appDurations = new Map<string, number>();
  for (const e of activeEvents) {
    if (classifier(e) !== 'uncategorized') {
      continue;
    }
    const key = e.app || 'unknown';
    appDurations.set(key, (appDurations.get(key) || 0) + e.duration);
  }

  const domainDurations = new Map<string, number>();
  for (const e of webEvents) {
    if (classifier(e) !== 'uncategorized') {
      continue;
    }
    const key = parseDomain(e.url);
    domainDurations.set(key, (domainDurations.get(key) || 0) + e.duration);
  }

  const entries: UnclassifiedEntry[] = [
    ...Array.from(appDurations.entries(), ([name, totalDuration]) => ({
      name,
      kind: 'app' as const,
      totalDuration,
    })),
    ...Array.from(domainDurations.entries(), ([name, totalDuration]) => ({
      name,
      kind: 'domain' as const,
      totalDuration,
    })),
  ];

  entries.sort((a, b) => b.totalDuration - a.totalDuration);
  return entries.slice(0, topN);
}
