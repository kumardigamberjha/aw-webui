// Optional local-LLM classification tier for ambiguous domains (e.g. youtube.com),
// where the app/domain alone can't tell focus from distraction — the video title
// is what actually distinguishes "Learn Rust in 30 Minutes" from "Cat compilation #47".
//
// This module is entirely separate from the classifyInterval/computeMetrics
// pipeline (src/util/metrics.ts, src/util/metricsClassifier.ts), which stays
// synchronous and pure. Everything here is async, IO-bound (talks to a local
// Ollama server), and produces plain data: a batch job that turns unclassified
// ambiguous-domain titles into 'aiTitle' Category rules, which the classifier
// then reads back as a cache — it never calls Ollama itself.
//
// Disabled by default (aiClassification.enabled = false in settings), so cloning
// the repo without Ollama running is unaffected: runAiClassificationBatch()
// short-circuits to [] before touching the network.

import { Category } from '~/util/classes';
import { EventClass, NormalizedEvent, parseDomain } from '~/util/metrics';
import { makeClassifier, normalizeTitle } from '~/util/metricsClassifier';

export interface AiClassificationConfig {
  enabled: boolean;
  ambiguousDomains: string[];
  ollamaEndpoint: string;
  model: string;
}

export const defaultAiClassificationConfig: AiClassificationConfig = {
  enabled: false,
  ambiguousDomains: ['youtube.com'],
  ollamaEndpoint: 'http://localhost:11434',
  model: 'qwen2.5:latest',
};

const VALID_CLASSES: Array<'focus' | 'operational' | 'distraction'> = [
  'focus',
  'operational',
  'distraction',
];

function isValidClass(x: unknown): x is 'focus' | 'operational' | 'distraction' {
  return typeof x === 'string' && (VALID_CLASSES as string[]).includes(x);
}

export interface AiTitleResult {
  /** Already normalizeTitle()-d — this is what gets stored as the aiTitle rule's pattern. */
  title: string;
  class: 'focus' | 'operational' | 'distraction';
}

type FetchFn = typeof fetch;

const SINGLE_SYSTEM_PROMPT =
  'You classify a browser tab title into exactly one of three productivity ' +
  'classes: "focus" (work, learning, or skill-building content), "operational" ' +
  '(routine tasks, logistics, or communication), or "distraction" (entertainment ' +
  'or leisure content). Respond with ONLY a JSON object with exactly one key ' +
  '"class" whose value is one of "focus", "operational", "distraction". No other text.';

const BATCH_SYSTEM_PROMPT =
  'You classify browser tab titles into exactly one of three productivity ' +
  'classes: "focus" (work, learning, or skill-building content), "operational" ' +
  '(routine tasks, logistics, or communication), or "distraction" (entertainment ' +
  'or leisure content). You will be given a JSON array of titles. Respond with ' +
  'ONLY a JSON array with exactly one entry per input title, in the same order, ' +
  'each an object with exactly two keys: "title" (the exact input title, ' +
  'unchanged) and "class" (one of "focus", "operational", "distraction"). No other text.';

