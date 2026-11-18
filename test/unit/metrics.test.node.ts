import {
  Classifier,
  MAX_UNCATEGORIZED_RATIO_FOR_SCORE,
  Metrics,
  MetricsRange,
  NormalizedEvent,
  computeMetrics,
  computeUnclassifiedSummary,
  normalizeEvents,
} from '~/util/metrics';

// All fixtures use UTC timestamps and utcOffsetMinutes: 0 so hour-of-day
// binning is deterministic regardless of the machine's timezone.
const OPTS = { utcOffsetMinutes: 0 };

function ev(startIso: string, durationSec: number, app: string, title = '', url?: string): NormalizedEvent {
  const start = new Date(startIso).valueOf();
  return { start, end: start + durationSec * 1000, duration: durationSec, app, title, url };
}

function range(startIso: string, endIso: string): MetricsRange {
  return { start: new Date(startIso), end: new Date(endIso) };
}

// App-keyed classifier: 'code' = focus, 'slack' = operational, 'yt' = distraction, else uncategorized
const classifier: Classifier = e =>
  e.app === 'code'
    ? 'focus'
    : e.app === 'slack'
    ? 'operational'
    : e.app === 'yt'
    ? 'distraction'
    : 'uncategorized';

function assertAllFinite(obj: unknown, path = 'metrics'): void {
  if (typeof obj === 'number') {
    expect(Number.isFinite(obj)).toBe(true);
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => assertAllFinite(v, `${path}[${i}]`));
    return;
  }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      assertAllFinite(v, `${path}.${k}`);
    }
  }
}

describe('normalizeEvents', () => {
  test('converts IEvents to ms-epoch normalized events', () => {
    const [n] = normalizeEvents([
      {
        timestamp: '2026-01-05T08:00:00Z',
        duration: 90,
        data: { app: 'code', title: 'main.ts', url: 'https://example.com' },
      },
    ]);
    expect(n.start).toBe(Date.UTC(2026, 0, 5, 8));
    expect(n.end).toBe(Date.UTC(2026, 0, 5, 8, 1, 30));
    expect(n.duration).toBe(90);
    expect(n.app).toBe('code');
    expect(n.title).toBe('main.ts');
    expect(n.url).toBe('https://example.com');
  });

  test('missing fields default sanely', () => {
    const [n] = normalizeEvents([{ timestamp: '2026-01-05T08:00:00Z', duration: 0, data: {} }]);
    expect(n.app).toBe('');
    expect(n.title).toBe('');
    expect(n.url).toBeUndefined();
  });
});

