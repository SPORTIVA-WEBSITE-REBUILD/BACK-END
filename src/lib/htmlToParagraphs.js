import sanitizeHtml from 'sanitize-html';

/**
 * sanitizeHtml's tag-stripped output is still HTML-escaped text — correct
 * for its original purpose (an excerpt later inserted via
 * dangerouslySetInnerHTML, so it must stay safe), wrong for this one: a
 * field a consumer will escape exactly once at render time needs the
 * literal character, not the entity. '<p>Sports Management &amp;
 * Legal Skills</p>' must become 'Sports Management & Legal Skills' here,
 * not stay as the six-character escape.
 */
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  mdash: '—', ndash: '–', hellip: '…',
};

export function decodeEntities(text) {
  return String(text).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body) => {
    if (body[0] === '#') {
      const isHex = body[1] === 'x' || body[1] === 'X';
      const code = isHex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body) ? NAMED_ENTITIES[body] : match;
  });
}

/**
 * Converts rich-text HTML into plain-text paragraphs separated by a blank
 * line (\n\n) — not toPlainText() in sanitize.js, which collapses every
 * run of whitespace (including the gap between adjacent `<p>` tags) into a
 * single space and leaves entities HTML-escaped; both are wrong for a field
 * meant to be reusable prose rather than a one-line excerpt. Splits on `<p>`
 * blocks when present; a source with none is treated as a single paragraph.
 */
export function htmlToParagraphs(html) {
  if (!html) return '';
  const blocks = String(html).match(/<p[^>]*>[\s\S]*?<\/p>/gi);
  const sources = blocks && blocks.length ? blocks : [String(html)];
  const paragraphs = sources
    .map((block) => decodeEntities(sanitizeHtml(block, { allowedTags: [], allowedAttributes: {} })).replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean);
  return paragraphs.join('\n\n');
}
