// Regression test for the exact bug: the Productivity Dashboard classifier
// showed most activity as Uncategorized despite matching category rules
// existing, because a first-match-wins-by-array-order classifier let broad,
// unclassed legacy categories shadow more specific, correctly classed ones.
// Runs the real live category tree (fixture) through the real migration, then
// the real classifier — end to end, no mocking.
import { NormalizedEvent } from '~/util/metrics';
import { makeClassifier } from '~/util/metricsClassifier';
import { migrateLeafClasses } from '~/util/categoryClassMigration';
import { liveDefaultCategorySet } from './fixtures/defaultCategorySet';

function ev(app: string, title = '', url?: string): NormalizedEvent {
  return { start: 0, end: 0, duration: 60, app, title, url };
}

describe('classifier regression — live default category set, post-migration', () => {
  const categories = migrateLeafClasses(liveDefaultCategorySet);
  const classify = makeClassifier(categories);

  test('antigravity resolves to focus (via Work > Programming > Editors & IDEs)', () => {
    expect(classify(ev('antigravity'))).toBe('focus');
  });

  test('a Brave window titled "... - YouTube - Brave" resolves to distraction, with no url at all', () => {
    const event = ev('brave-browser', 'Some Coding Tutorial - YouTube - Brave');
    expect(event.url).toBeUndefined();
    expect(classify(event)).toBe('distraction');
  });

  test('vim resolves to focus (Terminals & Shells, not shadowed by the unclassed Work > Programming ancestor)', () => {
    expect(classify(ev('vim'))).toBe('focus');
  });

  test(
    'antigravity with a title containing "aw-" still resolves to focus, not shadowed by the ' +
      'unclassed same-depth "ActivityWatch" sibling category (regex `ActivityWatch|aw-`) — a real ' +
      'case found via live verification: a window titled "... - aw-watcher.py" ties in depth with ' +
      '"Editors & IDEs" and would otherwise silently lose to the unclassed one',
    () => {
      expect(classify(ev('antigravity', 'Solo Leveling - Antigravity - aw-watcher.py'))).toBe('focus');
    }
  );
});
