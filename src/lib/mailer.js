import nodemailer from 'nodemailer';
import env from '../config/env.js';

const escapeHtml = (v = '') => String(v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * Emails a new enquiry to the firm through their own SMTP mailbox (Zoho).
 *
 * Deliberately never throws: the enquiry is already saved, and a mail outage
 * must not turn a successful form submission into an error for the visitor.
 * With no SMTP settings configured it does nothing, so the site keeps working
 * before the mailbox is connected.
 *
 * Reply-To is the visitor, so the firm can answer straight from their inbox.
 * On a serverless host the caller must await this before responding, because
 * the function may be frozen the moment the response is sent.
 */
export async function sendEnquiryEmail({ to, enquiry }) {
  const { host, port, user, pass, from } = env.mail;
  if (!host || !user || !pass || !to) return false;

  const label = enquiry.source === 'consultation' ? 'Consultation request' : 'Contact enquiry';
  const rows = [
    ['Name', enquiry.name],
    ['Email', enquiry.email],
    ['Phone', enquiry.phone],
    ['Subject', enquiry.subject],
  ].filter(([, v]) => v);

  const html = `
    <div style="font-family:Arial,sans-serif;font-size:15px;color:#1a2233;max-width:600px">
      <h2 style="margin:0 0 12px;color:#1b4f9c">New ${escapeHtml(label.toLowerCase())}</h2>
      <table style="border-collapse:collapse;width:100%">
        ${rows.map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#5b6577;white-space:nowrap">${k}</td><td style="padding:6px 0"><strong>${escapeHtml(v)}</strong></td></tr>`).join('')}
      </table>
      <p style="margin:16px 0 4px;color:#5b6577">Message</p>
      <div style="white-space:pre-wrap;padding:12px 14px;background:#f7f9fc;border-left:4px solid #1b4f9c">${escapeHtml(enquiry.message)}</div>
      <p style="margin-top:20px;color:#5b6577;font-size:13px">Reply to this email to answer ${escapeHtml(enquiry.name)} directly. The enquiry is also saved in the dashboard.</p>
    </div>`;

  const text = [
    `New ${label.toLowerCase()}`,
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    enquiry.message,
  ].join('\n');

  try {
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // 465 = SSL; 587 upgrades with STARTTLS
      auth: { user, pass },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
    });
    await transport.sendMail({
      from,
      to: String(to).split(',').map((a) => a.trim()).filter(Boolean),
      replyTo: enquiry.email,
      subject: `${label}: ${enquiry.subject || enquiry.name}`.slice(0, 200),
      html,
      text,
    });
    return true;
  } catch (err) {
    console.error('[mail] send failed', err?.code || '', err?.message);
    return false;
  }
}