describe('computeMetrics — hand-built morning fixture', () => {
  // Range 08:00–12:00 UTC (14400 s). Events in order:
  //   08:00:00 +1800s code   (focus)
  //   08:30:00  +600s slack  (operational)
  //   08:40:00  +120s yt     (distraction)
  //   08:42:00 +1800s code   (focus, crosses 09:00 boundary: 1080s in h8, 720s in h9)
  //   09:12:00   +30s yt     (distraction, micro)
  //   09:12:30  +900s code   (focus)
  //   09:27:30  +300s other  (uncategorized)
  const activeEvents = [
    ev('2026-01-05T08:00:00Z', 1800, 'code'),
    ev('2026-01-05T08:30:00Z', 600, 'slack'),
    ev('2026-01-05T08:40:00Z', 120, 'yt'),
    ev('2026-01-05T08:42:00Z', 1800, 'code'),
    ev('2026-01-05T09:12:00Z', 30, 'yt'),
    ev('2026-01-05T09:12:30Z', 900, 'code'),
    ev('2026-01-05T09:27:30Z', 300, 'other'),
  ];
  // AFK watcher covered 08:00–10:00 (not-afk 08:00–09:40, afk 09:40–10:00)
  const afkEvents = [
    ev('2026-01-05T08:00:00Z', 6000, 'afk-watcher'),
    ev('2026-01-05T09:40:00Z', 1200, 'afk-watcher'),
  ];
  const webEvents = [
    ev('2026-01-05T08:40:00Z', 300, 'browser', 'Video A', 'https://www.youtube.com/watch?v=1'),
    ev('2026-01-05T09:12:00Z', 100, 'browser', 'Video B', 'https://www.youtube.com/watch?v=2'),
    ev('2026-01-05T10:00:00Z', 200, 'browser', 'Repo', 'https://github.com/foo'),
  ];
  const r = range('2026-01-05T08:00:00Z', '2026-01-05T12:00:00Z');

  let m: Metrics;
  beforeAll(() => {
    m = computeMetrics(activeEvents, afkEvents, webEvents, classifier, r, OPTS);
  });

  test('1. totalActiveDuration', () => {
    expect(m.totalActiveDuration).toBe(5550);
  });

  test('2–5. per-class durations', () => {
    expect(m.focusTime).toBe(4500);
    expect(m.operationalTime).toBe(600);
    expect(m.distractedDuration).toBe(150);
    expect(m.uncategorizedLeakage).toBe(300);
  });

  test('6. utilizationRate = 100 * T / rangeLength', () => {
    expect(m.utilizationRate).toBeCloseTo((100 * 5550) / 14400, 10); // 38.5416...
  });

  test('7. distractionRatio = 100 * distracted / T', () => {
    expect(m.distractionRatio).toBeCloseTo((100 * 150) / 5550, 10); // 2.7027...
  });

  test('8. attentionSpanAverage = mean of maximal focus streaks', () => {
    // Streaks: 1800, 1800, 900 → mean 1500
    expect(m.attentionSpanAverage).toBe(1500);
  });

  test('9. contextSwitchCount + per-hour array', () => {
    // F→O, O→D, D→F, F→D, D→F, F→U = 6
    expect(m.contextSwitchCount).toBe(6);
    const expected = new Array(24).fill(0);
    expected[8] = 3; // switches landing at 08:30, 08:40, 08:42
    expected[9] = 3; // switches landing at 09:12, 09:12:30, 09:27:30
    expect(m.contextSwitchesPerHour).toEqual(expected);
  });

  test('10. microDistractionCount (streaks < 60s)', () => {
    // Distraction streaks: 120s and 30s → only the 30s one is micro
    expect(m.microDistractionCount).toBe(1);
  });

  test('11. peakDistractionHour', () => {
    // 120s distracted in hour 8, 30s in hour 9
    expect(m.peakDistractionHour).toBe(8);
  });

  test('12. cognitiveGoldenHours = top-N by focusSec/(1+switches)', () => {
    // h8: 2880 focus-sec / (1+3) = 720; h9: 1620 / (1+3) = 405
    expect(m.cognitiveGoldenHours).toEqual([
      { hour: 8, score: 720, focusSeconds: 2880, switches: 3 },
      { hour: 9, score: 405, focusSeconds: 1620, switches: 3 },
    ]);
  });

  test('13. fatigueVelocity = LSQ slope of distracted sec per active hour', () => {
    // Two active hours: 120s then 30s distracted → slope (30-120)/1 = -90
    expect(m.fatigueVelocity).toBeCloseTo(-90, 10);
  });

  test('14. normalizedFocusScore formula', () => {
    // focusRatio = 4500/5550; distractionRatio = 150/5550
    // switchRate = 6 / (5550/3600); raw = 1.0*fr - 0.6*dr - 0.3*min(sr/30, 1)
    const fr = 4500 / 5550;
    const dr = 150 / 5550;
    const sr = 6 / (5550 / 3600);
    const raw = 1.0 * fr - 0.6 * dr - 0.3 * Math.min(sr / 30, 1);
    expect(m.normalizedFocusScore).toBeCloseTo(10 * raw, 10); // ≈ 7.5567567
  });

  test('15. chronoTimeline breakdown incl. idle from AFK coverage', () => {
    expect(m.chronoTimeline).toHaveLength(24);
    expect(m.chronoTimeline[8]).toEqual({
      hour: 8,
      focus: 2880, // 1800 + 1080 (split of the 08:42 event at 09:00)
      operational: 600,
      distracted: 120,
      uncategorized: 0,
      idle: 0, // wallclock 3600, active 3600
    });
    expect(m.chronoTimeline[9]).toEqual({
      hour: 9,
      focus: 1620, // 720 + 900
      operational: 0,
      distracted: 30,
      uncategorized: 300,
      idle: 1650, // wallclock 3600 (2400 not-afk + 1200 afk) − active 1950
    });
    // hour with no AFK coverage and no events
    expect(m.chronoTimeline[11]).toEqual({
      hour: 11,
      focus: 0,
      operational: 0,
      distracted: 0,
      uncategorized: 0,
      idle: 0,
    });
  });

  test('16. focusDegradationTrend', () => {
    expect(m.focusDegradationTrend).toHaveLength(24);
    // h8: streaks starting 08:00 (1800s) and 08:42 (1800s) → avg 1800
    expect(m.focusDegradationTrend[8]).toEqual({
      hour: 8,
      contextSwitches: 3,
      attentionSpanAvg: 1800,
    });
    // h9: streak starting 09:12:30 (900s)
    expect(m.focusDegradationTrend[9]).toEqual({
      hour: 9,
      contextSwitches: 3,
      attentionSpanAvg: 900,
    });
    expect(m.focusDegradationTrend[10]).toEqual({
      hour: 10,
      contextSwitches: 0,
      attentionSpanAvg: 0,
    });
  });

  test('17. valueDrainers', () => {
    expect(m.valueDrainers).toEqual([
      { app: 'yt', totalDuration: 150, visitCount: 2, avgStay: 75 },
    ]);
  });

  test('18. contentSinkhole treemap shape', () => {
    expect(m.contentSinkhole).toEqual({
      name: 'root',
      children: [
        {
          name: 'www.youtube.com',
          children: [
            { name: 'Video A', value: 300 },
            { name: 'Video B', value: 100 },
          ],
        },
        {
          name: 'github.com',
          children: [{ name: 'Repo', value: 200 }],
        },
      ],
    });
  });

  test('no NaN/Infinity anywhere', () => {
    assertAllFinite(m);
  });
});

