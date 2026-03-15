#!/usr/bin/env node
/**
 * Database setup script for Railway deployment.
 * Runs schema.sql followed by all numbered migrations in order.
 *
 * Usage: node avelio-backend/scripts/setup-database.js
 *
 * Requires DATABASE_URL or DB_* environment variables.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const isProduction = process.env.NODE_ENV === 'production';

let poolConfig;
if (isProduction && process.env.DATABASE_URL) {
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  };
} else {
  poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'avelio_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
  };
}

const pool = new Pool(poolConfig);

async function runSQL(filePath, label) {
  const sql = fs.readFileSync(filePath, 'utf8');
  try {
    await pool.query(sql);
    console.log(`  OK: ${label}`);
  } catch (err) {
    // Ignore "already exists" errors for idempotent migrations
    if (err.code === '42P07' || err.code === '42710' || err.code === '42701') {
      console.log(`  SKIP (already exists): ${label}`);
    } else {
      console.error(`  FAIL: ${label} - ${err.message}`);
    }
  }
}

async function main() {
  console.log('Avelio Credit - Database Setup');
  console.log('==============================\n');

  // Test connection
  try {
    const res = await pool.query('SELECT NOW()');
    console.log(`Connected to database. Server time: ${res.rows[0].now}\n`);
  } catch (err) {
    console.error('Failed to connect to database:', err.message);
    process.exit(1);
  }

  // 1. Run base schema
  const schemaPath = path.join(__dirname, '..', 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    console.log('Running base schema...');
    await runSQL(schemaPath, 'schema.sql');
  }

  // 2. Run numbered migrations in order
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  if (fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql') && /^\d{3}/.test(f))
      .sort();

    console.log(`\nRunning ${files.length} migrations...`);
    for (const file of files) {
      await runSQL(path.join(migrationsDir, file), file);
    }
  }

  // 3. Run additional migrations (non-numbered)
  const additionalMigrations = [
    'add_station_settlement.sql',
    'add_partial_payments.sql',
  ];

  console.log('\nRunning additional migrations...');
  for (const file of additionalMigrations) {
    const filePath = path.join(__dirname, '..', 'migrations', file);
    if (fs.existsSync(filePath)) {
      await runSQL(filePath, file);
    }
  }

  console.log('\nDatabase setup complete!');
  await pool.end();
  process.exit(0);
}

main().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
