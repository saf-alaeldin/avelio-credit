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
    console.log('=== CLEARING ALL SETTLEMENT DATA FOR LAUNCH ===\n');

    // Clear tables in correct order (child tables first)
    const tablesToClear = [
      // Station settlement related
      'settlement_agent_entries',
      'settlement_expenses',
      'settlement_summaries',
      'settlement_audit_logs',
      'settlements',
      // HQ settlement related
      'hq_settlement_audit_logs',
      'hq_settlement_expenses',
      'hq_settlement_stations',
      'hq_settlement_summaries',
      'hq_settlements'
    ];

    for (const tableName of tablesToClear) {
      try {
        const countBefore = await pool.query(`SELECT COUNT(*) FROM ${tableName}`);
        const result = await pool.query(`DELETE FROM ${tableName}`);
        console.log(`${tableName}: ${countBefore.rows[0].count} -> 0 (deleted ${result.rowCount})`);
      } catch (err) {
        if (err.message.includes('does not exist')) {
          console.log(`${tableName}: table does not exist, skipping`);
        } else {
          console.log(`${tableName}: ERROR - ${err.message}`);
        }
      }
    }

    console.log('\n=== VERIFICATION ===\n');

    // Verify all tables are empty
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      AND (table_name LIKE '%settlement%' OR table_name LIKE '%summary%')
      ORDER BY table_name
    `);

    for (const t of tables.rows) {
      const count = await pool.query(`SELECT COUNT(*) FROM ${t.table_name}`);
      const status = count.rows[0].count === '0' ? '✓' : '✗';
      console.log(`${status} ${t.table_name}: ${count.rows[0].count} records`);
    }

    console.log('\n=== DONE ===');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

run();
