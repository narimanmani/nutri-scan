/* eslint-env node */
const { Pool } = require('@neondatabase/serverless');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { readFileSync } = require('fs');
const { resolve } = require('path');

const CONNECTION_URL = process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DATABASE_URL_UNPOOLED;

if (!CONNECTION_URL) {
  console.warn('Neon connection string is not configured. Set NETLIFY_DATABASE_URL.');
}

let pool;
let schemaReady = false;

function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: CONNECTION_URL });
  }
  return pool;
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function generateToken(length = 64) {
  const bytes = crypto.randomBytes(Math.ceil((length * 3) / 4));
  return bytes
    .toString('base64url')
    .slice(0, length);
}

function loadJson(relativePath) {
  try {
    const filePath = resolve(__dirname, '../../', relativePath);
    const content = readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.warn(`Failed to load JSON seed from ${relativePath}:`, error);
    return [];
  }
}

function isForeignKeyError(error) {
  if (!error) {
    return false;
  }
  const normalizedMessage = String(error.message || '').toLowerCase();
  return (
    error.code === '42830' ||
    error.code === '0A000' ||
    normalizedMessage.includes('foreign key constraint')
  );
}

async function createTableWithFallback(client, tableName, primarySql, fallbackSql) {
  const savepoint = `sp_${tableName}`.replace(/[^a-zA-Z0-9_]/g, '_');
  await client.query(`SAVEPOINT ${savepoint}`);
  try {
    await client.query(primarySql);
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  } catch (error) {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    if (isForeignKeyError(error) && fallbackSql) {
      console.warn(
        `Falling back to reduced constraints for ${tableName} due to foreign key error: ${error.message}`
      );
      await client.query(fallbackSql);
    } else if (error?.code === '42P07') {
      // Table already exists with incompatible definition; ignore to keep bootstrap resilient.
      console.warn(`Table ${tableName} already exists with a differing definition. Continuing.`);
    } else {
      throw error;
    }
  }
}

async function ensureColumn(client, tableName, columnName, columnDefinition, options = {}) {
  const { postAddStatements = [] } = options;
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
    [tableName, columnName]
  );

  if (rows.length > 0) {
    return false;
  }

  try {
    await client.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
    for (const statement of postAddStatements) {
      await client.query(statement);
    }
    return true;
  } catch (error) {
    console.error(`Failed to add column ${columnName} to ${tableName}:`, error);
    return false;
  }
}

async function ensureUniqueIndex(client, indexSql, identifier) {
  try {
    await client.query(indexSql);
  } catch (error) {
    if (error?.code === '23505') {
      console.warn(
        `Unable to create unique index ${identifier} due to duplicate data; existing records will be left as-is.`
      );
    } else {
      throw error;
    }
  }
}

