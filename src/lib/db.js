import mongoose from 'mongoose';
import env from '../config/env.js';

/**
 * Serverless functions are frozen and thawed between invocations. Caching the
 * connection promise on globalThis lets warm invocations reuse the existing
 * socket instead of opening a new one per request, which would exhaust Atlas
 * M0's connection budget almost immediately.
 *
 * The cache is resolved on every call rather than captured at module load, so
 * a host that replaces it (a test harness supplying its own connection) is
 * honoured instead of silently ignored.
 */
function cache() {
  if (!globalThis.__pcnMongoose) {
    globalThis.__pcnMongoose = { conn: null, promise: null };
  }
  return globalThis.__pcnMongoose;
}

export async function connectDB(uri) {
  const state = cache();
  if (state.conn) return state.conn;

  // Read the URI at call time: env is imported before a test harness has had a
  // chance to point MONGODB_URI at its own in-memory server.
  const target = uri || process.env.MONGODB_URI || env.mongoUri;
  if (!target) throw new Error('MONGODB_URI is not configured');

  if (!state.promise) {
    mongoose.set('strictQuery', true);
    state.promise = mongoose.connect(target, {
      bufferCommands: false,
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 20000,
    });
  }

  try {
    state.conn = await state.promise;
  } catch (err) {
    state.promise = null; // allow a retry on the next invocation
    throw err;
  }
  return state.conn;
}

export async function disconnectDB() {
  const state = cache();
  if (state.conn) {
    await mongoose.disconnect();
    state.conn = null;
    state.promise = null;
  }
}
