// Bridges the repo's category rules (src/util/classes.ts) to the dashboard's
// four event classes. Pure module: no Vue/store/API imports — callers pass the
// (already loaded/merged) category list in.
//
// Matching reuses classes.ts's own matchString() (deepest-matching-category-
// wins, by name-path length) — the same function category color
// (src/util/color.ts) and the Timeline category filter already use. An
// earlier version of this file rolled its own first-match-wins-by-array-order
// matcher instead; that let broad, unclassed legacy categories (e.g.
// "Work > Programming") "claim" events ahead of more specific, correctly
// classed children (e.g. "Work > Programming > Repos & Debugging") whenever
// the broad one happened to be stored first — the actual cause of the
// dashboard showing most activity as Uncategorized despite matching rules
// existing. Reusing matchString's deepest-wins semantics means the more
// specific (and therefore more likely to carry the intended class) category
// always wins regardless of storage order.
//
// Same-depth ties still need a class-aware tie-break on top of matchString
// (see matchStringPreferringClassed below) — e.g. a real observed case where
// "Work > Programming > ActivityWatch" (regex `ActivityWatch|aw-`, no class)
// and "Work > Programming > Editors & IDEs" (class: focus) both matched a
// window titled "... - aw-watcher.py", at equal depth; matchString's own
// tie-break (first in array order) has no reason to prefer the classed one.

import { Category, matchString } from '~/util/classes';
import { Classifier, EventClass, NormalizedEvent, parseDomain } from '~/util/metrics';

const VALID_CLASSES: EventClass[] = ['focus', 'operational', 'distraction'];

/**
 * trim, lowercase, collapse whitespace — the exact-match key for 'aiTitle'
 * rules (src/util/aiClassification.ts). Lives here (not in aiClassification.ts)
 * so the batch job can import it from the classifier module without creating
 * a circular dependency (aiClassification.ts already imports makeClassifier).
 */
export function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Reads the class a category was assigned in the rule editor, or null if unset. */
export function categoryClass(cat: Category): EventClass | null {
  const raw = cat.data && (cat.data as { class?: unknown }).class;
  return VALID_CLASSES.includes(raw as EventClass) ? (raw as EventClass) : null;
}

/**
 * matchString(), reused as-is for "deepest category wins." But two categories
 * can genuinely tie in depth — e.g. a broad legacy category like
 * "Work > Programming > ActivityWatch" (regex `ActivityWatch|aw-`, no class)
 * matching alongside "Work > Programming > Editors & IDEs" (class: focus) on
 * a title that happens to contain "aw-" (a real observed case: a window
 * titled "... - aw-watcher.py"). matchString's own tie-break (first in array
 * order) doesn't know or care about `class`, so it can hand back the unclassed
 * one — reproducing the exact shadowing bug this rewrite exists to fix, just
 * between two same-depth siblings instead of parent/child.
 *
 * This wrapper keeps matchString as the sole source of "what's the deepest
 * match," but among same-depth ties prefers whichever match actually has a
 * class set — trying again with the unclassed one removed, as long as the
 * next result is still at the same depth. Falls through to the unclassed
 * match (and 'uncategorized') only when no same-depth classed alternative
 * exists, preserving the "matched but unclassed is terminal" behavior.
 */
function matchStringPreferringClassed(str: string, categories: Category[]): Category | null {
  let candidates = categories;
  let chosen = matchString(str, candidates);
  while (chosen && categoryClass(chosen) === null) {
    const remaining = candidates.filter(c => c !== chosen);
    const next = matchString(str, remaining);
    if (!next || next.name.length !== chosen.name.length) {
      break;
    }
    candidates = remaining;
    chosen = next;
  }
  return chosen;
}

/**
 * Build a Classifier from the category tree.
 *
 * Three tiers, checked in order:
 *   1. Title tier — matchString(app + '\n' + title, categories): the same
 *      concatenation convention as color.ts's getCategorizationStringFromEvent,
 *      so a category's regex can match on either the app name or the window/
 *      tab title. Works with zero dependency on a web-watcher bucket — a
 *      browser window's title alone (e.g. "... - YouTube - Brave") is enough,
 *      no `url` required.
 *   2. Domain tier (enhancement) — when the event has a `url`, also try
 *      matchString(parseDomain(url), categories). If it matches a category at
 *      least as deep/specific as the title tier's match (or the title tier
 *      didn't match at all), the domain match wins: an actual navigated URL is
 *      a more authoritative signal than title text, which can be truncated,
 *      generic, or ambiguous.
 *   3. aiTitle tier (fallback) — an exact-match cache keyed by
 *      normalizeTitle(title), populated by the batch job in
 *      aiClassification.ts. matchString only understands rule.type ===
 *      'regex', so these entries are invisible to it and get their own small
 *      lookup here; still reads from the same `categories` array, no separate
 *      store. Only consulted when neither regex tier matched anything.
 * No match at any tier, or a match whose category has no (or an invalid)
 * `data.class` → 'uncategorized'. A matching category with no class set is
 * terminal — it does not fall through to the next tier — since it represents
 * a deliberate "this activity is categorized, just not yet classified for the
 * dashboard" state, not "no match."
 */
export function makeClassifier(categories: Category[]): Classifier {
  const aiTitleCache = new Map<string, EventClass | null>();
  for (const c of categories) {
    if (
      c.rule &&
      c.rule.type === 'aiTitle' &&
      c.rule.pattern &&
      !aiTitleCache.has(c.rule.pattern)
    ) {
      aiTitleCache.set(c.rule.pattern, categoryClass(c));
    }
  }

  return (event: NormalizedEvent): EventClass => {
    const titleCat = matchStringPreferringClassed(event.app + '\n' + event.title, categories);
    const domainCat = event.url ? matchStringPreferringClassed(parseDomain(event.url), categories) : null;

    const chosen =
      domainCat && (!titleCat || domainCat.name.length >= titleCat.name.length)
        ? domainCat
        : titleCat;
    if (chosen) {
      return categoryClass(chosen) || 'uncategorized';
    }

    if (aiTitleCache.size > 0) {
      const cls = aiTitleCache.get(normalizeTitle(event.title));
      if (cls !== undefined) {
        return cls || 'uncategorized';
      }
    }
    return 'uncategorized';
  };
}
