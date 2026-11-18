import * as classes from '~/util/classes';
import { IEvent } from '~/util/interfaces';
import { Category } from '~/util/classes';

const testClasses: Category[] = [
  { name: ['Test', 'Subtest'], rule: { type: 'regex', regex: 'subtest' } },
  { name: ['Test', 'Subtest', 'Subsubtest'], rule: { type: 'regex', regex: 'subsubtest' } },
];

test('correctly builds hierarchy', () => {
  const result = classes.build_category_hierarchy(testClasses);
  expect(result).toHaveLength(1);
  const cat_root = result[0];
  expect(cat_root.subname).toEqual('Test');
  expect(cat_root.children).toHaveLength(1);
  expect(result[0].children[0].children).toHaveLength(1);
});

test('correctly flatten hierarchy', () => {
  const result = classes.flatten_category_hierarchy(classes.build_category_hierarchy(testClasses));
  expect(result).toHaveLength(3);
});

test('matches string to category', () => {
  const cat = classes.matchString('subsubtest', testClasses);
  expect(cat).toEqual(testClasses[1]);
});

test('matches events to category', () => {
  let events: IEvent[] = [
    { timestamp: new Date().toISOString(), duration: 0, data: { title: 'subsubtest' } },
    { timestamp: new Date().toISOString(), duration: 0, data: { title: 'subtest' } },
    { timestamp: new Date().toISOString(), duration: 0, data: { title: 'no matching' } },
  ];
  events = classes.classifyEvents(events, testClasses);
  expect(events[0].data.$category).toEqual(testClasses[1].name);
  expect(events[1].data.$category).toEqual(testClasses[0].name);
  expect(events[2].data.$category).toEqual(['Uncategorized']);
});

test('data.class survives cleanCategory and a JSON export/import round-trip', () => {
  const cat: Category = {
    id: 5,
    name: ['Slack'],
    rule: { type: 'regex', regex: 'Slack', ignore_case: true },
    data: { color: '#c98500', class: 'operational' },
    // Fields cleanCategory should strip
    children: [],
    parent: [],
    subname: 'Slack',
    name_pretty: 'Slack',
    depth: 0,
  };

  const cleaned = classes.cleanCategory(cat);
  expect(cleaned.data.class).toBe('operational');
  expect(cleaned.children).toBeUndefined();

  // Simulate the export-to-file / import-from-file round trip (JSON.stringify
  // for download, JSON.parse on re-upload) that CategorizationSettings.vue does.
  const roundTripped = JSON.parse(JSON.stringify(cleaned));
  expect(roundTripped.data.class).toBe('operational');
  expect(roundTripped.rule.regex).toBe('Slack');
  expect(roundTripped.name).toEqual(['Slack']);
});

test('a category with no class set round-trips as unset (not coerced to a default)', () => {
  const cat: Category = {
    name: ['Unclassified App'],
    rule: { type: 'regex', regex: 'foo' },
    data: { color: '#000000' },
  };
  const roundTripped = JSON.parse(JSON.stringify(classes.cleanCategory(cat)));
  expect(roundTripped.data.class).toBeUndefined();
});
