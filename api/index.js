// Vercel serverless entrypoint. The whole Express app is exported as one
// function; vercel.json rewrites every path into it.
import app from '../src/app.js';

export default app;
