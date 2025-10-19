const { Pool } = require('pg');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function randomUUID() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

let mealsSeed = [];
let dietPlansSeed = [];
let measurementHistorySeed = [];

function loadSeed(relativePath, label) {
  try {
    const resolvedPath = path.resolve(__dirname, relativePath);
    if (!fs.existsSync(resolvedPath)) {
      console.warn(`${label} seed data unavailable at ${resolvedPath}, continuing without sample data.`);
      return [];
    }

    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(resolvedPath);
  } catch (error) {
    console.warn(`${label} seed data unavailable, continuing without sample data.`, error);
    return [];
  }
}

mealsSeed = loadSeed('../../src/data/meals.json', 'Meal');
dietPlansSeed = loadSeed('../../src/data/dietPlans.json', 'Diet plan');
measurementHistorySeed = loadSeed('../../src/data/measurementHistory.json', 'Measurement history');

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

async function columnExists(tableName, columnName) {
  const { rows } = await query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = $1
        AND column_name = $2
      LIMIT 1;
    `,
    [tableName, columnName]
  );

  return rows.length > 0;
}

async function getColumnInfo(tableName, columnName) {
  const { rows } = await query(
    `
      SELECT data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = $1
        AND column_name = $2
      LIMIT 1;
    `,
    [tableName, columnName]
  );

  return rows[0] || null;
}

async function ensureJsonbColumn(tableName, columnName, keyColumn, { enforceNotNull = true } = {}) {
  const info = await getColumnInfo(tableName, columnName);

  if (!info) {
    await query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} jsonb DEFAULT '{}'::jsonb;`);
  } else if (info.udt_name !== 'jsonb') {
    const tempColumn = `${columnName}_jsonb_fix`;
    await query(`ALTER TABLE ${tableName} ADD COLUMN ${tempColumn} jsonb;`);

    const { rows } = await query(`SELECT ${keyColumn} AS key, ${columnName} AS value FROM ${tableName}`);
    for (const row of rows) {
      const { key, value } = row;
      let parsed = {};

      if (value === null || value === undefined || value === '') {
        parsed = {};
      } else if (typeof value === 'object') {
        parsed = value;
      } else if (typeof value === 'string') {
        try {
          parsed = JSON.parse(value);
        } catch (error) {
          parsed = {};
        }
      } else {
        parsed = value;
      }

      await query(
        `UPDATE ${tableName} SET ${tempColumn} = $1 WHERE ${keyColumn} IS NOT DISTINCT FROM $2`,
        [parsed, key]
      );
    }

    await query(`ALTER TABLE ${tableName} DROP COLUMN ${columnName};`);
    await query(`ALTER TABLE ${tableName} RENAME COLUMN ${tempColumn} TO ${columnName};`);
  }

  await query(`UPDATE ${tableName} SET ${columnName} = '{}'::jsonb WHERE ${columnName} IS NULL;`);
  await query(`ALTER TABLE ${tableName} ALTER COLUMN ${columnName} SET DEFAULT '{}'::jsonb;`);

  if (enforceNotNull) {
    await query(`ALTER TABLE ${tableName} ALTER COLUMN ${columnName} SET NOT NULL;`);
  }
}

