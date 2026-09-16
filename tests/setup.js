import { beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-not-used-in-production';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-not-used-in-production';
process.env.CORS_ORIGIN = 'http://localhost:5173';
// Limiters are exercised in tests/rateLimit.test.js, which turns this off.
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.CLOUDINARY_CLOUD_NAME = 'pkesmajk';
process.env.CLOUDINARY_API_KEY = 'test-key';
process.env.CLOUDINARY_API_SECRET = 'test-secret';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);
  // The app's own connect() sees an active connection and reuses it.
  globalThis.__pcnMongoose = { conn: mongoose, promise: Promise.resolve(mongoose) };
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(
    Object.values(collections).map((c) => c.deleteMany({})),
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});
