// src/config/db.js
require('dotenv').config();
const { Pool } = require('pg');

// Determine if we're in production (Render) or local development
const isProduction = process.env.NODE_ENV === 'production';

// Configure connection based on environment
let poolConfig;

if (isProduction && process.env.DATABASE_URL) {
  // Production: Use DATABASE_URL from Render
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false // Required for Render PostgreSQL
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
} else {
  // Local development: Use individual environment variables
  poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'avelio_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    max: 50, // Increased pool size for better concurrent handling
    min: 5,  // Keep minimum connections ready
    idleTimeoutMillis: 60000, // Increased to 60s to keep connections alive longer
    connectionTimeoutMillis: 10000, // Increased to 10s for slower networks
    statement_timeout: 30000, // 30s query timeout
  };
}

// Create a single connection pool
const pool = new Pool(poolConfig);

// Log connection success / failure
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
  process.exit(-1);
});

// Optional helper for queries
const query = async (text, params) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log('Executed query', { text, duration, rows: res.rowCount });
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