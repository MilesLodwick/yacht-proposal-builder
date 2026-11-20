import { groupThousands } from '../calc/currency.js';

// Small helpers for building screens.

// Make text safe to put inside HTML. Anything the user types (a source
// name, a client's notes) goes through this, so a "<" in their text is
// shown as a character and never treated as code.
export function escapeHTML(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Show commas in a money box while the user types ("250000" shows as
// "250,000"). The cursor stays after the same digit, so typing in the
// middle of a number still works. The code that reads the box already
// ignores commas.
export function groupThousandsAsYouType(input) {
  input.value = groupThousands(input.value);
  input.addEventListener('input', () => {
    const caret = input.selectionStart ?? input.value.length;
    const digitsBefore = input.value.slice(0, caret).replace(/[^\d.]/g, '').length;
    input.value = groupThousands(input.value);
    let pos = 0;
    for (let seen = 0; pos < input.value.length && seen < digitsBefore; pos += 1) {
      if (/[\d.]/.test(input.value[pos])) seen += 1;
    }
    input.setSelectionRange(pos, pos);
  });
}

// Link an embarkation and a disembarkation date box. When the
// disembarkation box is opened while empty, it starts on the embarkation
// date, so the calendar opens on that month rather than today. Dates
// before embarkation are greyed out in the calendar.
export function linkDateRange(startInput, endInput) {
  const sync = () => {
    endInput.min = startInput.value;
  };
  startInput.addEventListener('change', sync);
  startInput.addEventListener('input', sync);
  // "focus" fires before the calendar opens, whether by click, tap or keyboard.
  endInput.addEventListener('focus', () => {
    sync();
    if (!endInput.value && startInput.value) endInput.value = startInput.value;
  });
  sync();
}
