import { Category } from '~/util/classes';
import { NormalizedEvent } from '~/util/metrics';
import { categoryClass, makeClassifier } from '~/util/metricsClassifier';

function ev(app: string, title = '', url?: string): NormalizedEvent {
  return { start: 0, end: 0, duration: 0, app, title, url };
}

function cat(
  name: string | string[],
  regex: string,
  cls: 'focus' | 'operational' | 'distraction' | null,
  opts: { ignore_case?: boolean } = {}
): Category {
  return {
    name: Array.isArray(name) ? name : [name],
    rule: { type: 'regex', regex, ignore_case: opts.ignore_case },
    data: cls ? { class: cls } : {},
  };
}

describe('categoryClass', () => {
  test('reads a valid class from data.class', () => {
    expect(categoryClass(cat('Slack', 'Slack', 'operational'))).toBe('operational');
  });

  test('null when data.class is absent', () => {
    expect(categoryClass({ name: ['X'], rule: { type: 'regex', regex: 'x' } })).toBeNull();
  });

  test('null when data.class holds an unrecognized value (e.g. stale/corrupt data)', () => {
    expect(
      categoryClass({ name: ['X'], rule: { type: 'regex', regex: 'x' }, data: { class: 'bogus' } })
    ).toBeNull();
  });
});

