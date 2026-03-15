// Test the HQ Settlement endpoint
require('dotenv').config();
const { pool } = require('../src/config/db');

async function test() {
  try {
    // Check if hq_settlements table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'hq_settlements'
      )
    `);
    console.log('hq_settlements table exists:', tableCheck.rows[0].exists);

    // Check if generate_hq_settlement_number function exists
    const funcCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM pg_proc
        WHERE proname = 'generate_hq_settlement_number'
      )
    `);
    console.log('generate_hq_settlement_number function exists:', funcCheck.rows[0].exists);

    // Try to generate a number
    if (funcCheck.rows[0].exists) {
      const numResult = await pool.query(
        "SELECT generate_hq_settlement_number('2026-01-12'::date) as number"
      );
      console.log('Generated number:', numResult.rows[0].number);
    }

    // Check existing hq_settlements
    const existing = await pool.query('SELECT * FROM hq_settlements LIMIT 5');
    console.log('Existing HQ settlements:', existing.rows.length);

  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

test();