describe('computeMetrics — realistic full-day integration fixture', () => {
  // 09:00–17:00. Every hour h: 2400s code, 600s slack (h:40), 300s yt (h:50),
  // then 300s away. AFK watcher: not-afk h:00 +3300s, afk h:55 +300s.
  const activeEvents: NormalizedEvent[] = [];
  const afkEvents: NormalizedEvent[] = [];
  for (let h = 9; h < 17; h++) {
    const hh = String(h).padStart(2, '0');
    activeEvents.push(ev(`2026-01-05T${hh}:00:00Z`, 2400, 'code'));
    activeEvents.push(ev(`2026-01-05T${hh}:40:00Z`, 600, 'slack'));
    activeEvents.push(ev(`2026-01-05T${hh}:50:00Z`, 300, 'yt'));
    afkEvents.push(ev(`2026-01-05T${hh}:00:00Z`, 3300, 'afk-watcher'));
    afkEvents.push(ev(`2026-01-05T${hh}:55:00Z`, 300, 'afk-watcher'));
  }
  const r = range('2026-01-05T09:00:00Z', '2026-01-05T17:00:00Z');

  let m: Metrics;
  beforeAll(() => {
    m = computeMetrics(activeEvents, afkEvents, [], classifier, r, OPTS);
  });

  test('duration sums', () => {
    expect(m.totalActiveDuration).toBe(26400);
    expect(m.focusTime).toBe(19200);
    expect(m.operationalTime).toBe(4800);
    expect(m.distractedDuration).toBe(2400);
    expect(m.uncategorizedLeakage).toBe(0);
  });

  test('ratios', () => {
    expect(m.utilizationRate).toBeCloseTo((100 * 26400) / 28800, 10); // 91.666...
    expect(m.distractionRatio).toBeCloseTo(100 / 11, 10); // 9.0909...
  });

  test('streak metrics', () => {
    expect(m.attentionSpanAverage).toBe(2400); // 8 focus streaks of 2400s
    expect(m.microDistractionCount).toBe(0); // all distraction streaks are 300s
  });

  test('context switches: 2 per hour + 7 hour-crossing D→F', () => {
    expect(m.contextSwitchCount).toBe(23);
    expect(m.contextSwitchesPerHour[9]).toBe(2);
    for (let h = 10; h < 17; h++) {
      expect(m.contextSwitchesPerHour[h]).toBe(3);
    }
  });

  test('peak distraction hour is first argmax on ties', () => {
    expect(m.peakDistractionHour).toBe(9);
  });

  test('golden hours ranked by focusSec/(1+switches), stable on ties', () => {
    expect(m.cognitiveGoldenHours).toEqual([
      { hour: 9, score: 800, focusSeconds: 2400, switches: 2 },
      { hour: 10, score: 600, focusSeconds: 2400, switches: 3 },
      { hour: 11, score: 600, focusSeconds: 2400, switches: 3 },
    ]);
  });

  test('fatigue velocity is 0 for constant distraction', () => {
    expect(m.fatigueVelocity).toBeCloseTo(0, 10);
  });

  test('normalized focus score', () => {
    const fr = 19200 / 26400;
    const dr = 2400 / 26400;
    const sr = 23 / (26400 / 3600);
    const raw = fr - 0.6 * dr - 0.3 * Math.min(sr / 30, 1);
    expect(m.normalizedFocusScore).toBeCloseTo(10 * raw, 10); // ≈ 6.41363636
  });

  test('chrono timeline: steady hourly breakdown with 300s idle', () => {
    for (let h = 9; h < 17; h++) {
      expect(m.chronoTimeline[h]).toEqual({
        hour: h,
        focus: 2400,
        operational: 600,
        distracted: 300,
        uncategorized: 0,
        idle: 300, // wallclock 3600 − active 3300
      });
    }
    expect(m.chronoTimeline[8].idle).toBe(0);
  });

  test('value drainers aggregate visits across the day', () => {
    expect(m.valueDrainers).toEqual([
      { app: 'yt', totalDuration: 2400, visitCount: 8, avgStay: 300 },
    ]);
  });

  test('empty web events → empty sinkhole', () => {
    expect(m.contentSinkhole).toEqual({ name: 'root', children: [] });
  });

  test('no NaN/Infinity anywhere', () => {
    assertAllFinite(m);
  });
});

