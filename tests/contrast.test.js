// Colour contrast, read straight from the design tokens in styles/main.css,
// in light and dark mode. WCAG 2.2 level AA asks for:
//   4.5 : 1  for normal text
//   3   : 1  for the edges of form boxes and the keyboard focus ring
// If someone changes a colour token and breaks contrast, this test fails.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/main.css', import.meta.url), 'utf8');

// Read "--name: #abcdef;" pairs from a block of CSS.
function tokens(block) {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
}
// The first ":root { ... }" block after a marker.
function rootBlockAfter(marker) {
  const root = css.indexOf(':root {', css.indexOf(marker));
  const start = css.indexOf('{', root) + 1;
  return css.slice(start, css.indexOf('}', start));
}
const light = tokens(rootBlockAfter('Design tokens'));
const dark = { ...light, ...tokens(rootBlockAfter('prefers-color-scheme: dark')) };

// Relative luminance and contrast ratio, as defined by WCAG.
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT = [
  ['text', 'bg'], ['text', 'surface'], ['text', 'accent-soft'],
  ['text-muted', 'bg'], ['text-muted', 'surface'],
  ['accent', 'bg'], ['accent', 'surface'],
  ['on-accent', 'accent'], ['on-accent', 'accent-hover'],
  ['green-text', 'green-bg'], ['amber-text', 'amber-bg'], ['red-text', 'red-bg'],
  ['red-text', 'surface'], ['red-text', 'bg'], ['amber-text', 'surface'],
  ['owner-text', 'owner-bg'], ['booking-text', 'booking-bg'],
];
const UI = [['input-border', 'bg'], ['input-border', 'surface'], ['focus', 'bg'], ['focus', 'surface']];

for (const [mode, palette] of [['light', light], ['dark', dark]]) {
  test(`${mode} mode: every text colour has at least 4.5:1 contrast`, () => {
    for (const [fg, bg] of TEXT) {
      assert.ok(palette[fg] && palette[bg], `missing token ${fg} or ${bg}`);
      const ratio = contrast(palette[fg], palette[bg]);
      assert.ok(ratio >= 4.5, `${mode}: ${fg} on ${bg} is only ${ratio.toFixed(2)}:1`);
    }
  });

  test(`${mode} mode: form box edges and the focus ring have at least 3:1`, () => {
    for (const [fg, bg] of UI) {
      assert.ok(palette[fg] && palette[bg], `missing token ${fg} or ${bg}`);
      const ratio = contrast(palette[fg], palette[bg]);
      assert.ok(ratio >= 3, `${mode}: ${fg} against ${bg} is only ${ratio.toFixed(2)}:1`);
    }
  });
}

test('the contrast formula matches known values', () => {
  assert.equal(contrast('#000000', '#ffffff').toFixed(1), '21.0');
  assert.equal(contrast('#777777', '#ffffff').toFixed(2), '4.48');
});
