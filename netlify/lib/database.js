const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const mealsSeed = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'data', 'meals.json'), 'utf8')
);
const dietPlansSeed = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'data', 'dietPlans.json'), 'utf8')
);

const DEFAULT_MEASUREMENT_POSITIONS = {
  chest: { point: { x: 50, y: 30 }, anchor: { x: 82, y: 30 } },
  shoulder: { point: { x: 50, y: 24 }, anchor: { x: 82, y: 24 } },
  waist: { point: { x: 50, y: 47 }, anchor: { x: 82, y: 47 } },
  abdomen: { point: { x: 50, y: 54 }, anchor: { x: 82, y: 54 } },
  hips: { point: { x: 50, y: 63 }, anchor: { x: 82, y: 63 } },
  leftArm: { point: { x: 35, y: 38 }, anchor: { x: 18, y: 38 } },
  rightArm: { point: { x: 65, y: 38 }, anchor: { x: 82, y: 38 } },
  leftThigh: { point: { x: 40, y: 72 }, anchor: { x: 22, y: 72 } },
  rightThigh: { point: { x: 60, y: 72 }, anchor: { x: 78, y: 72 } }
};

let pool;

function getPool() {
  if (pool) {
    return pool;
  }

  const connectionString =
    process.env.NETLIFY_DATABASE_URL_UNPOOLED || process.env.NETLIFY_DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'Database connection string not configured. Set NETLIFY_DATABASE_URL or NETLIFY_DATABASE_URL_UNPOOLED.'
    );
  }

  pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: connectionString.includes('sslmode=disable')
      ? false
      : { rejectUnauthorized: false }
  });

  return pool;
}

async function query(text, params = []) {
  const client = await getPool().connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

async function ensureSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY,
      username text NOT NULL,
      password_hash text NOT NULL,
      role text NOT NULL CHECK (role IN ('user', 'admin')),
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx
    ON users ((lower(username)));
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS meals (
      id text PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      payload jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS diet_plans (
      id text PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      payload jsonb NOT NULL,
      is_active boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS measurement_layouts (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      positions jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS measurement_history (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entry jsonb NOT NULL,
      recorded_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function getUserByUsername(username) {
  if (!username) return null;
  const normalized = String(username).trim().toLowerCase();
  if (!normalized) return null;
  const { rows } = await query('SELECT * FROM users WHERE lower(username) = $1', [normalized]);
  return rows[0] || null;
}

async function getUserById(id) {
  if (!id) return null;
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}

async function hashPassword(password, bcrypt) {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

async function verifyPassword(password, hash, bcrypt) {
  return bcrypt.compare(password, hash);
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateId() {
  return crypto.randomUUID();
}

async function createSession(userId, ttlHours = 24 * 7) {
  const id = generateId();
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

  await query(
    'INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
    [id, userId, tokenHash, expiresAt]
  );

  return { token, expiresAt };
}

async function getSession(token) {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const { rows } = await query(
    'SELECT sessions.*, users.username, users.role FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = $1 AND expires_at > now()',
    [tokenHash]
  );
  return rows[0] || null;
}

async function deleteSession(token) {
  if (!token) return;
  const tokenHash = hashToken(token);
  await query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
}

async function ensureUser({ username, password, role }, bcrypt) {
  const normalizedUsername = String(username).trim().toLowerCase();
  const existing = await getUserByUsername(normalizedUsername);
  if (existing) {
    return existing;
  }

  const passwordHash = await hashPassword(password, bcrypt);
  const { rows } = await query(
    'INSERT INTO users (id, username, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *',
    [generateId(), normalizedUsername, passwordHash, role]
  );
  return rows[0];
}

async function ensureDietPlanSeed(userId) {
  for (const [index, plan] of dietPlansSeed.entries()) {
    const planId = plan.id || `diet_plan_${crypto.randomUUID()}`;
    const { rows } = await query('SELECT id FROM diet_plans WHERE id = $1', [planId]);
    if (rows.length > 0) {
      continue;
    }

    const payload = {
      ...plan,
      id: planId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      isActive: index === 0
    };

    await query(
      'INSERT INTO diet_plans (id, user_id, payload, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, now(), now())',
      [planId, userId, payload, index === 0]
    );
  }
}

async function ensureMealSeed(userId) {
  for (const meal of mealsSeed) {
    const mealId = meal.id || `meal_${crypto.randomUUID()}`;
    const { rows } = await query('SELECT id FROM meals WHERE id = $1', [mealId]);
    if (rows.length > 0) {
      continue;
    }

    const createdDate = meal.created_date || meal.meal_date || new Date().toISOString();
    const payload = {
      ...meal,
      id: mealId,
      created_date: createdDate
    };
    const createdAt = new Date(createdDate);

    await query(
      'INSERT INTO meals (id, user_id, payload, created_at, updated_at) VALUES ($1, $2, $3, $4, $4)',
      [mealId, userId, payload, Number.isNaN(createdAt.getTime()) ? new Date() : createdAt]
    );
  }
}

async function ensureMeasurementDefaults(userId) {
  const { rows } = await query('SELECT user_id FROM measurement_layouts WHERE user_id = $1', [userId]);
  if (rows.length > 0) {
    return;
  }

  await query(
    'INSERT INTO measurement_layouts (user_id, positions, updated_at) VALUES ($1, $2, now())',
    [userId, DEFAULT_MEASUREMENT_POSITIONS]
  );
}

async function seedInitialData(bcrypt) {
  const sampleUser = await ensureUser(
    { username: 'sample_user', password: 'sampleUser234!@', role: 'user' },
    bcrypt
  );
  const adminUser = await ensureUser(
    { username: 'admin', password: 'sampleAdmin234!@', role: 'admin' },
    bcrypt
  );

  await ensureMealSeed(sampleUser.id);
  await ensureDietPlanSeed(sampleUser.id);
  await ensureMeasurementDefaults(sampleUser.id);
  await ensureMeasurementDefaults(adminUser.id);
}

module.exports = {
  ensureSchema,
  seedInitialData,
  query,
  getUserByUsername,
  getUserById,
  hashPassword,
  verifyPassword,
  createSession,
  getSession,
  deleteSession,
  ensureMeasurementDefaults
};
