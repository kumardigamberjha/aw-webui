// One-time reconciliation of Focus Insights `data.class` assignments onto the
// user's EXISTING category tree, plus removal of a genuinely orphaned,
// inactive CategorySet discovered while investigating why the Productivity
// Dashboard showed most activity as Uncategorized.
//
// This is not a new/separate rule store: it edits `data.class` in place on
// the exact same Category objects the tree UI (CategoryEditModal.vue) and the
// Focus Insights rule table (CategorizationSettings.vue) already read/write.
// Pure and side-effect free — no Vue/Pinia/API imports — so it's testable
// against a plain fixture and safe to run against a real, possibly
// user-customized tree without surprises.

import _ from 'lodash';
import { Category, CategorySet } from '~/util/classes';
import { EventClass } from '~/util/metrics';

export interface LeafClassMapping {
  path: string[];
  /** null = explicitly unset — never auto-assigned a class, left for the user to decide. */
  class: EventClass | null;
}

export const LEAF_CLASS_MAPPING: LeafClassMapping[] = [
  // focus
  { path: ['Work', 'Programming', 'Editors & IDEs'], class: 'focus' },
  { path: ['Work', 'Programming', 'Terminals & Shells'], class: 'focus' },
  { path: ['Work', 'Programming', 'Repos & Debugging'], class: 'focus' },
  { path: ['Work', 'Programming', 'Local Dev & APIs'], class: 'focus' },
  // operational (Work)
  { path: ['Work', 'Chat & Messaging'], class: 'operational' },
  { path: ['Work', 'Emails'], class: 'operational' },
  { path: ['Work', 'Meetings & Video'], class: 'operational' },
  { path: ['Work', 'Project Management'], class: 'operational' },
  { path: ['Work', 'Scheduling'], class: 'operational' },
  { path: ['Work', 'Office Suite'], class: 'operational' },
  // distraction (Media's leaves — the legacy names, the ones that actually match titles)
  { path: ['Media', 'Games'], class: 'distraction' },
  { path: ['Media', 'Video'], class: 'distraction' },
  { path: ['Media', 'Social Media'], class: 'distraction' },
  { path: ['Media', 'Music'], class: 'distraction' },
  // operational (Comms)
  { path: ['Comms', 'IM'], class: 'operational' },
  { path: ['Comms', 'Email'], class: 'operational' },
  // explicitly null — no sensible default, and corrects any pre-existing over-assignment
  { path: ['Work', 'Document Viewers'], class: null },
  { path: ['Work', 'Drafting Tools'], class: null },
  { path: ['Work', 'Image'], class: null },
  { path: ['Work', 'Audio'], class: null },
  { path: ['Work', '3D'], class: null },
];

/**
 * Pure and idempotent: only mutates `data.class` on categories whose `name`
 * exactly matches an entry in LEAF_CLASS_MAPPING. Everything else (rule,
 * color, score, unmapped categories) passes through unchanged. Running this
 * twice on its own output is a no-op.
 */
export function migrateLeafClasses(categories: Category[]): Category[] {
  return categories.map(c => {
    const entry = LEAF_CLASS_MAPPING.find(m => _.isEqual(m.path, c.name));
    if (!entry) {
      return c;
    }
    const next = _.cloneDeep(c);
    next.data = { ...(next.data || {}) };
    if (entry.class === null) {
      delete next.data.class;
    } else {
      next.data.class = entry.class;
    }
    return next;
  });
}

/**
 * Removes an inactive CategorySet with id exactly "Focus" — the orphaned,
 * never-merged set discovered during this investigation (present in
 * category_sets but excluded from active_set_ids, so it contributed nothing).
 * Narrowly scoped to that exact id/inactive combination so it never touches
 * a legitimate user-created inactive set (e.g. a kept-for-later profile),
 * and never touches a set named "Focus" that a user has actually activated.
 */
export function pruneOrphanedFocusSet(sets: CategorySet[], activeIds: string[]): CategorySet[] {
  return sets.filter(s => !(s.id === 'Focus' && !activeIds.includes(s.id)));
}