describe('computeMetrics — edge cases', () => {
  const emptyRange = range('2026-01-05T08:00:00Z', '2026-01-05T08:00:00Z');
  const normalRange = range('2026-01-05T08:00:00Z', '2026-01-05T09:00:00Z');

  test('empty range with no events: all zeros, no NaN/Infinity', () => {
    const m = computeMetrics([], [], [], classifier, emptyRange, OPTS);
    expect(m.totalActiveDuration).toBe(0);
    expect(m.utilizationRate).toBe(0);
    expect(m.distractionRatio).toBe(0);
    expect(m.attentionSpanAverage).toBe(0);
    expect(m.contextSwitchCount).toBe(0);
    expect(m.microDistractionCount).toBe(0);
    expect(m.peakDistractionHour).toBeNull();
    expect(m.cognitiveGoldenHours).toEqual([]);
    expect(m.fatigueVelocity).toBe(0);
    expect(m.normalizedFocusScore).toBe(0);
    expect(m.valueDrainers).toEqual([]);
    assertAllFinite(m);
  });

  test('all-AFK (zero active time, AFK events present): no NaN/Infinity, idle accrues', () => {
    const afk = [ev('2026-01-05T08:00:00Z', 3600, 'afk-watcher')];
    const m = computeMetrics([], afk, [], classifier, normalRange, OPTS);
    expect(m.totalActiveDuration).toBe(0);
    expect(m.utilizationRate).toBe(0);
    expect(m.distractionRatio).toBe(0);
    expect(m.normalizedFocusScore).toBe(0);
    expect(m.chronoTimeline[8].idle).toBe(3600);
    assertAllFinite(m);
  });

  test('single focus event', () => {
    const m = computeMetrics(
      [ev('2026-01-05T08:10:00Z', 600, 'code')],
      [],
      [],
      classifier,
      normalRange,
      OPTS
    );
    expect(m.totalActiveDuration).toBe(600);
    expect(m.focusTime).toBe(600);
    expect(m.utilizationRate).toBeCloseTo((100 * 600) / 3600, 10);
    expect(m.contextSwitchCount).toBe(0);
    expect(m.attentionSpanAverage).toBe(600);
    expect(m.cognitiveGoldenHours).toEqual([
      { hour: 8, score: 600, focusSeconds: 600, switches: 0 },
    ]);
    expect(m.fatigueVelocity).toBe(0); // single active hour → fewer than 2 points
    expect(m.normalizedFocusScore).toBe(10); // focusRatio 1, no distraction, no switches
    assertAllFinite(m);
  });

  test('no matching category rules: everything uncategorized', () => {
    const uncat: Classifier = () => 'uncategorized';
    const m = computeMetrics(
      [ev('2026-01-05T08:00:00Z', 1200, 'a'), ev('2026-01-05T08:20:00Z', 600, 'b')],
      [],
      [],
      uncat,
      normalRange,
      OPTS
    );
    expect(m.uncategorizedLeakage).toBe(1800);
    expect(m.focusTime).toBe(0);
    expect(m.contextSwitchCount).toBe(0); // same class throughout
    expect(m.normalizedFocusScore).toBe(0);
    expect(m.valueDrainers).toEqual([]);
    assertAllFinite(m);
  });

  test('web events with unparseable urls fall back to "unknown" domain', () => {
    const m = computeMetrics(
      [],
      [],
      [ev('2026-01-05T08:00:00Z', 100, 'browser', 'Mystery', 'not a url')],
      classifier,
      normalRange,
      OPTS
    );
    expect(m.contentSinkhole.children).toEqual([
      { name: 'unknown', children: [{ name: 'Mystery', value: 100 }] },
    ]);
  });

  test('events outside the range are excluded from binned metrics', () => {
    // Event entirely before the range: contributes to duration sums (caller is
    // expected to fetch range-scoped events) but never to hour bins after clipping.
    const m = computeMetrics(
      [ev('2026-01-05T06:00:00Z', 600, 'code')],
      [],
      [],
      classifier,
      normalRange,
      OPTS
    );
    expect(m.chronoTimeline.every(b => b.focus === 0)).toBe(true);
    assertAllFinite(m);
  });
});

