// JS-side mirror of tokens.css, for consumers that can't read CSS custom
// properties (chart.js canvas fills, d3 SVG fills). Keep these values in sync
// with tokens.css by hand — there are only two themes and few enough tokens
// that a build-time sync step would be more machinery than the problem needs.

export interface ThemeTokens {
  bg: string;
  surface: string;
  fg: string;
  mutedFg: string;
  border: string;
  borderStrong: string;
  accent: string;
  stateFocus: string;
  stateOperational: string;
  stateDistraction: string;
  stateIdle: string;
  deltaGood: string;
  deltaBad: string;
  deltaNeutral: string;
}

export const LIGHT_TOKENS: ThemeTokens = {
  bg: '#fafafa',
  surface: '#ffffff',
  fg: '#18181b',
  mutedFg: '#71717a',
  border: '#e4e4e7',
  borderStrong: '#d4d4d8',
  accent: '#2a78d6',
  stateFocus: '#008300',
  stateOperational: '#c98500',
  stateDistraction: '#e34948',
  stateIdle: '#a1a1aa',
  deltaGood: '#008300',
  deltaBad: '#e34948',
  deltaNeutral: '#71717a',
};

export const DARK_TOKENS: ThemeTokens = {
  bg: '#09090b',
  surface: '#18181b',
  fg: '#f4f4f5',
  mutedFg: '#a1a1aa',
  border: '#27272a',
  borderStrong: '#3f3f46',
  accent: '#3b82f6',
  stateFocus: '#16a34a',
  stateOperational: '#d97706',
  stateDistraction: '#dc2626',
  stateIdle: '#52525b',
  deltaGood: '#16a34a',
  deltaBad: '#dc2626',
  deltaNeutral: '#a1a1aa',
};

export type ThemeName = 'light' | 'dark';

export function resolveTokens(theme: ThemeName): ThemeTokens {
  return theme === 'dark' ? DARK_TOKENS : LIGHT_TOKENS;
}
