// Bridges the repo's category rules (src/util/classes.ts) to the dashboard's
// four event classes. Pure module: no Vue/store/API imports — callers pass the
// (already loaded/merged) category list in.

import { Category } from '~/util/classes';
import { Classifier, EventClass, NormalizedEvent } from '~/util/metrics';

const LEVEL_SEP = '>';

/**
 * Maps a category (by `>`-joined name path or any prefix of it) to an event class.
 * Deepest matching prefix wins, so e.g. 'Work>Meetings' can override 'Work'.
 */
export type CategoryClassMapping = Record<string, EventClass>;

// --- TUNABLE CLASS MAPPING -------------------------------------------------
// Keyed to the repo's default category tree (classes.ts defaultCategories).
// Users with custom category sets should extend/override this mapping.
export const DEFAULT_CATEGORY_CLASS_MAPPING: CategoryClassMapping = {
  Work: 'focus',
  Comms: 'operational',
  Media: 'distraction',
  Uncategorized: 'uncategorized',
};
/** Class for events whose matched category has no entry in the mapping. */
export const UNMAPPED_CATEGORY_CLASS: EventClass = 'operational';
// ---------------------------------------------------------------------------

/** Resolve a category name path to a class via its deepest mapped prefix. */
export function classForCategory(
  name: string[],
  mapping: CategoryClassMapping = DEFAULT_CATEGORY_CLASS_MAPPING
): EventClass {
  for (let depth = name.length; depth >= 1; depth--) {
    const key = name.slice(0, depth).join(LEVEL_SEP);
    if (key in mapping) {
      return mapping[key];
    }
  }
  return UNMAPPED_CATEGORY_CLASS;
}

/**
 * Build a Classifier from category regex rules.
 *
 * Matching mirrors classes.ts classifyEvents: a category matches when its regex
 * tests true against the event's app or title; when several match, the deepest
 * category wins. Events with no matching rule are 'uncategorized'.
 * Regexes are compiled once here (matchString recompiles per call, which is too
 * slow for thousands of events).
 */
export function makeClassifier(
  categories: Category[],
  mapping: CategoryClassMapping = DEFAULT_CATEGORY_CLASS_MAPPING
): Classifier {
  const regexes: [Category, RegExp][] = categories
    .filter(c => c.rule && c.rule.type === 'regex' && c.rule.regex)
    .map(c => {
      // 'm' flag so `$` and `^` in rules work per-line, as in classes.ts matchString
      const re = RegExp(c.rule.regex, (c.rule.ignore_case ? 'i' : '') + 'm');
      return [c, re];
    });

  return (event: NormalizedEvent): EventClass => {
    let deepest: Category | null = null;
    for (const [cat, re] of regexes) {
      if (re.test(event.app) || re.test(event.title)) {
        if (!deepest || cat.name.length > deepest.name.length) {
          deepest = cat;
        }
      }
    }
    if (!deepest) {
      return 'uncategorized';
    }
    return classForCategory(deepest.name, mapping);
  };
}
