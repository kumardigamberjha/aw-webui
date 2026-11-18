import { Category } from '~/util/classes';
import { NormalizedEvent, computeMetrics, MetricsRange } from '~/util/metrics';
import { makeClassifier } from '~/util/metricsClassifier';
import {
  AiClassificationConfig,
  AiTitleResult,
  buildAiTitleCategories,
  checkOllamaReachable,
  defaultAiClassificationConfig,
  runAiClassificationBatch,
} from '~/util/aiClassification';

function webEv(startIso: string, durationSec: number, title: string, url: string): NormalizedEvent {
  const start = new Date(startIso).valueOf();
  return { start, end: start + durationSec * 1000, duration: durationSec, app: '', title, url };
}

function config(overrides: Partial<AiClassificationConfig> = {}): AiClassificationConfig {
  return { ...defaultAiClassificationConfig, enabled: true, ...overrides };
}

/** Builds a fetch mock for /api/generate that returns a fixed `response` string. */
function mockOllamaResponse(responseText: string): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ response: responseText }),
  });
}

/** Builds a fetch mock that returns one `response` string per call, in order. */
function mockOllamaSequence(responses: string[]): jest.Mock {
  let i = 0;
  return jest.fn().mockImplementation(async () => {
    const responseText = responses[Math.min(i, responses.length - 1)];
    i++;
    return { ok: true, status: 200, json: async () => ({ response: responseText }) };
  });
}

describe('defaultAiClassificationConfig', () => {
  test('disabled by default, seeded with youtube.com', () => {
    expect(defaultAiClassificationConfig.enabled).toBe(false);
    expect(defaultAiClassificationConfig.ambiguousDomains).toEqual(['youtube.com']);
    expect(defaultAiClassificationConfig.ollamaEndpoint).toBe('http://localhost:11434');
    expect(defaultAiClassificationConfig.model).toBe('qwen2.5:latest');
  });
});

describe('buildAiTitleCategories', () => {
  test('builds an aiTitle Category with source: ai for each result', () => {
    const results: AiTitleResult[] = [{ title: 'learn rust in 30 minutes', class: 'focus' }];
    const cats = buildAiTitleCategories(results);
    expect(cats).toEqual([
      {
        name: ['AI Classified', 'learn rust in 30 minutes'],
        rule: { type: 'aiTitle', pattern: 'learn rust in 30 minutes' },
        data: { class: 'focus', source: 'ai' },
      },
    ]);
  });
});

