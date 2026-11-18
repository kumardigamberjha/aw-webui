<template lang="pug">
table.aw-table
  thead
    tr
      th(
        v-for="col in columns"
        :key="col.key"
        :class="[col.align === 'right' ? 'is-right' : '', col.sortable ? 'is-sortable' : '']"
        :aria-sort="ariaSort(col)"
        @click="col.sortable && $emit('sort', col.key)"
      )
        span {{ col.label }}
        span.aw-table-caret(v-if="col.sortable")
          | {{ sortBy === col.key ? (sortDesc ? '↓' : '↑') : '' }}
  tbody
    slot
</template>

<script lang="ts">
export interface TableColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
  sortable?: boolean;
}

export default {
  name: 'Table',
  props: {
    columns: { type: Array as () => TableColumn[], required: true },
    sortBy: { type: String, default: '' },
    sortDesc: { type: Boolean, default: true },
  },
  methods: {
    ariaSort(col: TableColumn): string | null {
      if (!col.sortable) return null;
      if (this.sortBy !== col.key) return 'none';
      return this.sortDesc ? 'descending' : 'ascending';
    },
  },
};
</script>

<style scoped>
.aw-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-13);
  color: var(--fg);
}

.aw-table ::v-deep th,
.aw-table ::v-deep td {
  padding: var(--space-8) var(--space-12);
  text-align: left;
  border-bottom: var(--border-width) solid var(--border);
}

.aw-table thead th {
  font-size: var(--font-size-11);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted-fg);
  white-space: nowrap;
  /* The app's global static/dark.css has an unscoped `[aria-sort] { background-image: ... !important }`
     meant only for BootstrapVue's .b-table (which pairs it with a matching background-size).
     Our thead th also carries aria-sort for a11y, so it inherits that oversized icon without the
     sizing rule that normally tames it. Override locally rather than touching the global file. */
  background-image: none !important;
}

.aw-table th.is-sortable {
  cursor: pointer;
  user-select: none;
}

.aw-table th.is-right,
.aw-table ::v-deep td.is-right {
  text-align: right;
}

.aw-table-caret {
  display: inline-block;
  width: 10px;
  margin-left: var(--space-4);
}

.aw-table ::v-deep tbody tr {
  transition: background-color var(--transition-fast);
}

.aw-table ::v-deep tbody tr:hover {
  background: var(--bg);
}

.aw-table ::v-deep tbody tr:last-child td {
  border-bottom: none;
}
</style>
