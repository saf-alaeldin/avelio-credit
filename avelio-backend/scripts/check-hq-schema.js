// Check HQ settlements schema
require('dotenv').config();
const { pool } = require('../src/config/db');

async function check() {
  try {
    // Get column names for hq_settlements
    const cols = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'hq_settlements'
      ORDER BY ordinal_position
    `);

    console.log('hq_settlements columns:');
    cols.rows.forEach(c => {
      console.log(`  - ${c.column_name} (${c.data_type}, nullable: ${c.is_nullable})`);
    });

    // Get column names for hq_settlement_summaries
    const sumCols = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'hq_settlement_summaries'
      ORDER BY ordinal_position
    `);

    console.log('\nhq_settlement_summaries columns:');
    sumCols.rows.forEach(c => {
      console.log(`  - ${c.column_name} (${c.data_type}, nullable: ${c.is_nullable})`);
    });

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

check();