describe('runAiClassificationBatch', () => {
  test('skips entirely when disabled, without calling fetch', async () => {
    const fetchImpl = jest.fn();
    const events = [
      webEv('2026-01-01T10:00:00Z', 60, 'Some Video', 'https://youtube.com/watch?v=1'),
    ];
    const result = await runAiClassificationBatch(
      events,
      [],
      config({ enabled: false }),
      fetchImpl
    );
    expect(result).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('skips when there are no candidate titles (no events on an ambiguous domain)', async () => {
    const fetchImpl = jest.fn();
    const events = [webEv('2026-01-01T10:00:00Z', 60, 'Some Video', 'https://vimeo.com/watch?v=1')];
    const result = await runAiClassificationBatch(events, [], config(), fetchImpl);
    expect(result).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('skips titles already covered by an existing app/domain regex rule', async () => {
    const fetchImpl = jest.fn();
    const categories: Category[] = [
      {
        name: ['YouTube'],
        rule: { type: 'regex', regex: 'YouTube' },
        data: { class: 'distraction' },
      },
    ];
    const events = [
      webEv(
        '2026-01-01T10:00:00Z',
        60,
        'Some Coding Tutorial - YouTube',
        'https://youtube.com/watch?v=1'
      ),
    ];
    const result = await runAiClassificationBatch(events, categories, config(), fetchImpl);
    expect(result).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('skips titles already covered by an existing aiTitle rule, including user-overridden ones', async () => {
    const fetchImpl = jest.fn();
    const categories: Category[] = [
      {
        name: ['AI Classified', 'cat compilation'],
        rule: { type: 'aiTitle', pattern: 'cat compilation' },
        // source: 'user' — a prior AI guess the user corrected. Must still be
        // excluded from re-classification, same as a fresh 'ai'-sourced entry.
        data: { class: 'focus', source: 'user' },
      },
    ];
    const events = [
      webEv('2026-01-01T10:00:00Z', 60, 'Cat Compilation', 'https://youtube.com/watch?v=2'),
    ];
    const result = await runAiClassificationBatch(events, categories, config(), fetchImpl);
    expect(result).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('dedupes multiple intervals with the same normalized title into a single classification', async () => {
    const fetchImpl = mockOllamaResponse('{"class": "distraction"}');
    const events = [
      webEv('2026-01-01T10:00:00Z', 60, 'Cat Compilation', 'https://youtube.com/watch?v=3'),
      webEv('2026-01-01T10:05:00Z', 30, '  cat   compilation  ', 'https://youtube.com/watch?v=3'),
      webEv('2026-01-01T10:10:00Z', 45, 'CAT COMPILATION', 'https://youtube.com/watch?v=3'),
    ];
    const result = await runAiClassificationBatch(events, [], config(), fetchImpl);
    expect(result).toEqual([{ title: 'cat compilation', class: 'distraction' }]);
    // Batch attempt (rejected, wrong shape for a 3-title array vs 1-title
    // response) + exactly one per-title fallback call for the single deduped title.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test('drops a title on malformed JSON response, without throwing', async () => {
    const fetchImpl = mockOllamaResponse('not valid json{{{');
    const events = [
      webEv('2026-01-01T10:00:00Z', 60, 'Some Video', 'https://youtube.com/watch?v=4'),
    ];
    const result = await runAiClassificationBatch(events, [], config(), fetchImpl);
    expect(result).toEqual([]);
  });

  test('drops a title with an unexpected class value, without throwing', async () => {
    const fetchImpl = mockOllamaResponse('{"class": "very-focused-indeed"}');
    const events = [
      webEv('2026-01-01T10:00:00Z', 60, 'Some Video', 'https://youtube.com/watch?v=5'),
    ];
    const result = await runAiClassificationBatch(events, [], config(), fetchImpl);
    expect(result).toEqual([]);
  });

  test('drops a title on an empty response, without throwing', async () => {
    const fetchImpl = mockOllamaResponse('');
    const events = [
      webEv('2026-01-01T10:00:00Z', 60, 'Some Video', 'https://youtube.com/watch?v=6'),
    ];
    const result = await runAiClassificationBatch(events, [], config(), fetchImpl);
    expect(result).toEqual([]);
  });

  test('falls back to one call per title when the batch call degrades (wrong length/shape)', async () => {
    // First call (batch) returns a single object instead of an array covering
    // all titles — this is the exact degradation observed from a real local
    // qwen2.5:latest model when asked to batch multiple titles. Subsequent
    // (per-title) calls return well-formed single objects.
    const fetchImpl = mockOllamaSequence([
      '{"title": "video a", "class": "focus"}',
      '{"class": "focus"}',
      '{"class": "distraction"}',
    ]);
    const events = [
      webEv('2026-01-01T10:00:00Z', 60, 'Video A', 'https://youtube.com/watch?v=a'),
      webEv('2026-01-01T10:05:00Z', 60, 'Video B', 'https://youtube.com/watch?v=b'),
    ];
    const result = await runAiClassificationBatch(events, [], config(), fetchImpl);
    expect(result.sort((a, b) => a.title.localeCompare(b.title))).toEqual([
      { title: 'video a', class: 'focus' },
      { title: 'video b', class: 'distraction' },
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 1 failed batch attempt + 2 per-title
  });

  test('succeeds via a single batch call when the model returns a well-formed same-length array', async () => {
    const fetchImpl = mockOllamaResponse(
      JSON.stringify([
        { title: 'video a', class: 'focus' },
        { title: 'video b', class: 'distraction' },
      ])
    );
    const events = [
      webEv('2026-01-01T10:00:00Z', 60, 'Video A', 'https://youtube.com/watch?v=a'),
      webEv('2026-01-01T10:05:00Z', 60, 'Video B', 'https://youtube.com/watch?v=b'),
    ];
    const result = await runAiClassificationBatch(events, [], config(), fetchImpl);
    expect(result.sort((a, b) => a.title.localeCompare(b.title))).toEqual([
      { title: 'video a', class: 'focus' },
      { title: 'video b', class: 'distraction' },
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('skips silently (returns []) when the Ollama endpoint is unreachable', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const events = [
      webEv('2026-01-01T10:00:00Z', 60, 'Some Video', 'https://youtube.com/watch?v=7'),
    ];
    await expect(runAiClassificationBatch(events, [], config(), fetchImpl)).resolves.toEqual([]);
  });

  test('skips silently (returns []) when Ollama responds with a non-2xx status', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    const events = [
      webEv('2026-01-01T10:00:00Z', 60, 'Some Video', 'https://youtube.com/watch?v=8'),
    ];
    await expect(runAiClassificationBatch(events, [], config(), fetchImpl)).resolves.toEqual([]);
  });

  test('ambiguousDomains matching is case-insensitive', async () => {
    const fetchImpl = mockOllamaResponse('{"class": "focus"}');
    const events = [
      webEv('2026-01-01T10:00:00Z', 60, 'Some Video', 'https://YouTube.com/watch?v=9'),
    ];
    const result = await runAiClassificationBatch(events, [], config(), fetchImpl);
    expect(result).toEqual([{ title: 'some video', class: 'focus' }]);
  });
});

describe('checkOllamaReachable', () => {
  test('true when /api/tags responds ok', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true });
    expect(await checkOllamaReachable(config(), fetchImpl)).toBe(true);
  });

  test('false on network error', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await checkOllamaReachable(config(), fetchImpl)).toBe(false);
  });

  test('false on non-ok response', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false });
    expect(await checkOllamaReachable(config(), fetchImpl)).toBe(false);
  });
});

describe('full pipeline: batch job → aiTitle rules → classifier → computeMetrics', () => {
  test('Focus Time / Distracted Duration reflect the mocked Ollama classifications', async () => {
    const range: MetricsRange = {
      start: new Date('2026-01-01T00:00:00Z'),
      end: new Date('2026-01-02T00:00:00Z'),
    };

    const webEvents = [
      webEv(
        '2026-01-01T10:00:00Z',
        300,
        'Learn Rust in 30 Minutes',
        'https://youtube.com/watch?v=focus'
      ),
      webEv(
        '2026-01-01T11:00:00Z',
        120,
        'Cat Falls Off Couch #47',
        'https://youtube.com/watch?v=distraction'
      ),
    ];

    const fetchImpl = mockOllamaSequence([
      // Batch attempt (2 titles) degrades to a single object → triggers fallback.
      '{"class": "focus"}',
      // Per-title fallback, in the order titles are encountered.
      '{"class": "focus"}',
      '{"class": "distraction"}',
    ]);

    const results = await runAiClassificationBatch(webEvents, [], config(), fetchImpl);
    const aiCategories = buildAiTitleCategories(results);
    const classifier = makeClassifier(aiCategories);

    // computeMetrics only classifies activeEvents today (see metrics.ts), so we
    // feed the same normalized web events in as the "active" set for this
    // end-to-end check of the classifier's output on them.
    const metrics = computeMetrics(webEvents, [], webEvents, classifier, range, {
      utcOffsetMinutes: 0,
    });

    expect(metrics.focusTime).toBe(300);
    expect(metrics.distractedDuration).toBe(120);
  });
});