describe('dataQuality guard', () => {
  const r = range('2026-01-05T08:00:00Z', '2026-01-05T09:00:00Z');

  // Builds a 1000s-total active event set with an exact uncategorized fraction,
  // so uncategorizedRatio lands on a precise, predictable value.
  function fixtureWithUncategorizedRatio(ratio: number) {
    const uncategorizedSec = Math.round(1000 * ratio);
    const focusSec = 1000 - uncategorizedSec;
    const events: NormalizedEvent[] = [];
    if (focusSec > 0) events.push(ev('2026-01-05T08:00:00Z', focusSec, 'code'));
    if (uncategorizedSec > 0) {
      events.push(ev('2026-01-05T08:00:00Z', uncategorizedSec, 'other'));
    }
    return events;
  }

  test('exactly at the threshold (0.4) is still sufficient', () => {
    const m = computeMetrics(fixtureWithUncategorizedRatio(0.4), [], [], classifier, r, OPTS);
    expect(m.dataQuality.uncategorizedRatio).toBeCloseTo(MAX_UNCATEGORIZED_RATIO_FOR_SCORE, 10);
    expect(m.dataQuality.sufficientForScore).toBe(true);
  });

  test('just above the threshold is insufficient', () => {
    const m = computeMetrics(fixtureWithUncategorizedRatio(0.41), [], [], classifier, r, OPTS);
    expect(m.dataQuality.uncategorizedRatio).toBeGreaterThan(MAX_UNCATEGORIZED_RATIO_FOR_SCORE);
    expect(m.dataQuality.sufficientForScore).toBe(false);
  });

  test('just below the threshold is sufficient', () => {
    const m = computeMetrics(fixtureWithUncategorizedRatio(0.39), [], [], classifier, r, OPTS);
    expect(m.dataQuality.uncategorizedRatio).toBeLessThan(MAX_UNCATEGORIZED_RATIO_FOR_SCORE);
    expect(m.dataQuality.sufficientForScore).toBe(true);
  });

  test('fully categorized data is always sufficient', () => {
    const m = computeMetrics(fixtureWithUncategorizedRatio(0), [], [], classifier, r, OPTS);
    expect(m.dataQuality.uncategorizedRatio).toBe(0);
    expect(m.dataQuality.sufficientForScore).toBe(true);
  });

  test('fully uncategorized data is always insufficient', () => {
    const m = computeMetrics(fixtureWithUncategorizedRatio(1), [], [], classifier, r, OPTS);
    expect(m.dataQuality.uncategorizedRatio).toBe(1);
    expect(m.dataQuality.sufficientForScore).toBe(false);
  });
});