async function ollamaGenerate(
  config: AiClassificationConfig,
  system: string,
  userPrompt: string,
  fetchImpl: FetchFn
): Promise<unknown> {
  const res = await fetchImpl(`${config.ollamaEndpoint}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      format: 'json',
      stream: false,
      options: { temperature: 0 },
      system,
      prompt: userPrompt,
    }),
  });
  if (!res.ok) {
    throw new Error(`Ollama responded with status ${res.status}`);
  }
  const data = await res.json();
  return JSON.parse(data.response);
}

/** Classify a single title. Returns null (never throws) on any malformed/unexpected response. */
async function classifyTitleSingle(
  title: string,
  config: AiClassificationConfig,
  fetchImpl: FetchFn
): Promise<AiTitleResult | null> {
  try {
    const parsed = await ollamaGenerate(
      config,
      SINGLE_SYSTEM_PROMPT,
      `Title: ${JSON.stringify(title)}`,
      fetchImpl
    );
    if (parsed && typeof parsed === 'object' && isValidClass((parsed as any).class)) {
      return { title, class: (parsed as any).class };
    }
  } catch (e) {
    // malformed JSON, unexpected shape, network error mid-call — drop this title
  }
  return null;
}

/**
 * Attempt to classify every title in a single call. Returns null (rather than a
 * partial result) if the response isn't a well-formed same-length array covering
 * every input title — that's treated as "the model degraded on batching" and
 * signals the caller to fall back to one call per title.
 */
async function classifyTitlesBatch(
  titles: string[],
  config: AiClassificationConfig,
  fetchImpl: FetchFn
): Promise<AiTitleResult[] | null> {
  try {
    const parsed = await ollamaGenerate(
      config,
      BATCH_SYSTEM_PROMPT,
      JSON.stringify(titles),
      fetchImpl
    );
    if (!Array.isArray(parsed) || parsed.length !== titles.length) {
      return null;
    }
    const remaining = new Set(titles);
    const results: AiTitleResult[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object' || !isValidClass((item as any).class)) {
        return null;
      }
      const title = normalizeTitle(String((item as any).title ?? ''));
      if (!remaining.has(title)) {
        return null;
      }
      remaining.delete(title);
      results.push({ title, class: (item as any).class });
    }
    return remaining.size === 0 ? results : null;
  } catch (e) {
    return null;
  }
}

/**
 * Batch classification job. Runs before computeMetrics, not inside it — this is
 * the only place in the AI tier that touches the network.
 *
 * Soft-fails to [] (no throw, nothing surfaced to the metrics pipeline) whenever
 * there's nothing useful to do: disabled, no candidate titles, or Ollama
 * unreachable/erroring. Callers should treat every returned title as validated
 * and ready to persist as an 'aiTitle' rule.
 */
export async function runAiClassificationBatch(
  webEvents: NormalizedEvent[],
  categories: Category[],
  config: AiClassificationConfig,
  fetchImpl: FetchFn = fetch
): Promise<AiTitleResult[]> {
  if (!config.enabled) {
    return [];
  }

  const ambiguousDomains = new Set(config.ambiguousDomains.map(d => d.toLowerCase()));
  if (ambiguousDomains.size === 0) {
    return [];
  }

  // Reuses the real classifier so "already covered by an app/domain/aiTitle
  // rule" is a single source of truth instead of a second matching logic.
  const classifier = makeClassifier(categories);

  const candidateTitles = new Set<string>();
  for (const e of webEvents) {
    if (!ambiguousDomains.has(parseDomain(e.url).toLowerCase())) {
      continue;
    }
    if (!e.title) {
      continue;
    }
    if (classifier(e) !== ('uncategorized' as EventClass)) {
      continue;
    }
    const normalized = normalizeTitle(e.title);
    if (normalized) {
      candidateTitles.add(normalized);
    }
  }

  if (candidateTitles.size === 0) {
    return [];
  }

  const titles = Array.from(candidateTitles);

  try {
    const batchResult = await classifyTitlesBatch(titles, config, fetchImpl);
    if (batchResult) {
      return batchResult;
    }
    // Batch degraded (wrong shape/length) — fall back to one call per title.
    const results: AiTitleResult[] = [];
    for (const title of titles) {
      const result = await classifyTitleSingle(title, config, fetchImpl);
      if (result) {
        results.push(result);
      }
    }
    return results;
  } catch (e) {
    // Endpoint unreachable or other unexpected failure — soft skip, no error
    // surfaced. Those intervals simply fall through to uncategorized as normal.
    return [];
  }
}

/** Lightweight reachability check for the Settings UI's inline warning (not used by the batch job itself). */
export async function checkOllamaReachable(
  config: AiClassificationConfig,
  fetchImpl: FetchFn = fetch
): Promise<boolean> {
  try {
    const res = await fetchImpl(`${config.ollamaEndpoint}/api/tags`);
    return res.ok;
  } catch (e) {
    return false;
  }
}

/**
 * Turn validated AI results into 'aiTitle' Category rules ready to hand to
 * categoryStore.addClass()/save(). Pure — does not touch any store itself, so
 * it stays unit-testable without Pinia.
 */
export function buildAiTitleCategories(results: AiTitleResult[]): Category[] {
  return results.map(r => ({
    name: ['AI Classified', r.title],
    rule: { type: 'aiTitle', pattern: r.title },
    data: { class: r.class, source: 'ai' },
  }));
}
