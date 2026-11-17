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
