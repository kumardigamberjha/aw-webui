import { dashboardQuery } from '~/queries';

const baseParams = {
  bid_window: 'aw-watcher-window_myhost',
  bid_afk: 'aw-watcher-afk_myhost',
  categories: [],
  filter_categories: [],
  filter_afk: true,
};

test('builds active/afk/web query without browser buckets', () => {
  const lines = dashboardQuery({ ...baseParams, bid_browsers: [] });
  const q = lines.join('\n');
  expect(q).toContain('events = flood(query_bucket("aw-watcher-window_myhost"));');
  expect(q).toContain('afk_events = flood(query_bucket("aw-watcher-afk_myhost"));');
  expect(q).toContain('not_afk = filter_keyvals(afk_events, "status", ["not-afk"]);');
  expect(q).toContain('active_events = filter_period_intersect(events, not_afk);');
  expect(q).toContain('browser_events = [];');
  expect(q).toContain(
    'RETURN = {"active_events": active_events, "afk_events": afk_events, "web_events": browser_events};'
  );
});

test('includes browser bucket handling when browser buckets are present', () => {
  const lines = dashboardQuery({
    ...baseParams,
    bid_browsers: ['aw-watcher-web-firefox_myhost'],
  });
  const q = lines.join('\n');
  expect(q).toContain('query_bucket("aw-watcher-web-firefox_myhost")');
  expect(q).toContain('split_url_events');
  expect(q).toContain('browser_events = concat(browser_events, events_firefox);');
});

test('uses find_bucket for partial bucket ids (unknown hostname)', () => {
  const q = dashboardQuery({
    ...baseParams,
    bid_window: 'aw-watcher-window_',
    bid_afk: 'aw-watcher-afk_',
  }).join('\n');
  expect(q).toContain('query_bucket(find_bucket("aw-watcher-window_"))');
  expect(q).toContain('query_bucket(find_bucket("aw-watcher-afk_"))');
});