describe('makeClassifier', () => {
  test('exact-ish match via regex assigns the rule class', () => {
    const classify = makeClassifier([cat('VS Code', 'Visual Studio Code', 'focus')]);
    expect(classify(ev('Visual Studio Code'))).toBe('focus');
  });

  test('regex match (not just exact string) assigns the rule class', () => {
    const classify = makeClassifier([cat('YouTube', 'YouTube', 'distraction')]);
    expect(classify(ev('firefox', 'Rick Astley - YouTube'))).toBe('distraction');
  });

  test('deepest matching category wins, regardless of storage order — a leaf beats its unclassed ancestor', () => {
    const leaf = cat(['Work', 'Programming', 'Repos & Debugging'], 'github|gitlab', 'focus');
    const ancestor = cat(['Work', 'Programming'], 'github|vim', null);
    // leaf stored after ancestor
    expect(makeClassifier([ancestor, leaf])(ev('firefox', 'some github repo'))).toBe('focus');
    // leaf stored before ancestor — same result, order must not matter
    expect(makeClassifier([leaf, ancestor])(ev('firefox', 'some github repo'))).toBe('focus');
  });

  test('a broader unclassed category does not shadow a deeper classed one it also happens to match', () => {
    const classify = makeClassifier([
      cat(['Work', 'Programming'], 'vim', null),
      cat(['Work', 'Programming', 'Terminals & Shells'], 'terminal|tmux|nvim|vim', 'focus'),
    ]);
    expect(classify(ev('vim'))).toBe('focus');
  });

  test('same-depth tie: prefers the classed category over an unclassed sibling that also matches', () => {
    const classify = makeClassifier([
      cat(['Work', 'Programming', 'ActivityWatch'], 'ActivityWatch|aw-', null, { ignore_case: true }),
      cat(['Work', 'Programming', 'Editors & IDEs'], 'antigravity', 'focus'),
    ]);
    // "aw-watcher.py" in the title matches the unclassed ActivityWatch
    // category; "antigravity" in the app matches the classed Editors & IDEs
    // category. Both are depth 3 — the classed one must win the tie.
    expect(classify(ev('antigravity', 'Solo Leveling - Antigravity - aw-watcher.py'))).toBe('focus');
  });

  test('same-depth tie with no classed alternative → falls through to uncategorized as before', () => {
    const classify = makeClassifier([
      cat(['Work', 'A'], 'foo', null),
      cat(['Work', 'B'], 'bar', null),
    ]);
    expect(classify(ev('foobar'))).toBe('uncategorized');
  });

  test('no matching rule → uncategorized', () => {
    expect(makeClassifier([cat('Slack', 'Slack', 'operational')])(ev('some-random-app'))).toBe(
      'uncategorized'
    );
    expect(makeClassifier([])(ev('anything'))).toBe('uncategorized');
  });

  test('a matching rule with no class set (data.class unset) → uncategorized, does not fall through', () => {
    const classify = makeClassifier([cat('Slack', 'Slack', null)]);
    expect(classify(ev('Slack'))).toBe('uncategorized');
  });

  test('matches on title when app does not match', () => {
    const classify = makeClassifier([cat('GitHub', 'GitHub', 'focus')]);
    expect(classify(ev('firefox', 'GitHub - some repo'))).toBe('focus');
  });

  test('title-regex match works with no url field at all (no web-watcher bucket present)', () => {
    const classify = makeClassifier([cat('Video', 'YouTube|Plex|VLC', 'distraction')]);
    const event = ev('brave-browser', 'Some Video - YouTube - Brave');
    expect(event.url).toBeUndefined();
    expect(classify(event)).toBe('distraction');
  });

  test('respects ignore_case on rules', () => {
    const classify = makeClassifier([
      cat('Reddit', 'Reddit', 'distraction', { ignore_case: true }),
    ]);
    expect(classify(ev('REDDIT'))).toBe('distraction');
    expect(
      makeClassifier([cat('Reddit', 'Reddit', 'distraction', { ignore_case: false })])(ev('REDDIT'))
    ).toBe('uncategorized');
  });

  test('non-regex rules never match', () => {
    const cats: Category[] = [
      { name: ['Media'], rule: { type: 'none' }, data: { class: 'distraction' } },
    ];
    expect(makeClassifier(cats)(ev('anything'))).toBe('uncategorized');
  });

  describe('domain tier', () => {
    test('domain match is used when there is no title match', () => {
      const classify = makeClassifier([cat('Streaming', 'youtube\\.com', 'distraction')]);
      expect(classify(ev('', 'some ambiguous title', 'https://youtube.com/watch?v=1'))).toBe(
        'distraction'
      );
    });

    test('domain tier overrides title tier when the domain match is deeper/equal', () => {
      const classify = makeClassifier([
        cat(['Media', 'Generic'], 'browser', 'operational'), // depth 2, title-tier match
        cat(['Media', 'Generic', 'Streaming'], 'youtube\\.com', 'distraction'), // depth 3, domain-tier match
      ]);
      expect(classify(ev('browser', 'a browser tab', 'https://youtube.com/watch?v=1'))).toBe(
        'distraction'
      );
    });

    test('title tier wins when the domain match is shallower than the title match', () => {
      const classify = makeClassifier([
        cat(['Media'], 'youtube\\.com', 'operational'), // depth 1, domain-tier match
        cat(['Media', 'Video'], 'YouTube', 'distraction'), // depth 2, title-tier match
      ]);
      expect(classify(ev('browser', 'Some Video - YouTube', 'https://youtube.com/watch?v=1'))).toBe(
        'distraction'
      );
    });

    test('title tier is used when the url does not match any domain-tier category', () => {
      const classify = makeClassifier([cat('Video', 'YouTube', 'distraction')]);
      expect(classify(ev('browser', 'Some Video - YouTube', 'https://example.org/'))).toBe(
        'distraction'
      );
    });
  });

  describe('aiTitle tier', () => {
    function aiCat(
      pattern: string,
      cls: 'focus' | 'operational' | 'distraction' | null,
      source: 'ai' | 'user' = 'ai'
    ): Category {
      return {
        name: ['AI Classified', pattern],
        rule: { type: 'aiTitle', pattern },
        data: cls ? { class: cls, source } : { source },
      };
    }

    test('aiTitle cache hit is used when no regex rule matches', () => {
      const classify = makeClassifier([aiCat('cat falls off couch #47', 'distraction')]);
      expect(classify(ev('firefox', 'cat falls off couch #47'))).toBe('distraction');
    });

    test('normalizeTitle matching is whitespace/case-insensitive at lookup time', () => {
      const classify = makeClassifier([aiCat('learn rust in 30 minutes', 'focus')]);
      expect(classify(ev('firefox', '  Learn   Rust in 30 Minutes  '))).toBe('focus');
    });

    test('an app/title regex rule always wins over an aiTitle cache entry for the same event', () => {
      const classify = makeClassifier([
        cat('YouTube', 'YouTube', 'distraction'),
        aiCat('learn rust in 30 minutes', 'focus'),
      ]);
      // Title contains "YouTube" so the regex rule claims it first, even though
      // the aiTitle cache has a (contradictory) 'focus' entry for this exact title.
      expect(classify(ev('firefox', 'Learn Rust in 30 Minutes - YouTube'))).toBe('distraction');
    });

    test('no matching regex or aiTitle entry → uncategorized', () => {
      const classify = makeClassifier([aiCat('some other video', 'focus')]);
      expect(classify(ev('firefox', 'learn rust in 30 minutes'))).toBe('uncategorized');
    });

    test('an aiTitle rule with no class set → uncategorized (claims but does not fall through further)', () => {
      const classify = makeClassifier([aiCat('some video', null)]);
      expect(classify(ev('firefox', 'some video'))).toBe('uncategorized');
    });
  });
});
