// Check constraints on hq_settlement_summaries
require('dotenv').config();
const { pool } = require('../src/config/db');

async function check() {
  try {
    // Get indexes
    const indexes = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'hq_settlement_summaries'
    `);
    console.log('Indexes on hq_settlement_summaries:');
    indexes.rows.forEach(row => console.log(`  ${row.indexname}`));

    // Get constraints
    const constraints = await pool.query(`
      SELECT conname, contype, pg_get_constraintdef(oid) as definition
      FROM pg_constraint
      WHERE conrelid = 'hq_settlement_summaries'::regclass
    `);
    console.log('\nConstraints:');
    constraints.rows.forEach(row => console.log(`  ${row.conname} (${row.contype}): ${row.definition}`));

    // Try to create the unique constraint if it doesn't exist
    const hasUniqueConstraint = constraints.rows.some(
      c => c.definition && c.definition.includes('hq_settlement_id') && c.definition.includes('currency')
    );

    if (!hasUniqueConstraint) {
      console.log('\nMissing unique constraint! Creating it...');
      await pool.query(`
        ALTER TABLE hq_settlement_summaries
        ADD CONSTRAINT hq_settlement_summaries_unique_currency
        UNIQUE (hq_settlement_id, currency)
      `);
      console.log('Constraint created successfully!');
    } else {
      console.log('\nUnique constraint exists.');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

check();
