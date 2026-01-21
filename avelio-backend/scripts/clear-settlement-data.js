const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'avelio_credit',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

async function run() {
  try {
    // List settlement-related tables
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      AND (table_name LIKE '%settlement%' OR table_name LIKE '%summary%')
      ORDER BY table_name
    `);

    console.log('Settlement-related tables found:');
    for (const t of tables.rows) {
      const count = await pool.query(`SELECT COUNT(*) FROM ${t.table_name}`);
      console.log(`  ${t.table_name}: ${count.rows[0].count} records`);
    }

    console.log('\n--- Clearing data ---\n');

    // Clear tables in correct order (child tables first due to foreign keys)
    const tablesToClear = [
      'settlement_summary_expenses',
      'settlement_agent_entries',
      'settlement_summaries',
      'station_settlements'
    ];

    for (const tableName of tablesToClear) {
      try {
        const result = await pool.query(`DELETE FROM ${tableName}`);
        console.log(`Cleared ${tableName}: ${result.rowCount} records deleted`);
      } catch (err) {
        if (err.message.includes('does not exist')) {
          console.log(`Table ${tableName} does not exist, skipping`);
        } else {
          console.log(`Error clearing ${tableName}: ${err.message}`);
        }
      }
    }

    console.log('\n--- Done ---\n');

    // Verify
    console.log('Verification:');
    for (const t of tables.rows) {
      const count = await pool.query(`SELECT COUNT(*) FROM ${t.table_name}`);
      console.log(`  ${t.table_name}: ${count.rows[0].count} records`);
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

run();
