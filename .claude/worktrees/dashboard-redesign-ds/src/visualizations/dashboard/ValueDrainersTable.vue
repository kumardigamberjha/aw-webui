<template lang="pug">
div
  b-table(
    :items="drainers"
    :fields="fields"
    sort-by="totalDuration"
    :sort-desc="true"
    small
    hover
    responsive
    show-empty
    empty-text="No distraction time in this range 🎉"
  )
</template>

<script lang="ts">
import { ValueDrainer } from '~/util/metrics';
import { seconds_to_duration } from '~/util/time';

export default {
  name: 'ValueDrainersTable',
  props: {
    drainers: {
      type: Array as () => ValueDrainer[],
      required: true,
    },
  },
  computed: {
    fields() {
      return [
        { key: 'app', label: 'App', sortable: true },
        {
          key: 'totalDuration',
          label: 'Total time',
          sortable: true,
          formatter: (v: number) => seconds_to_duration(v),
          tdClass: 'text-right',
          thClass: 'text-right',
        },
        {
          key: 'visitCount',
          label: 'Visits',
          sortable: true,
          tdClass: 'text-right',
          thClass: 'text-right',
        },
        {
          key: 'avgStay',
          label: 'Avg stay',
          sortable: true,
          formatter: (v: number) => seconds_to_duration(v),
          tdClass: 'text-right',
          thClass: 'text-right',
        },
      ];
    },
  },
};
</script>
