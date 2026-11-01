/**
 * The real visitor IP, for rate-limiting.
 *
 * `req.ip` (trust proxy) was tuned for Vercel's single hop — see the comment
 * in app.js. On Netlify, requests reach the function through Netlify's own
 * edge/CDN layer, and the client's real address is given explicitly in
 * `x-nf-client-connection-ip` rather than reliably being req.ip's resolution
 * of x-forwarded-for. Preferring that header here (only for the webinar
 * limiter, to avoid touching the already-deployed global limiter) fixes
 * Netlify specifically without assuming anything about Vercel.
 */
export function clientIp(req) {
  return req.get('x-nf-client-connection-ip') || req.ip || 'unknown';
}