async function ensureForeignKey(tableName, constraintName, definition) {
  await query(
    `
      DO $$
      BEGIN
        ALTER TABLE ${tableName}
          ADD CONSTRAINT ${constraintName} ${definition};
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END;
      $$;
    `
  );
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

  const hasPasswordHashColumn = await columnExists('users', 'password_hash');
  if (!hasPasswordHashColumn) {
    await query('ALTER TABLE users ADD COLUMN password_hash text;');
  }

  const hasRoleColumn = await columnExists('users', 'role');
  if (!hasRoleColumn) {
    await query("ALTER TABLE users ADD COLUMN role text DEFAULT 'user';");
  }

  const hasCreatedAtColumn = await columnExists('users', 'created_at');
  if (!hasCreatedAtColumn) {
    await query("ALTER TABLE users ADD COLUMN created_at timestamptz DEFAULT now();");
  }

  await query('UPDATE users SET username = lower(username) WHERE username IS NOT NULL;');

  const hasLegacyPasswordColumn = await columnExists('users', 'password');
  if (hasLegacyPasswordColumn) {
    const { rows: legacyPasswords } = await query(
      "SELECT id, password FROM users WHERE password IS NOT NULL AND password <> ''"
    );

    for (const row of legacyPasswords) {
      const { id, password } = row;
      if (typeof password !== 'string' || password.length === 0) {
        continue;
      }

      let nextHash = password;
      if (!isBcryptHash(nextHash) && !nextHash.startsWith(`${PASSWORD_PREFIX}$`)) {
        nextHash = await hashPassword(password);
      }

      await query('UPDATE users SET password_hash = $1 WHERE id = $2', [nextHash, id]);
    }
  }

  const { rows: missingHashes } = await query(
    "SELECT id, lower(username) AS username FROM users WHERE password_hash IS NULL OR password_hash = ''"
  );

  for (const row of missingHashes) {
    const { id, username } = row;
    let password = 'sampleUser234!@';
    if (username === 'admin') {
      password = 'sampleAdmin234!@';
    }

    const passwordHash = await hashPassword(password);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, id]);
  }

  await query("UPDATE users SET role = 'admin' WHERE lower(username) = 'admin'");
  await query(
    "UPDATE users SET role = 'user' WHERE role IS NULL OR role NOT IN ('user','admin')"
  );

  await query('UPDATE users SET created_at = now() WHERE created_at IS NULL;');
  await query("ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user';");
  await query("ALTER TABLE users ALTER COLUMN created_at SET DEFAULT now();");

  await query(`
    DO $$
    BEGIN
      ALTER TABLE users
        ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin'));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
    $$;
  `);

  await query('ALTER TABLE users DROP COLUMN IF EXISTS password;');

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
      user_id uuid REFERENCES users(id) ON DELETE CASCADE,
      payload jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await query(`
    ALTER TABLE meals
    ADD COLUMN IF NOT EXISTS user_id uuid;
  `);

  await query(`
    ALTER TABLE meals
    ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
  `);

  await query(`
    ALTER TABLE meals
    ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
  `);

  await query(`
    UPDATE meals SET created_at = now() WHERE created_at IS NULL;
  `);

  await query(`
    UPDATE meals SET updated_at = created_at WHERE updated_at IS NULL;
  `);

  await ensureJsonbColumn('meals', 'payload', 'id');

  await ensureForeignKey('meals', 'meals_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE');

  await query(`
    CREATE TABLE IF NOT EXISTS diet_plans (
      id text PRIMARY KEY,
      user_id uuid REFERENCES users(id) ON DELETE CASCADE,
      payload jsonb NOT NULL,
      is_active boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await query(`
    ALTER TABLE diet_plans
    ADD COLUMN IF NOT EXISTS user_id uuid;
  `);

  await query(`
    ALTER TABLE diet_plans
    ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT false;
  `);

  await query(`
    ALTER TABLE diet_plans
    ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
  `);

  await query(`
    ALTER TABLE diet_plans
    ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
  `);

  await query(`
    UPDATE diet_plans SET is_active = false WHERE is_active IS NULL;
  `);

  await query(`
    UPDATE diet_plans SET created_at = now() WHERE created_at IS NULL;
  `);

  await query(`
    UPDATE diet_plans SET updated_at = created_at WHERE updated_at IS NULL;
  `);

  await ensureJsonbColumn('diet_plans', 'payload', 'id');

  await ensureForeignKey(
    'diet_plans',
    'diet_plans_user_id_fkey',
    'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'
  );

  await query(`
    CREATE TABLE IF NOT EXISTS measurement_layouts (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      positions jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const hasMeasurementLayoutUserId = await columnExists('measurement_layouts', 'user_id');
  if (!hasMeasurementLayoutUserId) {
    await query('ALTER TABLE measurement_layouts ADD COLUMN user_id uuid;');
  }

  const hasMeasurementLayoutPositions = await columnExists('measurement_layouts', 'positions');
  if (!hasMeasurementLayoutPositions) {
    await query("ALTER TABLE measurement_layouts ADD COLUMN positions jsonb DEFAULT '{}'::jsonb;");
  }

  const hasMeasurementLayoutUpdatedAt = await columnExists('measurement_layouts', 'updated_at');
  if (!hasMeasurementLayoutUpdatedAt) {
    await query("ALTER TABLE measurement_layouts ADD COLUMN updated_at timestamptz DEFAULT now();");
  }

  await query('UPDATE measurement_layouts SET updated_at = now() WHERE updated_at IS NULL;');

  await ensureJsonbColumn('measurement_layouts', 'positions', 'user_id');

  await query('ALTER TABLE measurement_layouts DROP COLUMN IF EXISTS id;');

  await ensureForeignKey(
    'measurement_layouts',
    'measurement_layouts_user_id_fkey',
    'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'
  );

  await query(`
    CREATE TABLE IF NOT EXISTS measurement_history (
      id uuid PRIMARY KEY,
      user_id uuid REFERENCES users(id) ON DELETE CASCADE,
      entry jsonb NOT NULL,
      recorded_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await query(`
    ALTER TABLE measurement_history
    ADD COLUMN IF NOT EXISTS user_id uuid;
  `);

  await query(`
    ALTER TABLE measurement_history
    ADD COLUMN IF NOT EXISTS recorded_at timestamptz DEFAULT now();
  `);

  await ensureJsonbColumn('measurement_history', 'entry', 'id');

  const hasLegacyPayloadColumn = await columnExists('measurement_history', 'payload');
  if (hasLegacyPayloadColumn) {
    const { rows } = await query(
      'SELECT id, payload FROM measurement_history WHERE payload IS NOT NULL'
    );

    for (const row of rows) {
      const { id, payload } = row;
      let entry = {};

      if (payload && typeof payload === 'object') {
        entry = payload;
      } else if (typeof payload === 'string') {
        try {
          entry = JSON.parse(payload);
        } catch (error) {
          entry = {};
        }
      }

      await query('UPDATE measurement_history SET entry = $1 WHERE id = $2', [entry, id]);
    }

    await query('ALTER TABLE measurement_history DROP COLUMN IF EXISTS payload;');
  }

  await query(`
    UPDATE measurement_history SET recorded_at = now() WHERE recorded_at IS NULL;
  `);

  await ensureForeignKey(
    'measurement_history',
    'measurement_history_user_id_fkey',
    'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'
  );
}

// Backwards compatibility for older bundled builds that still invoke
// `ensureSchemaN` helpers. Netlify's deployment pipeline can cache prior versions of the API
// handler, so exporting stable aliases prevents runtime `TypeError: ensureSchemaX is not a
// function` errors when the database module ships without the legacy names. We provide a generous
// range of aliases so future bootstrap iterations continue to work even if a deployment lags
// behind several versions. The aliases are generated eagerly and attached after `module.exports`
// is assigned so every consumer (CommonJS or bundled) receives callable functions.
const ensureSchemaAliasVersions = Array.from({ length: 100 }, (_, index) => index + 2);

function createEnsureSchemaAlias(version) {
  const alias = async function ensureSchemaAlias(...args) {
    return ensureSchema(...args);
  };

  try {
    Object.defineProperty(alias, 'name', {
      value: `ensureSchema${version}`,
      configurable: true
    });
  } catch (error) {
    // Some runtimes disallow redefining the function name; ignore the failure because the
    // callable alias is still usable.
  }

  return alias;
}

function attachEnsureSchemaAliases(target) {
  if (!target || typeof target !== 'object') {
    return;
  }

  for (const version of ensureSchemaAliasVersions) {
    const aliasName = `ensureSchema${version}`;

    if (typeof target[aliasName] === 'function') {
      continue;
    }

    Object.defineProperty(target, aliasName, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: createEnsureSchemaAlias(version)
    });
  }
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

const PASSWORD_SALT_BYTES = 16;
const PASSWORD_ITERATIONS = 120000;
const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_DIGEST = 'sha512';
const PASSWORD_PREFIX = 'pbkdf2';

function pbkdf2(password, salt, iterations, keyLength, digest) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, keyLength, digest, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}

function isBcryptHash(hash) {
  return typeof hash === 'string' && hash.startsWith('$2');
}

async function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Password must be a non-empty string');
  }

  const salt = crypto.randomBytes(PASSWORD_SALT_BYTES);
  const derivedKey = await pbkdf2(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST);

  return [
    PASSWORD_PREFIX,
    PASSWORD_ITERATIONS,
    PASSWORD_DIGEST,
    salt.toString('hex'),
    derivedKey.toString('hex')
  ].join('$');
}

