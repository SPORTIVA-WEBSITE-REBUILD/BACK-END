import dotenv from 'dotenv';

dotenv.config();

const required = ['MONGODB_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];

// In tests the harness injects its own values, so skip the hard check there.
if (process.env.NODE_ENV !== 'test') {
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT) || 4000,

  mongoUri: process.env.MONGODB_URI,

  accessSecret: process.env.JWT_ACCESS_SECRET,
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  accessTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  refreshTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS) || 7,
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,

  corsOrigins: (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean),

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
    folder: process.env.CLOUDINARY_FOLDER || 'pcn-sportiva',
  },

  mail: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 465,
    // SMTP_SECURE lets an operator force the choice explicitly (some
    // providers want 587 with secure:true); unset, it falls back to the
    // same port===465 convention the enquiry mailer already uses.
    secure: process.env.SMTP_SECURE !== undefined
      ? process.env.SMTP_SECURE === 'true'
      : Number(process.env.SMTP_PORT) === 465,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM || (process.env.SMTP_USER ? `PCN Sportiva Website <${process.env.SMTP_USER}>` : undefined),
    // Webinar emails only: a distinct from name/address and reply-to, so a
    // "You're registered" email does not have to share the enquiry
    // mailbox's identity. Falls back to the values above when unset.
    fromName: process.env.MAIL_FROM_NAME || 'PCN Sportiva LP',
    fromAddress: process.env.MAIL_FROM_ADDRESS || process.env.SMTP_USER,
    replyTo: process.env.MAIL_REPLY_TO || process.env.SMTP_USER,
    dryRun: process.env.EMAIL_DRY_RUN === 'true',
  },

  turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY || '',

  publicSiteUrl: process.env.PUBLIC_SITE_URL || 'http://localhost:5173',
};

export default env;