async function ensureSchema() {
  if (schemaReady || !CONNECTION_URL) {
    return;
  }

  const client = await getPool().connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await createTableWithFallback(
      client,
      'sessions',
      `
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMPTZ NOT NULL
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          token_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMPTZ NOT NULL
        )
      `
    );

    await createTableWithFallback(
      client,
      'meals',
      `
        CREATE TABLE IF NOT EXISTS meals (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          payload JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS meals (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          payload JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
    );

    await createTableWithFallback(
      client,
      'diet_plans',
      `
        CREATE TABLE IF NOT EXISTS diet_plans (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          payload JSONB NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS diet_plans (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          payload JSONB NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
    );

    await createTableWithFallback(
      client,
      'measurement_positions',
      `
        CREATE TABLE IF NOT EXISTS measurement_positions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          kind TEXT NOT NULL,
          payload JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (user_id, kind)
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS measurement_positions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          payload JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (user_id, kind)
        )
      `
    );

    await createTableWithFallback(
      client,
      'measurement_history',
      `
        CREATE TABLE IF NOT EXISTS measurement_history (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          payload JSONB NOT NULL,
          recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS measurement_history (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          payload JSONB NOT NULL,
          recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
    );

    await ensureColumn(
      client,
      'measurement_history',
      'payload',
      'JSONB',
      {
        postAddStatements: [
          "UPDATE measurement_history SET payload = '{}'::jsonb WHERE payload IS NULL",
          "ALTER TABLE measurement_history ALTER COLUMN payload SET DEFAULT '{}'::jsonb",
          'ALTER TABLE measurement_history ALTER COLUMN payload SET NOT NULL',
          'ALTER TABLE measurement_history ALTER COLUMN payload DROP DEFAULT',
        ],
      }
    );

    await ensureUniqueIndex(
      client,
      'CREATE UNIQUE INDEX IF NOT EXISTS measurement_positions_user_kind_idx ON measurement_positions (user_id, kind)',
      'measurement_positions_user_kind_idx'
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await seedDefaults();
  schemaReady = true;
}

async function findUserByUsername(username) {
  const result = await getPool().query('SELECT * FROM users WHERE username = $1 LIMIT 1', [username]);
  return result.rows[0] || null;
}

async function createUser({ username, password, role = 'user' }) {
  const hash = await bcrypt.hash(password, 10);
  const id = createId('user');
  await getPool().query(
    'INSERT INTO users (id, username, password_hash, role) VALUES ($1, $2, $3, $4)',
    [id, username, hash, role]
  );
  return { id, username, role };
}

function mealFromPayload(userId, payload) {
  const createdDate = payload.created_date || payload.createdAt || new Date().toISOString();
  const normalized = { ...payload, created_date: createdDate, user_id: userId };
  return normalized;
}

async function seedDefaults() {
  const sampleUser = await findUserByUsername('sample_user');
  const adminUser = await findUserByUsername('admin');

  let sampleUserId = sampleUser?.id;
  let adminUserId = adminUser?.id;

  if (!sampleUserId) {
    const created = await createUser({ username: 'sample_user', password: 'sampleUser234!@', role: 'user' });
    sampleUserId = created.id;
  }

  if (!adminUserId) {
    const created = await createUser({ username: 'admin', password: 'sampleAdmin234!@', role: 'admin' });
    adminUserId = created.id;
  }

  if (!sampleUserId) {
    return;
  }

  const mealsSeed = loadJson('src/data/meals.json');
  const dietPlansSeed = loadJson('src/data/dietPlans.json');
  const measurementDefaultsSeed = loadJson('src/data/bodyMeasurementDefaults.json');
  const measurementHistorySeed = loadJson('src/data/sampleMeasurementHistory.json');

  const { rows: existingMealCountRows } = await getPool().query(
    'SELECT COUNT(*)::int AS count FROM meals WHERE user_id = $1',
    [sampleUserId]
  );
  if ((existingMealCountRows[0]?.count || 0) === 0 && mealsSeed.length > 0) {
    for (const meal of mealsSeed) {
      const mealId = meal.id || createId('meal');
      await getPool().query(
        'INSERT INTO meals (id, user_id, payload, created_at, updated_at) VALUES ($1, $2, $3::jsonb, COALESCE($4::timestamptz, NOW()), NOW()) ON CONFLICT (id) DO NOTHING',
        [mealId, sampleUserId, JSON.stringify(mealFromPayload(sampleUserId, meal)), meal.created_date || meal.createdAt]
      );
    }
  }

  const { rows: planCountRows } = await getPool().query(
    'SELECT COUNT(*)::int AS count FROM diet_plans WHERE user_id = $1',
    [sampleUserId]
  );
  if ((planCountRows[0]?.count || 0) === 0 && dietPlansSeed.length > 0) {
    for (const plan of dietPlansSeed) {
      const planId = plan.id || createId('diet_plan');
      const isActive = Boolean(plan.isActive || plan.is_active);
      await getPool().query(
        'INSERT INTO diet_plans (id, user_id, payload, is_active, created_at, updated_at) VALUES ($1, $2, $3::jsonb, $4, COALESCE($5::timestamptz, NOW()), NOW()) ON CONFLICT (id) DO NOTHING',
        [planId, sampleUserId, JSON.stringify({ ...plan, user_id: sampleUserId }), isActive, plan.created_at || plan.createdAt]
      );
    }
  }

  const { rows: defaultCountRows } = await getPool().query(
    "SELECT COUNT(*)::int AS count FROM measurement_positions WHERE user_id = $1 AND kind = 'default'",
    [sampleUserId]
  );
  if ((defaultCountRows[0]?.count || 0) === 0 && measurementDefaultsSeed && Object.keys(measurementDefaultsSeed).length > 0) {
    await getPool().query(
      `INSERT INTO measurement_positions (id, user_id, kind, payload)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (user_id, kind) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
      [createId('measurement_default'), sampleUserId, 'default', JSON.stringify(measurementDefaultsSeed)]
    );
  }

  const { rows: historyCountRows } = await getPool().query(
    'SELECT COUNT(*)::int AS count FROM measurement_history WHERE user_id = $1',
    [sampleUserId]
  );
  if ((historyCountRows[0]?.count || 0) === 0 && Array.isArray(measurementHistorySeed)) {
    for (const entry of measurementHistorySeed) {
      const historyId = entry.id || createId('measurement_history');
      await getPool().query(
        'INSERT INTO measurement_history (id, user_id, payload, recorded_at) VALUES ($1, $2, $3::jsonb, COALESCE($4::timestamptz, NOW())) ON CONFLICT (id) DO NOTHING',
        [historyId, sampleUserId, JSON.stringify({ ...entry, user_id: sampleUserId }), entry.recordedAt || entry.recorded_at]
      );
    }
  }
}

async function verifyPassword(user, password) {
  if (!user || !password) {
    return false;
  }
  return bcrypt.compare(password, user.password_hash);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function createSession(userId, ttlHours = 48) {
  const token = generateToken(64);
  const tokenHash = hashToken(token);
  const id = createId('session');
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  await getPool().query(
    'INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
    [id, userId, tokenHash, expiresAt]
  );
  return { id, token, expiresAt };
}

async function getSession(token) {
  if (!token) {
    return null;
  }
  const tokenHash = hashToken(token);
  const result = await getPool().query(
    'SELECT sessions.*, users.username, users.role FROM sessions JOIN users ON sessions.user_id = users.id WHERE token_hash = $1 AND expires_at > NOW() LIMIT 1',
    [tokenHash]
  );
  return result.rows[0] || null;
}

async function deleteSession(token) {
  if (!token) {
    return;
  }
  const tokenHash = hashToken(token);
  await getPool().query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
}

async function upsertMeasurementPositions({ userId, kind, payload }) {
  const id = createId('measurement');
  await getPool().query(
    `INSERT INTO measurement_positions (id, user_id, kind, payload)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (user_id, kind) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
    [id, userId, kind, JSON.stringify(payload)]
  );
}

module.exports = {
  ensureSchema,
  getPool,
  createUser,
  findUserByUsername,
  verifyPassword,
  createSession,
  getSession,
  deleteSession,
  upsertMeasurementPositions,
};
