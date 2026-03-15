const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Set SSP values as user specified
    const sspOpening = 8066000;
    const sspCash = 2630000;
    const sspExpenses = 320000;
    const sspToSafe = sspCash - sspExpenses; // 2,310,000
    const sspAvailable = sspOpening + sspCash; // 10,696,000

    console.log('=== Setting Jan 16 SSP ===\n');
    console.log('Opening Balance:', sspOpening.toLocaleString());
    console.log('Cash from Stations:', sspCash.toLocaleString());
    console.log('Total Available:', sspAvailable.toLocaleString());
    console.log('HQ Expenses:', sspExpenses.toLocaleString());
    console.log('To Safe:', sspToSafe.toLocaleString());

    await client.query(`
      UPDATE hq_settlement_summaries
      SET opening_balance = $1,
          cash_from_stations = $2,
          total_available = $3,
          total_hq_expenses = $4,
          safe_amount = $5,
          updated_at = CURRENT_TIMESTAMP
      WHERE hq_settlement_id = (SELECT id FROM hq_settlements WHERE summary_date::date = '2026-01-16')
        AND currency = 'SSP'
    `, [sspOpening, sspCash, sspAvailable, sspExpenses, sspToSafe]);

    await client.query('COMMIT');
    console.log('\n✓ SSP updated!');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err);
  } finally {
    client.release();
    await pool.end();
  }
})();
