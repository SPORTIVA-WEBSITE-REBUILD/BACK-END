/**
 * Netlify Functions entrypoint.
 *
 * Vercel takes a bare Express app (see api/index.js); Netlify does not, so the
 * same app is wrapped for the Lambda-style handler here. Both entrypoints stay
 * in the tree so the project can deploy to either without a code change.
 *
 * netlify.toml rewrites every path into this function.
 */
import serverless from 'serverless-http';
import app from '../../src/app.js';

export const handler = serverless(app);
