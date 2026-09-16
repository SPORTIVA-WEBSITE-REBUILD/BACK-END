import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';

import env from './config/env.js';
import { connectDB } from './lib/db.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { globalLimiter } from './middleware/rateLimit.js';
import originCheck from './middleware/originCheck.js';
import routes from './routes/index.js';
import ApiError from './lib/ApiError.js';

const app = express();

// Vercel and most PaaS front the app with a proxy; without this req.ip is the
// proxy's address and every rate limiter would share one bucket.
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  // The API serves JSON only; CSP belongs on the sites that render HTML.
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin(origin, cb) {
    // Same-origin and server-to-server requests arrive without an Origin.
    if (!origin) return cb(null, true);
    const normalised = origin.replace(/\/$/, '');
    if (env.corsOrigins.includes(normalised)) return cb(null, true);
    // A rejected origin is the caller's problem, not a server fault: without
    // this it surfaces as an opaque 500.
    return cb(ApiError.forbidden('Origin not allowed'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
}));

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(mongoSanitize({ replaceWith: '_' }));
app.use(originCheck);
app.use(globalLimiter);

// One connection attempt per invocation; warm invocations resolve instantly.
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});

app.get('/api/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok', env: env.nodeEnv } });
});

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
