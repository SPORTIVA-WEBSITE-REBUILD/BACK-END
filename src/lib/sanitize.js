import sanitizeHtml from 'sanitize-html';

/**
 * Rich text is sanitised on WRITE, not on render. Storing already-safe HTML
 * means the public site, the dashboard preview and any future consumer all
 * inherit the same guarantee without repeating the work.
 */
const OPTIONS = {
  allowedTags: [
    'p', 'br', 'strong', 'em', 'u', 's', 'blockquote', 'code', 'pre',
    // b and i are presentational rather than semantic, but legacy content
    // migrated from the old site uses them, and dropping them would silently
    // lose the emphasis the author intended.
    'b', 'i',
    'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a', 'img', 'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    '*': ['class'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  transformTags: {
    // Any link that leaves the site must not hand the opener window over.
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, rel: 'noopener noreferrer' },
    }),
  },
  disallowedTagsMode: 'discard',
};

export function cleanHtml(dirty) {
  if (!dirty) return '';
  return sanitizeHtml(String(dirty), OPTIONS);
}

/** Plain text from HTML — used for excerpts and reading-time estimates. */
export function toPlainText(html) {
  return sanitizeHtml(String(html || ''), { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ')
    .trim();
}

export function readingMinutes(html) {
  const words = toPlainText(html).split(' ').filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