describe('computeUnclassifiedSummary', () => {
  test('ranks apps by total duration descending, uncategorized only', () => {
    const events = [
      ev('2026-01-05T08:00:00Z', 100, 'code'), // focus, excluded
      ev('2026-01-05T08:00:00Z', 50, 'unknown-app-a'),
      ev('2026-01-05T08:01:00Z', 200, 'unknown-app-b'),
      ev('2026-01-05T08:02:00Z', 30, 'unknown-app-a'), // accumulates with the 50s above
    ];
    const result = computeUnclassifiedSummary(events, [], classifier);
    expect(result).toEqual([
      { name: 'unknown-app-b', kind: 'app', totalDuration: 200 },
      { name: 'unknown-app-a', kind: 'app', totalDuration: 80 },
    ]);
  });

  test('extracts domain from web event urls, uncategorized only', () => {
    const webEvents = [
      ev('2026-01-05T08:00:00Z', 300, 'browser', 'Video', 'https://www.youtube.com/watch?v=1'),
      ev('2026-01-05T08:05:00Z', 100, 'browser', 'Video 2', 'https://www.youtube.com/watch?v=2'),
      ev('2026-01-05T08:10:00Z', 50, 'browser', 'Repo', 'https://github.com/foo'), // matches 'code' classifier? no
    ];
    // classifier here only recognizes app-level 'code'/'slack'/'yt'; none of these
    // app values match, so title is checked too — none match 'code'/'slack'/'yt' either.
    const result = computeUnclassifiedSummary([], webEvents, classifier);
    expect(result).toEqual([
      { name: 'www.youtube.com', kind: 'domain', totalDuration: 400 },
      { name: 'github.com', kind: 'domain', totalDuration: 50 },
    ]);
  });

  test('combines app and domain entries into one ranking', () => {
    const active = [ev('2026-01-05T08:00:00Z', 500, 'obscure-app')];
    const web = [
      ev('2026-01-05T08:00:00Z', 900, 'browser', 'x', 'https://reddit.com/r/foo'),
    ];
    const result = computeUnclassifiedSummary(active, web, classifier);
    expect(result).toEqual([
      { name: 'reddit.com', kind: 'domain', totalDuration: 900 },
      { name: 'obscure-app', kind: 'app', totalDuration: 500 },
    ]);
  });

  test('respects topN and returns fewer if there are fewer entries', () => {
    const active = [
      ev('2026-01-05T08:00:00Z', 10, 'app-a'),
      ev('2026-01-05T08:01:00Z', 20, 'app-b'),
      ev('2026-01-05T08:02:00Z', 30, 'app-c'),
    ];
    expect(computeUnclassifiedSummary(active, [], classifier, 2)).toHaveLength(2);
    expect(computeUnclassifiedSummary(active, [], classifier, 10)).toHaveLength(3);
  });

  test('classified (non-uncategorized) events are excluded entirely', () => {
    const active = [ev('2026-01-05T08:00:00Z', 100, 'code'), ev('2026-01-05T08:00:00Z', 100, 'slack')];
    expect(computeUnclassifiedSummary(active, [], classifier)).toEqual([]);
  });

  test('empty input returns empty list, no NaN/Infinity', () => {
    expect(computeUnclassifiedSummary([], [], classifier)).toEqual([]);
  });
});
