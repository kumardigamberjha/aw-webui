// Dashboard class colors — validated with the dataviz palette checker
// (lightness band, chroma floor, CVD separation ≥ 13, contrast ≥ 3:1 on light surface).
// Idle is intentionally a recessive neutral: it encodes "no activity", not a series identity.
import { EventClass } from '~/util/metrics';

export const CLASS_COLORS: Record<EventClass, string> = {
  focus: '#2a78d6',
  operational: '#008300',
  distraction: '#e34948',
  uncategorized: '#bd7d00',
};

export const IDLE_COLOR = '#d9d8d3';

export const CLASS_LABELS: Record<EventClass, string> = {
  focus: 'Focus',
  operational: 'Operational',
  distraction: 'Distraction',
  uncategorized: 'Uncategorized',
};

// Sequential blue ramp (light→dark) for magnitude encoding in the treemap
export const SEQUENTIAL_BLUES = [
  '#cde2fb',
  '#b7d3f6',
  '#9ec5f4',
  '#86b6ef',
  '#6da7ec',
  '#5598e7',
  '#3987e5',
  '#2a78d6',
  '#256abf',
  '#1c5cab',
];
