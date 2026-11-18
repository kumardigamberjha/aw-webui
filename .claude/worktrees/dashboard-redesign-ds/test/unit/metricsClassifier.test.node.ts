import { Category, defaultCategories } from '~/util/classes';
import { NormalizedEvent } from '~/util/metrics';
import {
  DEFAULT_CATEGORY_CLASS_MAPPING,
  UNMAPPED_CATEGORY_CLASS,
  classForCategory,
  makeClassifier,
} from '~/util/metricsClassifier';

function ev(app: string, title = ''): NormalizedEvent {
  return { start: 0, end: 0, duration: 0, app, title };
}

describe('classForCategory', () => {
  test('maps top-level categories via default mapping', () => {
    expect(classForCategory(['Work'])).toBe('focus');
    expect(classForCategory(['Comms'])).toBe('operational');
    expect(classForCategory(['Media'])).toBe('distraction');
  });

  test('subcategories inherit their nearest mapped ancestor', () => {
    expect(classForCategory(['Work', 'Programming', 'ActivityWatch'])).toBe('focus');
    expect(classForCategory(['Media', 'Social Media'])).toBe('distraction');
  });

  test('deepest mapped prefix wins', () => {
    const mapping = { ...DEFAULT_CATEGORY_CLASS_MAPPING, 'Work>Meetings': 'operational' as const };
    expect(classForCategory(['Work', 'Meetings'], mapping)).toBe('operational');
    expect(classForCategory(['Work', 'Programming'], mapping)).toBe('focus');
  });

  test('unmapped category falls back to UNMAPPED_CATEGORY_CLASS', () => {
    expect(classForCategory(['SomethingElse'])).toBe(UNMAPPED_CATEGORY_CLASS);
  });
});

describe('makeClassifier', () => {
  const classify = makeClassifier(defaultCategories);

  test('classifies by app using repo default category rules', () => {
    expect(classify(ev('Spotify'))).toBe('distraction'); // Media>Music
    expect(classify(ev('Telegram'))).toBe('operational'); // Comms>IM
    expect(classify(ev('GIMP'))).toBe('focus'); // Work>Image
  });

  test('classifies by title too (same semantics as classifyEvents)', () => {
    expect(classify(ev('firefox', 'GitHub - some repo'))).toBe('focus'); // Work>Programming
    expect(classify(ev('firefox', 'YouTube'))).toBe('distraction'); // Media>Video
  });

  test('deepest matching category wins', () => {
    // Matches Work ('ReText'? no) — 'aw-webui' matches Work>Programming>ActivityWatch (deepest)
    expect(classify(ev('code', 'aw-webui — main.ts'))).toBe('focus');
  });

  test('respects ignore_case on rules', () => {
    expect(classify(ev('REDDIT'))).toBe('distraction'); // Media>Social Media, ignore_case
  });

  test('no matching rule → uncategorized', () => {
    expect(classify(ev('some-random-app', 'nothing special'))).toBe('uncategorized');
    expect(makeClassifier([])(ev('Spotify'))).toBe('uncategorized');
  });

  test('non-regex rules never match', () => {
    const cats: Category[] = [{ name: ['Media'], rule: { type: 'none' } }];
    expect(makeClassifier(cats)(ev('anything'))).toBe('uncategorized');
  });
});
