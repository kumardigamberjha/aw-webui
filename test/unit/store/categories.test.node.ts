import { isEqual } from 'lodash';
import { setActivePinia, createPinia } from 'pinia';

import { useCategoryStore } from '~/stores/categories';
import { useSettingsStore } from '~/stores/settings';
import { createMissingParents, defaultCategories, Category } from '~/util/classes';

describe('categories store', () => {
  setActivePinia(createPinia());
  const categoryStore = useCategoryStore();

  beforeEach(() => {
    categoryStore.clearAll();
  });

  test('loads default categories', () => {
    // Load categories
    expect(categoryStore.classes).toHaveLength(0);
    categoryStore.restoreDefaultClasses();

    expect(categoryStore.classes_unsaved_changes).toBeTruthy();
    categoryStore.save();

    expect(categoryStore.classes_unsaved_changes).toBeFalsy();
    expect(categoryStore.classes).not.toHaveLength(0);

    // Retrieve class
    let workCat = categoryStore.get_category(['Work']);
    expect(workCat).not.toBeUndefined();
    workCat = JSON.parse(JSON.stringify(workCat)); // copy

    // Modify class
    const newRegex = 'Just testing';
    workCat.rule.regex = newRegex;
    categoryStore.updateClass(workCat);
    expect(categoryStore.get_category(['Work']).rule.regex).toEqual(newRegex);

    // Check that getters behave somewhat
    expect(categoryStore.all_categories).not.toHaveLength(0);
    expect(categoryStore.classes_hierarchy).not.toHaveLength(0);
  });

  test('loads custom categories', () => {
    expect(categoryStore.classes).toHaveLength(0);
    categoryStore.load([{ name: ['Test'], rule: { type: 'none' } }]);
    expect(categoryStore.all_categories).toHaveLength(1);
  });

  test('get category hierarchy', () => {
    categoryStore.restoreDefaultClasses();
    const hier = categoryStore.classes_hierarchy;
    expect(hier).not.toHaveLength(0);
  });

  test('create missing parents', () => {
    const cats = createMissingParents([
      { name: ['Test', 'Subcat'], rule: { type: 'regex', regex: 'test' } },
    ]);
    expect(cats).toHaveLength(2);
  });

  test('update implicit parent category', () => {
    // The default categories have implicit Media and Comms categories (with 'No Rule')
    // Tests against https://github.com/ActivityWatch/activitywatch/issues/580
    categoryStore.restoreDefaultClasses();

    // Check that the label is available
    expect(categoryStore.all_categories).toContainEqual(['Media']);

    // Get category and modify it
    const media_cat: Category = categoryStore.get_category(['Media']);
    expect(media_cat.id).not.toBeUndefined();
    const new_media_cat = { ...media_cat, name: ['Media2'], data: { test: true } };
    categoryStore.updateClass(new_media_cat);

    // Check that category was modified correctly
    const media2_cat: Category = categoryStore.get_category(['Media2']);
    expect(media2_cat.data.test).toBe(true);

    // Check that child was modified correctly when parent name changed
    const music_cat = categoryStore.get_category(['Media2', 'Music']);
    expect(music_cat.id).not.toBeUndefined();

    // Check that defaultCategories haven't mutated
    expect(defaultCategories.map(c => c.name)).toContainEqual(['Media', 'Music']);
  });

  test('modify a category after deleting another', () => {
    // Deleting a category, then modifying another with an ID subsequent to it, should not
    // cause the changes to be applied to unintended classes.
    // Test against:
    // https://github.com/ActivityWatch/activitywatch/issues/361#issuecomment-970707045
    categoryStore.restoreDefaultClasses();

    // Check that Image category is available
    expect(categoryStore.all_categories).toContainEqual(['Work', 'Image']);

    // Delete Image category
    const image_cat = categoryStore.get_category(['Work', 'Image']);
    const image_cat_id = image_cat.id;
    expect(image_cat_id).not.toBeUndefined();
    categoryStore.removeClass(image_cat_id);

    // Check that Image category no longer exists
    expect(categoryStore.all_categories).not.toContainEqual(['Work', 'Image']);

    // Get Video category (whose ID succeeds to that of Image) and modify it
    const video_cat: Category = categoryStore.get_category(['Work', 'Video']);
    const video_cat_id = video_cat.id;
    expect(video_cat_id).not.toBeUndefined();
    expect(video_cat_id).toBeGreaterThan(image_cat_id);
    const new_video_cat: Category = {
      ...video_cat,
      name: ['Work', 'Video2'],
      data: { test: true },
    };
    categoryStore.updateClass(new_video_cat);

    // Check that modification on Video was applied
    const video_2_cat = categoryStore.get_category_by_id(video_cat_id);
    expect(video_2_cat.data.test).toBe(true);

    // Check that the category named "Video" no longer exists, and the category named "Video2" exists
    expect(categoryStore.all_categories.filter(c => isEqual(c, ['Work', 'Video']))).toHaveLength(0);
    expect(categoryStore.all_categories.filter(c => isEqual(c, ['Work', 'Video2']))).toHaveLength(
      1
    );
  });

  test('get_category_color decodes URL-encoded category segments', () => {
    categoryStore.load([
      {
        name: ['Work Project'],
        rule: { type: 'regex', regex: 'work-project' },
        data: { color: '#123456' },
      } as Category,
    ]);

    const decoded = categoryStore.get_category_color(['Work Project']);
    const encoded = categoryStore.get_category_color(['Work%20Project']);

    expect(decoded).toEqual('#123456');
    expect(encoded).toEqual('#123456');
  });

  test('get_category_score decodes URL-encoded category segments', () => {
    categoryStore.load([
      {
        name: ['Work Project'],
        rule: { type: 'regex', regex: 'work-project' },
        data: { score: 42 },
      } as Category,
    ]);

    const decoded = categoryStore.get_category_score(['Work Project']);
    const encoded = categoryStore.get_category_score(['Work%20Project']);

    expect(decoded).toEqual(42);
    expect(encoded).toEqual(42);
  });

  describe('classRules / moveClassRule', () => {
    test('classRules is flat and only includes regex rules, in classes order', () => {
      categoryStore.load([
        { name: ['A'], rule: { type: 'regex', regex: 'a' } },
        { name: ['Group'], rule: { type: 'none' } },
        { name: ['Group', 'B'], rule: { type: 'regex', regex: 'b' } },
      ]);
      expect(categoryStore.classRules.map(c => c.name)).toEqual([['A'], ['Group', 'B']]);
    });

    test('moveClassRule swaps a rule with its adjacent sibling in the same set', () => {
      categoryStore.category_sets = [
        {
          id: 'default',
          categories: [
            { name: ['First'], rule: { type: 'regex', regex: 'a' } },
            { name: ['Second'], rule: { type: 'regex', regex: 'b' } },
          ],
        },
      ];
      categoryStore.active_set_ids = ['default'];
      categoryStore.classes = categoryStore.category_sets[0].categories.map((c, i) => ({
        ...c,
        id: i,
      }));

      categoryStore.moveClassRule(['Second'], 'up');

      expect(categoryStore.category_sets[0].categories.map(c => c.name)).toEqual([
        ['Second'],
        ['First'],
      ]);
      expect(categoryStore.classes_unsaved_changes).toBe(true);
    });

    test('moveClassRule is a no-op at the top of the list', () => {
      categoryStore.category_sets = [
        {
          id: 'default',
          categories: [
            { name: ['First'], rule: { type: 'regex', regex: 'a' } },
            { name: ['Second'], rule: { type: 'regex', regex: 'b' } },
          ],
        },
      ];
      categoryStore.active_set_ids = ['default'];
      categoryStore.classes = categoryStore.category_sets[0].categories.map((c, i) => ({
        ...c,
        id: i,
      }));

      categoryStore.moveClassRule(['First'], 'up');

      expect(categoryStore.category_sets[0].categories.map(c => c.name)).toEqual([
        ['First'],
        ['Second'],
      ]);
    });
  });

  describe('ensureLeafClassMigration', () => {
    const settingsStore = useSettingsStore();

    beforeEach(() => {
      jest.restoreAllMocks();
      settingsStore.$patch({ leaf_class_migration_applied: false });
      categoryStore.category_sets = [];
      categoryStore.active_set_ids = ['default'];
      jest.spyOn(settingsStore, 'ensureLoaded').mockResolvedValue(undefined);
      jest.spyOn(settingsStore, 'update').mockImplementation(async (patch: Record<string, any>) => {
        settingsStore.$patch(patch);
      });
      jest.spyOn(categoryStore, 'save').mockReturnValue(undefined);
    });

    test('runs once and applies the mapping to matching leaves in the primary set', async () => {
      categoryStore.category_sets = [
        {
          id: 'default',
          categories: [
            { name: ['Work', 'Chat & Messaging'], rule: { type: 'regex', regex: 'slack' } },
            { name: ['Media', 'Video'], rule: { type: 'regex', regex: 'YouTube' } },
          ],
        },
      ];
      categoryStore.active_set_ids = ['default'];
      categoryStore.classes = categoryStore.category_sets[0].categories.map((c, i) => ({
        ...c,
        id: i,
      }));

      await categoryStore.ensureLeafClassMigration();

      const chat = categoryStore.classes.find(c => c.name.join('') === 'WorkChat & Messaging');
      const video = categoryStore.classes.find(c => c.name.join('') === 'MediaVideo');
      expect(chat?.data?.class).toBe('operational');
      expect(video?.data?.class).toBe('distraction');
      expect(settingsStore.leaf_class_migration_applied).toBe(true);
    });

    test('second call is a no-op (guard respected) — does not re-apply over a later user edit', async () => {
      categoryStore.category_sets = [
        {
          id: 'default',
          categories: [{ name: ['Media', 'Video'], rule: { type: 'regex', regex: 'YouTube' } }],
        },
      ];
      categoryStore.active_set_ids = ['default'];
      categoryStore.classes = categoryStore.category_sets[0].categories.map((c, i) => ({
        ...c,
        id: i,
      }));

      await categoryStore.ensureLeafClassMigration();
      expect(categoryStore.classes.find(c => c.name.join('') === 'MediaVideo')?.data?.class).toBe(
        'distraction'
      );

      // User deliberately unsets the class afterward.
      const videoId = categoryStore.classes.find(c => c.name.join('') === 'MediaVideo').id;
      categoryStore.updateClass({
        id: videoId,
        name: ['Media', 'Video'],
        rule: { type: 'regex', regex: 'YouTube' },
        data: {},
      });
      expect(
        categoryStore.classes.find(c => c.name.join('') === 'MediaVideo')?.data?.class
      ).toBeUndefined();

      // Simulate a later app load: settings still say the migration already ran.
      await categoryStore.ensureLeafClassMigration();

      expect(
        categoryStore.classes.find(c => c.name.join('') === 'MediaVideo')?.data?.class
      ).toBeUndefined();
    });

    test('prunes an orphaned, inactive "Focus" CategorySet', async () => {
      categoryStore.category_sets = [
        { id: 'default', categories: [] },
        { id: 'Focus', categories: [{ name: ['X'], rule: { type: 'none' } }] },
      ];
      categoryStore.active_set_ids = ['default'];
      categoryStore.classes = [];

      await categoryStore.ensureLeafClassMigration();

      expect(categoryStore.category_sets.map(s => s.id)).toEqual(['default']);
    });

    test('preserves a custom inactive set that is not literally named "Focus"', async () => {
      categoryStore.category_sets = [
        { id: 'default', categories: [] },
        { id: 'personal', categories: [] },
      ];
      categoryStore.active_set_ids = ['default'];
      categoryStore.classes = [];

      await categoryStore.ensureLeafClassMigration();

      expect(categoryStore.category_sets.map(s => s.id)).toEqual(['default', 'personal']);
    });
  });
});
