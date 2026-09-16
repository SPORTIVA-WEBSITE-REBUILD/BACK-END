import request from 'supertest';
import app from '../src/app.js';
import Admin from '../src/models/Admin.js';

export { app };

export async function makeAdmin({
  name = 'Test Admin',
  email = 'admin@example.com',
  password = 'correct-horse-battery',
  role = 'super_admin',
  isActive = true,
} = {}) {
  const admin = new Admin({ name, email, role, isActive });
  await admin.setPassword(password);
  await admin.save();
  return { admin, password };
}

/** Logs in and returns an agent that carries the auth cookies. */
export async function signIn(email, password) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password });
  return { agent, res };
}

export async function authedAgent(overrides = {}) {
  const { admin, password } = await makeAdmin(overrides);
  const { agent } = await signIn(admin.email, password);
  return { agent, admin, password };
}
