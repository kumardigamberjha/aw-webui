<template lang="pug">
div
  p.mb-2
    | Rules for categorizing events. An event can only have one category. If several categories match, the deepest one will be chosen.
  p
    | Find and share categorization rule presets on #[a(href="https://forum.activitywatch.net/c/projects/category-rules") the forum].
    | For help on how to write categorization rules, see #[a(href="https://docs.activitywatch.net/en/latest/features/categorization.html") the documentation].

  // Category set switcher. bg-light + .rounded so dark.css's .bg-light
  // override flips the background in dark mode instead of leaving an
  // inline white block on a dark canvas.
  div.my-3.p-3.bg-light.rounded
    div.d-flex.align-items-center.flex-wrap(style="gap: 0.5rem;")
      span.font-weight-bold(style="white-space: nowrap") Category set:
      b-select(
        v-model="activeSetId"
        @change="onSetChange"
        style="max-width: 220px"
        size="sm"
      )
        b-select-option(
          v-for="set in categoryStore.category_sets"
          :key="set.id"
          :value="set.id"
        ) {{ set.id }}
      b-btn(
        @click="createSet"
        variant="outline-primary"
        size="sm"
      ) New set
      b-btn(
        v-if="categoryStore.category_sets.length > 1"
        @click="deleteActiveSet"
        variant="outline-danger"
        size="sm"
      ) Delete set
    div.mt-1.small.text-muted(v-if="categoryStore.category_sets.length > 1")
      | {{ categoryStore.category_sets.length }} sets available — switch sets to use different rule profiles.

  div.d-flex.align-items-center.flex-wrap.mt-4
    h5.mb-0 Categories
    div.ml-auto
      b-btn.ml-1(@click="restoreDefaultClasses", variant="outline-warning" size="sm")
        icon(name="undo")
        | Restore defaults
      label.btn.btn-sm.ml-1.btn-outline-primary(style="margin: 0")
        | Import
        input(type="file" @change="importCategories" hidden)
      b-btn.ml-1(@click="exportClasses", variant="outline-primary" size="sm")
        | Export

  div.my-3
    b-alert(variant="warning" :show="classes_unsaved_changes")
      | You have unsaved changes!
      div.float-right(style="margin-top: -0.15em; margin-right: -0.6em")
        b-btn.ml-2(@click="saveClasses", variant="success" size="sm")
          | Save
        b-btn.ml-2(@click="resetClasses", variant="warning" size="sm")
          | Discard
    div(v-for="_class in classes_hierarchy")
      CategoryEditTree(:_class="_class")
    div(v-if="editingId !== null")
      CategoryEditModal(:categoryId='editingId', @hidden="hideEditModal()")

  div.row
    div.col-sm-12
      b-btn(@click="addClass")
        icon.mr-2(name="plus")
        | Add category
      b-btn.float-right(@click="saveClasses", variant="success" :disabled="!classes_unsaved_changes")
        | Save

  // Focus Insights class rules — a flat, priority-ordered view of the same
  // categoryStore data as the tree above, specifically for assigning the
  // Focus/Operational/Distraction class the dashboard's metrics read. Order
  // here is the actual match order (first-match-wins), unlike the tree's
  // deepest-match-wins semantics — see moveClassRule()'s doc comment.
  div.mt-4
    div.d-flex.align-items-center.flex-wrap
      h5.mb-0 Focus Insights class rules
      small.text-muted.ml-2 Assigns app/title time to Focus, Operational, or Distraction for the dashboard
    p.small.text-muted.mt-1
      | Checked top to bottom — the first rule whose pattern matches wins. Reorder with the arrows if two rules could both match the same app.

    div.my-3.p-3.bg-light.rounded
      div.font-weight-bold.mb-2 Add rule
      div.d-flex.flex-wrap(style="gap: 0.5rem;")
        b-form-input(v-model="newRule.name" placeholder="Name (e.g. Slack)" size="sm" style="max-width: 200px")
        b-form-input(v-model="newRule.regex" placeholder="Regex pattern (e.g. Slack)" size="sm" style="max-width: 240px")
        b-select(v-model="newRule.class" :options="classRuleOptions" size="sm" style="max-width: 160px")
        b-btn(@click="addClassRule" variant="primary" size="sm" :disabled="!newRule.name || !newRule.regex")
          icon.mr-1(name="plus")
          | Add
      div.text-danger.small.mt-1(v-if="addRuleError") {{ addRuleError }}

    b-table(
      :items="classRuleRows"
      :fields="classRuleFields"
      small
      hover
      show-empty
      empty-text="No class rules yet — add one above, or check Settings if the Focus Insights seed hasn't run."
    )
      template(#cell(order)="row")
        div.d-flex.flex-column
          b-btn.p-0.border-0(
            variant="link" size="sm"
            :disabled="row.index === 0"
            @click="categoryStore.moveClassRule(row.item.name, 'up')"
            title="Move up"
          )
            icon(name="caret-up")
          b-btn.p-0.border-0(
            variant="link" size="sm"
            :disabled="row.index === classRuleRows.length - 1"
            @click="categoryStore.moveClassRule(row.item.name, 'down')"
            title="Move down"
          )
            icon(name="caret-down")
      template(#cell(path)="row") {{ row.item.name.join(' > ') }}
      template(#cell(regex)="row")
        code {{ row.item.rule.regex }}
      template(#cell(class)="row")
        b-select(
          :value="(row.item.data && row.item.data.class) || null"
          :options="classRuleOptions"
          size="sm"
          style="min-width: 150px"
          @change="setRuleClass(row.item, $event)"
        )
      template(#cell(color)="row")
        icon(v-if="row.item.data && row.item.data.color" name="circle" :style="'color: ' + row.item.data.color")
      template(#cell(actions)="row")
        b-btn.border-0(size="sm", variant="outline-secondary", @click="showEditModal(row.item.id)" pill)
          icon(name="edit")
        b-btn.ml-1.border-0(size="sm", variant="outline-danger", @click="removeClassRule(row.item)" pill)
          icon(name="trash")

  // Category Builder sits at the end of the categories list (above the
  // ActivePatternSettings panel below the group). Collapsed by default
  // so the words query doesn't fire for users who only came to edit
  // rules; once opened it mounts lazily.
  div.mt-4(ref="builderSection")
    div.d-flex.align-items-center.flex-wrap
      h5.mb-0 Category builder
      small.text-muted.ml-2 Generate rules from uncategorized activity
      b-btn.ml-auto(
        variant="outline-primary"
        size="sm"
        @click="builderOpen = !builderOpen"
        :aria-expanded="builderOpen ? 'true' : 'false'"
        aria-controls="category-builder-collapse"
      )
        icon.mr-1(:name="builderOpen ? 'angle-double-up' : 'angle-double-down'")
        | {{ builderOpen ? 'Hide builder' : 'Open builder' }}
    b-collapse#category-builder-collapse(v-model="builderOpen")
      div.mt-3(v-if="builderMounted")
        CategoryBuilder(embedded)
</template>
<script lang="ts">
import { mapState, mapGetters } from 'pinia';
import CategoryEditTree from '~/components/CategoryEditTree.vue';
import CategoryEditModal from '~/components/CategoryEditModal.vue';
import 'vue-awesome/icons/undo';
import 'vue-awesome/icons/angle-double-down';
import 'vue-awesome/icons/angle-double-up';
import 'vue-awesome/icons/caret-up';
import 'vue-awesome/icons/caret-down';
import 'vue-awesome/icons/circle';
import 'vue-awesome/icons/edit';
import 'vue-awesome/icons/trash';

import { useCategoryStore } from '~/stores/categories';
import { Category } from '~/util/classes';

import _ from 'lodash';
import { downloadFile } from '~/util/export';

const confirmationMessage = 'Your categories have unsaved changes, are you sure you want to leave?';

export default {
  name: 'CategorizationSettings',
  components: {
    CategoryEditTree,
    CategoryEditModal,
    // Lazy-load the builder so visiting Categorization without opening
    // the builder doesn't drag in its query/word-list code.
    CategoryBuilder: () => import('~/views/settings/CategoryBuilder.vue'),
  },
  data: () => ({
    categoryStore: useCategoryStore(),
    editingId: null,
    activeSetId: 'default',
    builderOpen: false,
    builderMounted: false,
    newRule: { name: '', regex: '', class: null },
    addRuleError: '',
  }),
  computed: {
    ...mapState(useCategoryStore, ['classes_unsaved_changes']),
    ...mapGetters(useCategoryStore, ['classes_hierarchy', 'classRules']),
    classRuleOptions() {
      return [
        { value: null, text: 'Unset' },
        { value: 'focus', text: 'Focus' },
        { value: 'operational', text: 'Operational' },
        { value: 'distraction', text: 'Distraction' },
      ];
    },
    classRuleFields() {
      return [
        { key: 'order', label: '' },
        { key: 'path', label: 'Category path' },
        { key: 'regex', label: 'Pattern' },
        { key: 'class', label: 'Class' },
        { key: 'color', label: 'Color' },
        { key: 'actions', label: '' },
      ];
    },
    classRuleRows() {
      return this.classRules;
    },
  },
  watch: {
    builderOpen(v: boolean) {
      if (v) this.builderMounted = true;
    },
    'categoryStore.active_set_ids': {
      handler(newIds: string[]) {
        if (newIds && newIds.length > 0) {
          this.activeSetId = newIds[0];
        }
      },
      immediate: true,
    },
  },
  mounted() {
    this.categoryStore.load();

    // Warn user about unsaved changes when closing/refreshing the browser tab.
    // Route navigation guard is handled by the parent Settings.vue component
    // using beforeRouteLeave (automatically cleaned up by Vue Router).
    window.addEventListener('beforeunload', this.beforeUnload);

    // Deep-link from UncategorizedNotification ("Category Builder" link) lands
    // on /settings/categorization?builder=open — open the builder and scroll
    // it into view so the user can act immediately.
    if (this.$route.query.builder === 'open') {
      this.builderOpen = true;
      this.$nextTick(() => {
        const el = this.$refs.builderSection as HTMLElement | undefined;
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }
  },
  beforeDestroy() {
    window.removeEventListener('beforeunload', this.beforeUnload);
  },
  methods: {
    addClass: function () {
      this.categoryStore.addClass({
        name: ['New class'],
        rule: { type: 'regex', regex: 'FILL ME' },
      });

      // Find the category with the max ID, and open an editor for it
      const lastId = _.max(_.map(this.categoryStore.classes, 'id'));
      this.editingId = lastId;
    },
    saveClasses: async function () {
      await this.categoryStore.save();
    },
    resetClasses: async function () {
      await this.categoryStore.load();
    },
    restoreDefaultClasses: async function () {
      await this.categoryStore.restoreDefaultClasses();
    },
    hideEditModal: function () {
      this.editingId = null;
    },
    showEditModal: function (id: number) {
      this.editingId = id;
    },
    addClassRule: function () {
      this.addRuleError = '';
      const name = this.newRule.name.trim();
      if (!name || !this.newRule.regex) return;
      if (this.categoryStore.all_categories.some((c: string[]) => c.join('') === name)) {
        this.addRuleError = `A category named "${name}" already exists.`;
        return;
      }
      this.categoryStore.addClass({
        name: [name],
        rule: { type: 'regex', regex: this.newRule.regex, ignore_case: true },
        data: this.newRule.class ? { class: this.newRule.class } : {},
      });
      this.categoryStore.save();
      this.newRule = { name: '', regex: '', class: null };
    },
    setRuleClass: function (category, cls: string | null) {
      this.categoryStore.updateClass({
        ...category,
        data: { ...category.data, class: cls || undefined },
      });
      this.categoryStore.save();
    },
    removeClassRule: function (category) {
      if (!confirm(`Delete the rule for "${category.name.join(' > ')}"?`)) return;
      this.categoryStore.removeClass(category.id);
      this.categoryStore.save();
    },
    exportClasses: async function () {
      console.log('Exporting categories...');

      // Export the active set with its ID — suitable for re-importing as a named set.
      // Use classes_clean (current in-memory state) so unsaved edits are included.
      const activeSetId = this.categoryStore.active_set_ids[0] || 'default';
      const export_data = { id: activeSetId, categories: this.categoryStore.classes_clean };
      const text = JSON.stringify(export_data, null, 2);
      await downloadFile(`aw-category-export-${export_data.id}.json`, text, 'application/json');
    },
    importCategories: async function (elem) {
      console.log('Importing categories...');

      // Get file from upload
      const file = elem.target.files[0];
      if (file.type != 'application/json') {
        console.error('Only JSON files are possible to import');
        return;
      }

      // Read and parse import text to JSON
      const text = await file.text();
      const import_obj = JSON.parse(text);

      if (import_obj.categories && !import_obj.id) {
        // Legacy format: flat categories array — import into the active set
        this.categoryStore.import(import_obj.categories);
      } else if (import_obj.id && import_obj.categories) {
        // New CategorySet format — create or overwrite set with same ID
        let setId = import_obj.id;
        while (
          this.categoryStore.category_sets.find(
            s => s.id === setId && s.id !== (this.categoryStore.active_set_ids[0] || '')
          )
        ) {
          // Avoid duplicate IDs (except if overwriting the active set)
          setId = setId + '-imported';
        }
        const existing = this.categoryStore.category_sets.find(s => s.id === setId);
        if (existing) {
          const replace = confirm(
            `A category set named "${setId}" already has ${existing.categories.length} rule(s).\n\n` +
              `Click OK to REPLACE it with the ${import_obj.categories.length} rule(s) from this file.\n` +
              `Click Cancel to MERGE instead — the file's rules are added, but any existing rule with ` +
              `the same category name is kept as-is.`
          );
          if (replace) {
            existing.categories = import_obj.categories;
          } else {
            const existingNames = new Set(
              existing.categories.map((c: Category) => c.name.join('>>>>'))
            );
            for (const importedCat of import_obj.categories) {
              if (!existingNames.has(importedCat.name.join('>>>>'))) {
                existing.categories.push(importedCat);
              }
            }
          }
          // If importing into the active set, don't call switchToSet — it would call
          // syncToPrimarySet first and overwrite the just-imported categories with
          // stale in-memory classes. Use discardChanges to recompute from the updated set.
          const isActiveSet = setId === (this.categoryStore.active_set_ids[0] || '');
          if (isActiveSet) {
            this.categoryStore.discardChanges();
          } else {
            this.categoryStore.switchToSet(setId);
          }
        } else {
          this.categoryStore.category_sets.push({ id: setId, categories: import_obj.categories });
          this.categoryStore.switchToSet(setId);
        }
        this.categoryStore.classes_unsaved_changes = true;
      } else {
        console.error('Unrecognized import format');
      }
    },
    createSet: function () {
      const name = prompt('Name for the new category set:');
      if (!name) return;
      if (this.categoryStore.category_sets.find(s => s.id === name)) {
        alert(`A set named "${name}" already exists.`);
        return;
      }
      // Create the new set and switch to it (switchToSet syncs current state first)
      this.categoryStore.createSet(name);
      this.categoryStore.switchToSet(name);
    },
    deleteActiveSet: function () {
      const id = this.categoryStore.active_set_ids[0];
      if (!id) return;
      if (!confirm(`Delete category set "${id}"? This cannot be undone.`)) return;
      this.categoryStore.deleteSet(id);
      this.categoryStore.save();
    },
    onSetChange: function (setId: string) {
      if (this.classes_unsaved_changes) {
        if (!confirm('You have unsaved changes. Switch sets anyway? (Changes will be discarded)')) {
          // Revert the select back to current active
          this.activeSetId = this.categoryStore.active_set_ids[0] || 'default';
          return;
        }
        // User confirmed discard: reset in-memory edits before switching so that
        // switchToSet() → syncToPrimarySet() writes back the original (clean) state,
        // not the unsaved edits the user just chose to discard.
        this.categoryStore.discardChanges();
      }
      this.categoryStore.switchToSet(setId);
    },
    beforeUnload: function (e) {
      if (this.classes_unsaved_changes) {
        e = e || window.event;
        e.preventDefault();
        e.returnValue = confirmationMessage;
        return confirmationMessage;
      }
    },
  },
};
</script>
