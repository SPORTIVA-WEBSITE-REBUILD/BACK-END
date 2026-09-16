export function ok(res, data, meta) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.json(body);
}

export function created(res, data) {
  return res.status(201).json({ success: true, data });
}

export function noContent(res) {
  return res.status(204).end();
}

/**
 * Public GETs are served through Vercel's edge cache. `s-maxage` controls the
 * shared cache only; browsers still revalidate, so an editor's change appears
 * within the window without a purge, and `stale-while-revalidate` means a cold
 * cache never blocks a visitor on a database round trip.
 */
export function publicCache(res, seconds = 300) {
  res.set('Cache-Control', `public, s-maxage=${seconds}, stale-while-revalidate=86400`);
  return res;
}

export function noStore(res) {
  res.set('Cache-Control', 'no-store');
  return res;
}
