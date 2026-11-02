/**
 * Interprets SMTP_SECURE robustly rather than a bare `=== 'true'`, which
 * breaks the moment the value carries whitespace or literal quote
 * characters — something a copy-paste into Netlify's UI can easily
 * introduce. Accepts "true"/"1"/"yes" and "false"/"0"/"no", case-insensitive,
 * with surrounding quotes and whitespace stripped first. Missing or anything
 * else unparseable falls back to the port's own convention: 465 is secure
 * (implicit TLS), 587 is not (STARTTLS instead).
 *
 * Always returns a `rule` string describing which branch fired, safe to log
 * or show in the admin — it never includes a secret, only the raw
 * (non-secret) SMTP_SECURE value and the port.
 */
export function parseSmtpSecure(rawValue, port) {
  const numericPort = Number(port) || 465;

  if (rawValue !== undefined && rawValue !== null && rawValue !== '') {
    const cleaned = String(rawValue).trim().replace(/^["']|["']$/g, '').toLowerCase();
    if (['true', '1', 'yes'].includes(cleaned)) {
      return { secure: true, rule: `SMTP_SECURE="${rawValue}" → true` };
    }
    if (['false', '0', 'no'].includes(cleaned)) {
      return { secure: false, rule: `SMTP_SECURE="${rawValue}" → false` };
    }
    // Present but not a recognised token — fall through to the port default,
    // but say so explicitly rather than silently treating it like "missing".
    const secure = numericPort === 465;
    return { secure, rule: `SMTP_SECURE="${rawValue}" is not a recognised value — defaulted from port ${numericPort} (${secure ? 'secure' : 'STARTTLS'})` };
  }

  const secure = numericPort === 465;
  return { secure, rule: `SMTP_SECURE not set — defaulted from port ${numericPort} (${secure ? 'secure' : 'STARTTLS'})` };
}
