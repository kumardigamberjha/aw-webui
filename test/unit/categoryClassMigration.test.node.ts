import _ from 'lodash';
import { Category, CategorySet } from '~/util/classes';
import {
  LEAF_CLASS_MAPPING,
  migrateLeafClasses,
  pruneOrphanedFocusSet,
} from '~/util/categoryClassMigration';
import { liveDefaultCategorySet } from './fixtures/defaultCategorySet';

function classOf(categories: Category[], name: string[]): string | undefined {
  const cat = categories.find(c => _.isEqual(c.name, name));
  return cat && cat.data && cat.data.class;
}

describe('migrateLeafClasses — before/after on the live default category set', () => {
  const before = liveDefaultCategorySet;
  const after = migrateLeafClasses(before);

  test('before: reproduces the live bug data exactly (sanity check on the fixture itself)', () => {
    expect(classOf(before, ['Work', 'Programming', 'Editors & IDEs'])).toBe('focus');
    expect(classOf(before, ['Media', 'Video'])).toBeUndefined();
    expect(classOf(before, ['Work', 'Document Viewers'])).toBe('focus');
    expect(classOf(before, ['Work', 'Drafting Tools'])).toBe('focus');
    expect(classOf(before, ['Work', 'Project Management'])).toBe('focus');
  });

  describe('after: mapping applied per group', () => {
    test.each([
      ['Work', 'Programming', 'Editors & IDEs'],
      ['Work', 'Programming', 'Terminals & Shells'],
      ['Work', 'Programming', 'Repos & Debugging'],
      ['Work', 'Programming', 'Local Dev & APIs'],
    ])('%s > %s > %s -> focus', (...path) => {
      expect(classOf(after, path)).toBe('focus');
    });

    test.each([
      ['Work', 'Chat & Messaging'],
      ['Work', 'Emails'],
      ['Work', 'Meetings & Video'],
      ['Work', 'Project Management'],
      ['Work', 'Scheduling'],
      ['Work', 'Office Suite'],
      ['Comms', 'IM'],
      ['Comms', 'Email'],
    ])('%s > %s -> operational', (...path) => {
      expect(classOf(after, path)).toBe('operational');
    });

    test.each([
      ['Media', 'Games'],
      ['Media', 'Video'],
      ['Media', 'Social Media'],
      ['Media', 'Music'],
    ])('%s > %s -> distraction', (...path) => {
      expect(classOf(after, path)).toBe('distraction');
    });
  });

  test('nulls stay/become null: Document Viewers and Drafting Tools corrected from live focus -> unset', () => {
    expect(classOf(after, ['Work', 'Document Viewers'])).toBeUndefined();
    expect(classOf(after, ['Work', 'Drafting Tools'])).toBeUndefined();
  });

  test('nulls stay null: Image, Audio, 3D never get a class', () => {
    expect(classOf(after, ['Work', 'Image'])).toBeUndefined();
    expect(classOf(after, ['Work', 'Audio'])).toBeUndefined();
    expect(classOf(after, ['Work', '3D'])).toBeUndefined();
  });

  test('correction: Project Management goes from live focus -> operational', () => {
    expect(classOf(before, ['Work', 'Project Management'])).toBe('focus');
    expect(classOf(after, ['Work', 'Project Management'])).toBe('operational');
  });

  test('unmapped categories are byte-for-byte untouched', () => {
    const unmappedNames = [
      ['Work'],
      ['Work', 'Programming'],
      ['Work', 'Programming', 'ActivityWatch'],
      ['Work', 'Video'],
      ['Media'],
      ['Media', 'Video & Media Streaming'],
      ['Media', 'Shopping & E-Commerce'],
      ['Media', 'Games', 'Gaming & Casual Breaks'],
      ['Comms'],
      ['Uncategorized'],
      ['System Tools'],
    ];
    for (const name of unmappedNames) {
      const beforeCat = before.find(c => _.isEqual(c.name, name));
      const afterCat = after.find(c => _.isEqual(c.name, name));
      expect(afterCat).toEqual(beforeCat);
    }
  });

  test('idempotent: running it twice produces the same result as running it once', () => {
    const twice = migrateLeafClasses(after);
    expect(twice).toEqual(after);
  });

  test('purity: does not mutate the input array or its objects', () => {
    const snapshot = _.cloneDeep(liveDefaultCategorySet);
    migrateLeafClasses(liveDefaultCategorySet);
    expect(liveDefaultCategorySet).toEqual(snapshot);
  });

  test(
    'every mapping entry is covered by exactly one category in the fixture (guards against a typo' +
      ' in the mapping table silently matching nothing)',
    () => {
      for (const entry of LEAF_CLASS_MAPPING) {
        const found = before.find(c => _.isEqual(c.name, entry.path));
        expect(found).toBeDefined();
      }
    }
  );
});

describe('pruneOrphanedFocusSet', () => {
  const defaultSet: CategorySet = { id: 'default', categories: [] };
  const orphanedFocusSet: CategorySet = {
    id: 'Focus',
    categories: [{ name: ['X'], rule: { type: 'none' } }],
  };
  const customInactiveSet: CategorySet = { id: 'personal', categories: [] };

  test('removes an inactive set with id "Focus"', () => {
    const result = pruneOrphanedFocusSet([defaultSet, orphanedFocusSet], ['default']);
    expect(result).toEqual([defaultSet]);
  });

  test('preserves other inactive sets (not literally named "Focus")', () => {
    const result = pruneOrphanedFocusSet([defaultSet, customInactiveSet], ['default']);
    expect(result).toEqual([defaultSet, customInactiveSet]);
  });

  test('preserves a set named "Focus" if it is actually active', () => {
    const result = pruneOrphanedFocusSet([defaultSet, orphanedFocusSet], ['default', 'Focus']);
    expect(result).toEqual([defaultSet, orphanedFocusSet]);
  });

  test('no-op when there is no "Focus" set at all', () => {
    const result = pruneOrphanedFocusSet([defaultSet, customInactiveSet], ['default']);
    expect(result).toEqual([defaultSet, customInactiveSet]);
  });
});
