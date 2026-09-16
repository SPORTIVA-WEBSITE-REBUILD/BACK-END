import app from './app.js';
import env from './config/env.js';
import { connectDB } from './lib/db.js';

// Local development only. In production Vercel imports src/app.js directly via
// api/index.js and never runs a listener.
await connectDB();
app.listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port} (${env.nodeEnv})`);
});
