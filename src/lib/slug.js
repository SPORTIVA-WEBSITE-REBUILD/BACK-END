export function slugify(input) {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    // Apostrophes are dropped rather than treated as separators, so
    // "FIFA's ruling" becomes "fifas-ruling" and not "fifa-s-ruling".
    .replace(/['\u2019\u02bc]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

/**
 * Slugs are user-facing URLs, so collisions must resolve deterministically
 * rather than by rejecting the editor's save.
 */
export async function uniqueSlug(Model, base, excludeId = null) {
  const root = slugify(base) || 'item';
  let candidate = root;
  let n = 2;
  /* eslint-disable no-await-in-loop */
  while (true) {
    const query = { $or: [{ slug: candidate }, { previousSlugs: candidate }] };
    if (excludeId) query._id = { $ne: excludeId };
    const clash = await Model.exists(query);
    if (!clash) return candidate;
    candidate = `${root}-${n++}`;
  }
}