async function verifyPassword(password, hash) {
  if (typeof hash !== 'string' || hash.length === 0) {
    return false;
  }

  if (isBcryptHash(hash)) {
    try {
      // Attempt to use bcrypt when the hash comes from an older installation
      // that stored credentials with bcrypt before the dependency became
      // unavailable in restricted environments.
      const bcrypt = require('bcryptjs');
      return bcrypt.compare(password, hash);
    } catch (error) {
      console.warn('Encountered legacy bcrypt hash but bcryptjs is unavailable.');
      return false;
    }
  }

  const parts = hash.split('$');
  if (parts.length !== 5 || parts[0] !== PASSWORD_PREFIX) {
    return false;
  }

  const iterations = Number.parseInt(parts[1], 10);
  const digest = parts[2];
  const salt = Buffer.from(parts[3], 'hex');
  const stored = Buffer.from(parts[4], 'hex');

  if (!Number.isFinite(iterations) || !digest || salt.length === 0 || stored.length === 0) {
    return false;
  }

  const derived = await pbkdf2(password, salt, iterations, stored.length, digest);
  if (derived.length !== stored.length) {
    return false;
  }

  return crypto.timingSafeEqual(stored, derived);
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateId() {
  return randomUUID();
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

async function ensureUser({ username, password, role }) {
  const normalizedUsername = String(username).trim().toLowerCase();
  const existing = await getUserByUsername(normalizedUsername);
  if (existing) {
    if (existing.password_hash && isBcryptHash(existing.password_hash)) {
      const passwordHash = await hashPassword(password);
      const { rows } = await query('UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING *', [
        passwordHash,
        existing.id
      ]);
      return rows[0];
    }
    return existing;
  }

  const passwordHash = await hashPassword(password);
  const { rows } = await query(
    'INSERT INTO users (id, username, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *',
    [generateId(), normalizedUsername, passwordHash, role]
  );
  return rows[0];
}

async function ensureDietPlanSeed(userId) {
  if (!Array.isArray(dietPlansSeed) || dietPlansSeed.length === 0) {
    return;
  }

  for (const [index, plan] of dietPlansSeed.entries()) {
    const planId = plan.id || `diet_plan_${randomUUID()}`;
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
  if (!Array.isArray(mealsSeed) || mealsSeed.length === 0) {
    return;
  }

  for (const meal of mealsSeed) {
    const mealId = meal.id || `meal_${randomUUID()}`;
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

function normalizeMeasurementEntry(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const entry = JSON.parse(JSON.stringify(raw));
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (typeof entry.id === 'string' && !uuidRegex.test(entry.id)) {
    entry.legacyId = entry.id;
    entry.id = randomUUID();
  }

  if (typeof entry.id !== 'string' || !uuidRegex.test(entry.id)) {
    entry.id = randomUUID();
  }

  entry.recordedAt = entry.recordedAt || new Date().toISOString();
  return entry;
}

async function ensureMeasurementHistorySeed(userId) {
  if (!Array.isArray(measurementHistorySeed) || measurementHistorySeed.length === 0) {
    return;
  }

  for (const rawEntry of measurementHistorySeed) {
    const entry = normalizeMeasurementEntry(rawEntry);
    if (!entry) {
      continue;
    }

    const { rows } = await query('SELECT id FROM measurement_history WHERE id = $1 AND user_id = $2', [
      entry.id,
      userId
    ]);

    if (rows.length > 0) {
      continue;
    }

    const recorded = new Date(entry.recordedAt);
    const timestamp = Number.isNaN(recorded.getTime()) ? new Date() : recorded;

    await query(
      'INSERT INTO measurement_history (id, user_id, entry, recorded_at) VALUES ($1, $2, $3, $4)',
      [entry.id, userId, entry, timestamp]
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

async function seedInitialData() {
  const sampleUser = await ensureUser({ username: 'sample_user', password: 'sampleUser234!@', role: 'user' });
  const adminUser = await ensureUser({ username: 'admin', password: 'sampleAdmin234!@', role: 'admin' });

  await ensureMealSeed(sampleUser.id);
  await ensureDietPlanSeed(sampleUser.id);
  await ensureMeasurementHistorySeed(sampleUser.id);
  await ensureMeasurementDefaults(sampleUser.id);
  await ensureMeasurementDefaults(adminUser.id);

  await query('UPDATE meals SET user_id = $1 WHERE user_id IS NULL', [sampleUser.id]);
  await query('UPDATE diet_plans SET user_id = $1 WHERE user_id IS NULL', [sampleUser.id]);
  await query('UPDATE measurement_layouts SET user_id = $1 WHERE user_id IS NULL', [sampleUser.id]);

  await query(`
    DELETE FROM measurement_layouts ml
    USING measurement_layouts dup
    WHERE ml.ctid < dup.ctid
      AND ml.user_id IS NOT DISTINCT FROM dup.user_id;
  `);

  const { rows: layoutNulls } = await query(
    'SELECT 1 FROM measurement_layouts WHERE user_id IS NULL LIMIT 1'
  );

  if (layoutNulls.length === 0) {
    await query('ALTER TABLE measurement_layouts ALTER COLUMN user_id SET NOT NULL');
    await query(`
      DO $$
      BEGIN
        ALTER TABLE measurement_layouts
          ADD CONSTRAINT measurement_layouts_pkey PRIMARY KEY (user_id);
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END;
      $$;
    `);
  }

  await query('UPDATE measurement_history SET user_id = $1 WHERE user_id IS NULL', [sampleUser.id]);
}

const exported = {
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

module.exports = exported;

// Align the CommonJS helpers so `exports` continues to mirror `module.exports` for bundlers that
// capture either reference.
exports = module.exports; // eslint-disable-line no-undef

// Attach the legacy aliases after exports are configured to ensure every consumer observes the
// callable functions.
attachEnsureSchemaAliases(module.exports);
attachEnsureSchemaAliases(exports); // eslint-disable-line no-undef
