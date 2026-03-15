// src/config/db.js
require('dotenv').config();
const { Pool, types } = require('pg');

// Configure pg to return DATE as string (YYYY-MM-DD) instead of JavaScript Date
// This prevents timezone conversion issues
types.setTypeParser(1082, (val) => val); // DATE type
types.setTypeParser(1114, (val) => val); // TIMESTAMP WITHOUT TIME ZONE
types.setTypeParser(1184, (val) => val); // TIMESTAMP WITH TIME ZONE

// Determine if we're in production (Render) or local development
const isProduction = process.env.NODE_ENV === 'production';

// Configure connection based on environment
let poolConfig;

// Query timeout for application-level protection (ms)
const QUERY_TIMEOUT_MS = parseInt(process.env.QUERY_TIMEOUT_MS || '120000', 10); // 120s default

if (isProduction && process.env.DATABASE_URL) {
  // Production: Use DATABASE_URL from Render
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false // Required for Render PostgreSQL
    },
    max: 50,  // Production needs more connections for concurrent users
    min: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    statement_timeout: QUERY_TIMEOUT_MS,
  };
} else {
  // Local development: Use individual environment variables
  poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'avelio_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    max: 20,  // Development needs fewer connections
    min: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    statement_timeout: QUERY_TIMEOUT_MS,
  };
}

// Create a single connection pool
const pool = new Pool(poolConfig);

// Log connection success / failure and set timezone
pool.on('connect', (client) => {
  console.log('✅ Connected to PostgreSQL database');
  // Set timezone to Africa/Juba (UTC+2) for this connection
  client.query("SET timezone = 'Africa/Juba'");
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
  process.exit(-1);
});

// Slow query threshold (ms) - only log queries slower than this
const SLOW_QUERY_MS = parseInt(process.env.SLOW_QUERY_MS || '1000', 10);

// Query helper with timeout protection and slow query logging
const query = async (text, params) => {
  const start = Date.now();
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Query timeout after ${QUERY_TIMEOUT_MS}ms`)), QUERY_TIMEOUT_MS);
  });

  const res = await Promise.race([
    pool.query(text, params),
    timeoutPromise
  ]);

  const duration = Date.now() - start;
  if (duration >= SLOW_QUERY_MS) {
    console.warn('Slow query detected', { text: text.substring(0, 200), duration, rows: res.rowCount });
  }
  return res;
};

// Optional connection test
const testConnection = async () => {
  try {
    const result = await pool.query('SELECT NOW() AS current_time');
    console.log('📅 Database time:', result.rows[0].current_time);
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    throw error;
  }
};

module.exports = { pool, query, testConnection };